/**
 * Word REAL (.docx) a partir del HTML que guarda el motor de documentos (docGenerador).
 *
 * Por qué (jefatura 2026-10-26): el «.doc» generado es HTML con cabecera de Office. Word del computador
 * lo abre, pero en el celular (Word móvil, Google Docs, la vista previa del iPhone y de WhatsApp) se ve
 * roto o en blanco: esperan un Word de verdad. La descarga convierte ese HTML a .docx (Office Open XML).
 * El HTML sigue siendo la fuente: se guarda igual y la vista de impresión no cambia, así que también
 * los documentos emitidos antes salen como .docx al descargarlos.
 *
 * El conversor (@turbodocx/html-to-docx) solo lee estilos EN LÍNEA: este módulo pasa a cada elemento las
 * reglas del <style> del documento (selectores simples: etiqueta, .clase y descendiente), lleva papel,
 * márgenes y letra del @page / body a las opciones del Word, y parte en párrafos los que traen <br> y
 * van justificados (Word estira la línea que termina en un salto manual y se veía «como    esto»).
 *
 * Lo que el conversor (1.23.1) no traduce bien se arregla antes o después de llamarlo:
 *  - margin-top no lo lee: se antepone un párrafo separador de esa altura;
 *  - margin-bottom solo en <p> y con unidad: se escribe explícito en cada <p>;
 *  - un borde de párrafo (la línea de firma) no existe: el bloque pasa a una celda con borde superior;
 *  - h1/h2 saldrían con el estilo «Título» de Word: pasan a <p> con su letra;
 *  - line-height sin unidad: se pasa a puntos exactos, como lo mide el navegador;
 *  - deja espacio después de cada párrafo y celdas con relleno ancho: se ajusta en el XML.
 */
const fs = require('fs');
const logger = require('../utils/logger-structured');

const MIME_DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/*
 * Dependencias del conversor, cargadas al PRIMER uso y no al arrancar: el cron instala un dep nuevo
 * (heal-deps → npm ci) recién en la pasada SIGUIENTE al deploy. Con require arriba, el backend no
 * levantaba esos minutos; así arranca igual, la descarga falla al convertir y entrega el .doc de siempre
 * (docxDeHtml) hasta que el dep está.
 */
let parseDocument;
let render;
let HTMLtoDOCX;
let JSZip;
function cargarDeps() {
    if (HTMLtoDOCX) return;
    ({ parseDocument } = require('htmlparser2'));
    render = require('dom-serializer').default;
    JSZip = require('jszip');
    HTMLtoDOCX = require('@turbodocx/html-to-docx');
}

const TWIP_POR = { cm: 566.929, mm: 56.6929, in: 1440, pt: 20, px: 15 };
const PAPELES = { A4: [21, 29.7], LETTER: [21.59, 27.94] };
/** Si el HTML no dice nada: A4, márgenes 2,5 cm, Times 12 (lo mismo que wrapHtml sin `pagina`). */
const DEFAULTS = { papel: [21, 29.7], margen: [2.5, 2.5, 2.5, 2.5], fuente: 'Times New Roman', tamanoPt: 12 };

/** '1.5cm' → twips (null si no se entiende). */
function aTwips(valor) {
    const m = String(valor).trim().match(/^(-?[\d.]+)\s*(cm|mm|in|pt|px)?$/i);
    if (!m) return null;
    return Math.round(Number(m[1]) * TWIP_POR[(m[2] || 'px').toLowerCase()]);
}

/** Quita comentarios y separa @page del resto. Devuelve { pages: [{nombre, decls}], reglas: [{selector, decls, orden}] }. */
function parseCss(css) {
    const limpio = String(css || '').replace(/\/\*[\s\S]*?\*\//g, '');
    const pages = [];
    const sinPage = limpio.replace(/@page\s*([\w-]*)\s*\{([^}]*)\}/g, (_, nombre, cuerpo) => {
        pages.push({ nombre: nombre || '', decls: parseDecls(cuerpo) });
        return '';
    });
    const reglas = [];
    let orden = 0;
    sinPage.replace(/([^{}]+)\{([^{}]*)\}/g, (_, sels, cuerpo) => {
        const decls = parseDecls(cuerpo);
        for (const s of sels.split(',')) {
            const selector = s.trim();
            if (selector) reglas.push({ selector, decls, orden: orden++ });
        }
        return '';
    });
    return { pages, reglas };
}

/** 'a: 1; b: 2' → [['a','1'],['b','2']] (orden conservado). */
function parseDecls(texto) {
    return String(texto || '').split(';').map(d => {
        const i = d.indexOf(':');
        return i < 0 ? null : [d.slice(0, i).trim().toLowerCase(), d.slice(i + 1).trim()];
    }).filter(d => d && d[0] && d[1]);
}

/** 'div.grid' → { tag: 'div', clases: ['grid'] }. */
function parseCompuesto(txt) {
    const m = txt.match(/^([a-z][a-z0-9]*)?((?:\.[\w-]+)*)$/i);
    if (!m) return null;
    return { tag: m[1] ? m[1].toLowerCase() : null, clases: m[2] ? m[2].split('.').filter(Boolean) : [] };
}

function coincide(el, comp) {
    if (comp.tag && el.name !== comp.tag) return false;
    if (!comp.clases.length) return true;
    const cls = String(el.attribs?.class || '').split(/\s+/);
    return comp.clases.every(c => cls.includes(c));
}

/** ¿El selector (compuestos separados por espacio = descendiente) aplica a `el`? */
function aplica(el, partes) {
    if (!coincide(el, partes[partes.length - 1])) return false;
    let i = partes.length - 2;
    let p = el.parent;
    while (i >= 0 && p) {
        if (p.type === 'tag' && coincide(p, partes[i])) i -= 1;
        p = p.parent;
    }
    return i < 0;
}

function especificidad(partes) {
    return partes.reduce((n, c) => n + c.clases.length * 10 + (c.tag ? 1 : 0), 0);
}

/** Recorre los elementos (htmlparser2 marca <style>/<script> con su propio tipo, no 'tag'). */
const elementos = (nodo, fn) => {
    for (const h of nodo.children || []) {
        if (h.type === 'tag' || h.type === 'style' || h.type === 'script') { fn(h); elementos(h, fn); }
    }
};

/** Estilo en línea final: reglas del <style> por especificidad/orden, y encima el `style` propio. */
function inlinarEstilos(raiz, reglas) {
    const compiladas = reglas
        .map(r => {
            const partes = r.selector.split(/\s+/).map(parseCompuesto);
            return partes.every(Boolean) ? { ...r, partes, esp: especificidad(partes) } : null;
        })
        .filter(Boolean)
        .filter(r => !(r.partes.length === 1 && r.partes[0].tag === 'body' && !r.partes[0].clases.length))
        .sort((a, b) => a.esp - b.esp || a.orden - b.orden);
    elementos(raiz, (el) => {
        const decl = new Map();
        for (const r of compiladas) if (aplica(el, r.partes)) for (const [k, v] of r.decls) decl.set(k, v);
        if (!decl.size) return;
        for (const [k, v] of parseDecls(el.attribs.style)) decl.set(k, v);
        el.attribs.style = [...decl].map(([k, v]) => `${k}: ${v}`).join('; ');
    });
}

/** Lleva line-height del body a los bloques de texto que no traen uno (el conversor no hereda). */
function heredarInterlineado(raiz, interlineado) {
    if (!interlineado) return;
    elementos(raiz, (el) => {
        if (!['p', 'li', 'td', 'th', 'h1', 'h2', 'h3', 'div'].includes(el.name)) return;
        const propias = parseDecls(el.attribs.style);
        if (propias.some(([k]) => k === 'line-height')) return;
        el.attribs.style = [...propias.map(([k, v]) => `${k}: ${v}`), `line-height: ${interlineado}`].join('; ');
    });
}

/**
 * Un <p>/<li> justificado con <br> directos se parte en párrafos, uno por línea: Word estira la línea que
 * termina en salto manual. El primero conserva el margen de arriba y el último el de abajo.
 */
function partirJustificadosConBr(raiz) {
    const candidatos = [];
    elementos(raiz, (el) => {
        if (el.name !== 'p') return;
        const justificado = parseDecls(el.attribs.style).some(([k, v]) => k === 'text-align' && /justify/i.test(v));
        if (justificado && (el.children || []).some(c => c.type === 'tag' && c.name === 'br')) candidatos.push(el);
    });
    for (const el of candidatos) {
        const grupos = [[]];
        for (const c of el.children) {
            if (c.type === 'tag' && c.name === 'br') grupos.push([]);
            else grupos[grupos.length - 1].push(c);
        }
        const propias = parseDecls(el.attribs.style).filter(([k]) => !/^margin/.test(k));
        const html = grupos.map((g, i) => {
            const mt = i === 0 ? margen(el, 'top') : '0';
            const mb = i === grupos.length - 1 ? margen(el, 'bottom') : '0';
            const estilo = [...propias.map(([k, v]) => `${k}: ${v}`), `margin-top: ${mt}`, `margin-bottom: ${mb}`].join('; ');
            const contenido = g.length ? render(g, { decodeEntities: false }) : '&nbsp;';
            return `<p style="${estilo}">${contenido}</p>`;
        }).join('');
        const nuevos = parseDocument(html, { decodeEntities: false }).children;
        const padre = el.parent;
        const idx = padre.children.indexOf(el);
        for (const n of nuevos) n.parent = padre;
        padre.children.splice(idx, 1, ...nuevos);
    }
}

/** margin-top / margin-bottom efectivo de un elemento (de `margin` corto o de la propiedad suelta). */
function margen(el, lado) {
    let v = '0';
    for (const [k, val] of parseDecls(el.attribs.style)) {
        if (k === `margin-${lado}`) v = val;
        else if (k === 'margin') {
            const p = val.split(/\s+/);
            v = lado === 'top' ? p[0] : (p[2] ?? p[0]);
        }
    }
    return v;
}

/** Valor CSS de longitud → puntos (null si no se entiende). */
function aPt(v) {
    const m = String(v ?? '').trim().match(/^(-?[\d.]+)\s*(pt|px|cm|mm|in)?$/i);
    if (!m) return null;
    const n = Number(m[1]);
    return { pt: 1, px: 0.75, cm: 28.3465, mm: 2.83465, in: 72 }[(m[2] || 'px').toLowerCase()] * n;
}

const estiloDe = (el) => new Map(parseDecls(el.attribs?.style));
const escribirEstilo = (el, mapa) => { el.attribs.style = [...mapa].map(([k, v]) => `${k}: ${v}`).join('; '); };

/** margin-top/-bottom de un estilo, mirando el atajo `margin` y la propiedad suelta (la última gana). */
function margenes(mapa) {
    let top = null, bottom = null;
    for (const [k, v] of mapa) {
        if (k === 'margin') {
            const p = v.split(/\s+/);
            top = p[0]; bottom = p.length >= 3 ? p[2] : p[0];
        } else if (k === 'margin-top') top = v;
        else if (k === 'margin-bottom') bottom = v;
    }
    return { top: aPt(top) || 0, bottom: aPt(bottom) || 0 };
}

const nuevoNodo = (html) => parseDocument(html, { decodeEntities: false }).children;
function insertarAntes(el, nodos) {
    const padre = el.parent;
    const i = padre.children.indexOf(el);
    for (const n of nodos) n.parent = padre;
    padre.children.splice(i, 0, ...nodos);
}
function reemplazar(el, nodos) {
    insertarAntes(el, nodos);
    el.parent.children.splice(el.parent.children.indexOf(el), 1);
}

/** Separador de `pt` puntos: párrafo vacío de letra mínima con ese espacio después. */
const separador = (pt) => `<p data-sep="1" style="margin-bottom: ${Math.round(pt * 10) / 10}pt; font-size: 1pt; line-height: 1">&nbsp;</p>`;

/** width="24%" de tablas y celdas → estilo `width` (el conversor solo lee el estilo; sin él reparte parejo). */
function anchosAEstilo(raiz) {
    elementos(raiz, (el) => {
        if (!['table', 'td', 'th'].includes(el.name) || !el.attribs.width) return;
        const m = estiloDe(el);
        if (m.has('width')) return;
        const w = String(el.attribs.width).trim();
        m.set('width', /^\d+(\.\d+)?$/.test(w) ? `${w}px` : w);
        escribirEstilo(el, m);
    });
}

/**
 * Anchos por COLUMNA: el HTML pone el % en una sola fila (las otras traen colspan/rowspan) y el navegador
 * lo aplica a toda la columna; Word mira celda por celda. Se arma la grilla (respetando colspan y rowspan),
 * se toma el % conocido de cada columna y cada celda sin ancho recibe la suma de las columnas que ocupa.
 */
function completarAnchosDeTablas(raiz) {
    elementos(raiz, (tabla) => {
        if (tabla.name !== 'table') return;
        const filas = [];
        const juntar = (n) => {
            for (const c of n.children || []) {
                if (c.type !== 'tag') continue;
                if (c.name === 'tr') filas.push(c);
                else if (['tbody', 'thead', 'tfoot'].includes(c.name)) juntar(c);
            }
        };
        juntar(tabla);
        const ocupadas = [];
        const ubicadas = [];
        filas.forEach((tr, r) => {
            let col = 0;
            for (const td of (tr.children || []).filter(c => c.type === 'tag' && (c.name === 'td' || c.name === 'th'))) {
                while (ocupadas[r]?.[col]) col += 1;
                const cs = Math.max(1, parseInt(td.attribs.colspan, 10) || 1);
                const rs = Math.max(1, parseInt(td.attribs.rowspan, 10) || 1);
                for (let i = 0; i < rs; i += 1) {
                    ocupadas[r + i] = ocupadas[r + i] || [];
                    for (let j = 0; j < cs; j += 1) ocupadas[r + i][col + j] = true;
                }
                ubicadas.push({ td, col, cs });
                col += cs;
            }
        });
        const pct = [];
        for (const { td, col, cs } of ubicadas) {
            const w = estiloDe(td).get('width');
            if (cs === 1 && /^[\d.]+%$/.test(w || '') && pct[col] == null) pct[col] = parseFloat(w);
        }
        for (const { td, col, cs } of ubicadas) {
            const m = estiloDe(td);
            if (m.has('width')) continue;
            const partes = pct.slice(col, col + cs);
            if (partes.length === cs && partes.every(v => v != null)) {
                m.set('width', `${partes.reduce((a, b) => a + b, 0)}%`);
                escribirEstilo(td, m);
            }
        }
    });
}

/**
 * % → pt: el conversor calcula el % de una celda contra un ancho 0 (queda «0») y Word reparte parejo.
 * Se resuelve de afuera hacia adentro: el ancho útil de la hoja para las tablas de primer nivel, y el de
 * la celda para las tablas anidadas.
 */
function anchosAbsolutos(nodo, contenedorPt) {
    for (const el of nodo.children || []) {
        if (el.type !== 'tag') continue;
        if (el.name !== 'table') { anchosAbsolutos(el, contenedorPt); continue; }
        const mt = estiloDe(el);
        const anchoTabla = resolverAncho(mt.get('width'), contenedorPt) ?? contenedorPt;
        mt.set('width', `${redondear(anchoTabla)}pt`);
        escribirEstilo(el, mt);
        const celdas = [];
        elementosHasta(el, 'table', (c) => { if (c.name === 'td' || c.name === 'th') celdas.push(c); });
        for (const td of celdas) {
            const m = estiloDe(td);
            const w = resolverAncho(m.get('width'), anchoTabla);
            if (w != null) { m.set('width', `${redondear(w)}pt`); escribirEstilo(td, m); }
            anchosAbsolutos(td, w ?? anchoTabla);
        }
    }
}

const redondear = (n) => Math.round(n * 10) / 10;

function resolverAncho(valor, base) {
    if (!valor) return null;
    const v = String(valor).trim();
    if (/%$/.test(v)) return (parseFloat(v) / 100) * base;
    return aPt(v);
}

/** Recorre descendientes sin entrar en tablas anidadas (sus celdas se resuelven contra su propia tabla). */
function elementosHasta(nodo, corte, fn) {
    for (const h of nodo.children || []) {
        if (h.type !== 'tag') continue;
        fn(h);
        if (h.name !== corte) elementosHasta(h, corte, fn);
    }
}

/**
 * Celdas con texto suelto (sin <p>/<div>/<table>/<ul> adentro) → su contenido va en un <p>: así un <br>
 * es un salto de línea del párrafo; suelto, el conversor lo volvía un párrafo aparte con aire de más.
 */
function envolverTextoDeCeldas(raiz) {
    elementos(raiz, (td) => {
        if (td.name !== 'td' && td.name !== 'th') return;
        const hijos = td.children || [];
        if (!hijos.length || hijos.some(c => c.type === 'tag' && BLOQUES.includes(c.name))) return;
        if (!hijos.some(c => (c.type === 'text' && c.data.trim()) || c.type === 'tag')) return;
        const contenido = render(hijos, { decodeEntities: false });
        td.children = [];
        const nodos = nuevoNodo(`<p style="margin-bottom: 0pt">${contenido}</p>`);
        for (const n of nodos) n.parent = td;
        td.children = nodos;
    });
}

/**
 * Celda VACÍA al final de una fila (sin texto, imagen ni borde; la del encabezado que equilibra el logo):
 * el navegador la achica y el título usa ese espacio; Word respeta su % y el título se partía en tres
 * líneas. Se quita y su ancho pasa a la celda anterior.
 */
function cederCeldasVaciasFinales(raiz) {
    const vacia = (td) => !render(td.children || [], { decodeEntities: false }).replace(/&nbsp;|\s/g, '')
        && !/border/.test(td.attribs.style || '') && !td.attribs.colspan && !td.attribs.rowspan;
    elementos(raiz, (tr) => {
        if (tr.name !== 'tr') return;
        // Solo tablas de UNA fila (el encabezado): en una grilla, quitar una celda correría las columnas.
        let tabla = tr.parent;
        while (tabla && tabla.name !== 'table') tabla = tabla.parent;
        let filas = 0;
        if (tabla) elementosHasta(tabla, 'table', (c) => { if (c.name === 'tr') filas += 1; });
        if (filas !== 1) return;
        const celdas = (tr.children || []).filter(c => c.type === 'tag' && (c.name === 'td' || c.name === 'th'));
        if (celdas.length < 2) return;
        const ultima = celdas[celdas.length - 1];
        const previa = celdas[celdas.length - 2];
        if (!vacia(ultima)) return;
        const wU = estiloDe(ultima).get('width') || ultima.attribs.width;
        const mp = estiloDe(previa);
        const wP = mp.get('width') || previa.attribs.width;
        if (!/%$/.test(String(wU || '')) || !/%$/.test(String(wP || ''))) return;
        mp.set('width', `${parseFloat(wP) + parseFloat(wU)}%`);
        escribirEstilo(previa, mp);
        delete previa.attribs.width;
        tr.children.splice(tr.children.indexOf(ultima), 1);
    });
}

const HEREDABLES = ['text-align', 'font-size', 'font-weight', 'font-family', 'line-height', 'color', 'font-style'];
const BLOQUES = ['p', 'div', 'table', 'ul', 'ol', 'h1', 'h2', 'h3'];

/**
 * <div> → párrafos: el conversor perdía el texto de un div dentro de otro (el título del encabezado, en
 * su celda, no salía). Un div con solo texto pasa a <p>; uno con bloques adentro se deshace: sus hijos
 * suben un nivel, heredan lo que el div les daba (alineación, letra) y el primero se lleva su margin-top.
 * De adentro hacia afuera, para que los anidados queden resueltos antes que su padre.
 */
function divsAParrafos(raiz) {
    const divs = [];
    elementos(raiz, (el) => { if (el.name === 'div') divs.push(el); });
    for (const div of divs.reverse()) {
        const m = estiloDe(div);
        const hijos = div.children || [];
        if (!hijos.some(c => c.type === 'tag' && BLOQUES.includes(c.name))) {
            div.name = 'p';
            if (!m.has('margin') && !m.has('margin-bottom')) m.set('margin-bottom', '0pt');
            escribirEstilo(div, m);
            continue;
        }
        const { top } = margenes(m);
        const bloques = hijos.filter(c => c.type === 'tag');
        bloques.forEach((h, i) => {
            const mh = estiloDe(h);
            for (const k of HEREDABLES) if (m.has(k) && !mh.has(k)) mh.set(k, m.get(k));
            if (i === 0 && top) {
                const propio = margenes(mh).top;
                mh.set('margin-top', `${Math.max(top, propio)}pt`);
            }
            escribirEstilo(h, mh);
        });
        const padre = div.parent;
        const idx = padre.children.indexOf(div);
        for (const h of hijos) h.parent = padre;
        padre.children.splice(idx, 1, ...hijos);
    }
}

/** white-space: nowrap → espacios duros: Word no conoce la propiedad y partía «NOMBRE DEL / TRABAJADOR». */
function sinCorteDeLinea(raiz) {
    elementos(raiz, (el) => {
        if (!/nowrap/i.test(estiloDe(el).get('white-space') || '')) return;
        const duro = (n) => {
            for (const c of n.children || []) {
                if (c.type === 'text') c.data = c.data.replace(/ /g, '&nbsp;');
                else duro(c);
            }
        };
        duro(el);
    });
}

/** h1/h2 → <p> con su letra (y MAYÚSCULAS si el CSS lo pide): Word no les pone el estilo «Título» azul. */
function titulosAParrafos(raiz) {
    elementos(raiz, (el) => {
        if (!/^h[1-6]$/.test(el.name)) return;
        const m = estiloDe(el);
        if (/uppercase/i.test(m.get('text-transform') || '')) {
            const subir = (n) => {
                for (const c of n.children || []) {
                    if (c.type === 'text') c.data = c.data.toLocaleUpperCase('es-CL');
                    else subir(c);
                }
            };
            subir(el);
        }
        m.delete('text-transform');
        if (!m.has('font-weight')) m.set('font-weight', 'bold');
        el.name = 'p';
        escribirEstilo(el, m);
    });
}

/**
 * Bloques con borde superior (línea de firma) → tabla de una celda con ese borde: el conversor solo dibuja
 * bordes de celda. El margin-top del bloque queda como separador antes de la tabla.
 */
function bordesSuperiorACelda(raiz) {
    const lista = [];
    elementos(raiz, (el) => { if ((el.name === 'div' || el.name === 'p') && estiloDe(el).has('border-top')) lista.push(el); });
    for (const el of lista) {
        const m = estiloDe(el);
        const borde = m.get('border-top');
        const { top } = margenes(m);
        for (const k of [...m.keys()]) if (/^(margin|border|padding)/.test(k)) m.delete(k);
        const contenido = render(el.children, { decodeEntities: false });
        const estiloP = [...m, ['margin-bottom', '0pt']].map(([k, v]) => `${k}: ${v}`).join('; ');
        // Word exige que una celda termine en párrafo: si la tabla nueva queda al final de una celda, se le
        // agrega uno mínimo después (sin él Word dice que el archivo está dañado).
        const enCelda = ['td', 'th'].includes(el.parent?.name) && el.parent.children.filter(c => c.type === 'tag').pop() === el;
        const html = (top ? separador(top) : '') +
            `<table width="100%"><tr><td style="border-top: ${borde}; width: 100%"><p style="${estiloP}">${contenido}</p></td></tr></table>` +
            (enCelda ? separador(0) : '');
        reemplazar(el, nuevoNodo(html));
    }
}

/**
 * Márgenes de bloques: el margin-top pasa a un separador antes del bloque (p, div, table, ul) y cada <p>
 * recibe su margin-bottom explícito en pt (0 si no tiene), así no hereda el espacio por defecto.
 */
function normalizarMargenes(raiz) {
    const conTop = [];
    elementos(raiz, (el) => {
        if (!['p', 'div', 'table', 'ul', 'ol'].includes(el.name) || el.attribs['data-sep']) return;
        const m = estiloDe(el);
        const { top, bottom } = margenes(m);
        if (top > 0) conTop.push([el, top]);
        if (el.name === 'p') {
            for (const k of [...m.keys()]) if (/^margin(-top|-bottom)?$/.test(k)) m.delete(k);
            m.set('margin-bottom', `${Math.round(bottom * 10) / 10}pt`);
            escribirEstilo(el, m);
        }
    });
    for (const [el, top] of conTop) insertarAntes(el, nuevoNodo(separador(top)));
}

/**
 * Interlineado EXACTO en puntos, como el navegador: en CSS «line-height: 1.05» es 1,05 × el tamaño de la
 * letra; en Word un múltiplo «1,05» se aplica sobre su propio interlineado sencillo (≈1,2 × la letra) y el
 * ODI ya no cabía en una hoja. Se escribe en pt (L × tamaño efectivo: el propio, el heredado o el del body)
 * y ajustarXml marca esas líneas como exactas. El conversor, solo, escribía L × tamaño como múltiplo
 * («media línea» a 6 pt, letras encimadas).
 */
function interlineadoEnPuntos(raiz, tamanoBasePt) {
    const tamano = (el) => {
        for (let n = el; n && n.type === 'tag'; n = n.parent) {
            const fs = aPt(estiloDe(n).get('font-size'));
            if (fs) return fs;
        }
        return tamanoBasePt;
    };
    elementos(raiz, (el) => {
        const m = estiloDe(el);
        const lh = m.get('line-height');
        if (!lh || !/^[\d.]+$/.test(lh)) return;
        m.set('line-height', `${Math.round(Number(lh) * tamano(el) * 10) / 10}pt`);
        escribirEstilo(el, m);
    });
}

/**
 * Ajustes en el XML que el conversor no expone: sin espacio automático después de cada párrafo (cada <p>
 * trae el suyo), relleno de celdas angosto (0 arriba/abajo, 4 pt a los lados; el HTML usa 0–5 pt) y el
 * interlineado en pt como EXACTO (el conversor lo marca «auto»), salvo en párrafos con imagen: una línea
 * exacta recortaría el logo.
 */
async function ajustarXml(buffer) {
    const zip = await JSZip.loadAsync(buffer);
    const styles = zip.file('word/styles.xml');
    if (styles) {
        const xml = (await styles.async('string')).replace(
            /(<w:pPrDefault>\s*<w:pPr>\s*)<w:spacing[^>]*\/>/,
            '$1<w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/>'
        );
        zip.file('word/styles.xml', xml);
    }
    const docXml = zip.file('word/document.xml');
    if (docXml) {
        const xml = (await docXml.async('string'))
            .replace(
                /<w:tblCellMar>[\s\S]*?<\/w:tblCellMar>/g,
                '<w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="80" w:type="dxa"/>' +
                '<w:bottom w:w="0" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar>'
            )
            .replace(/<w:p>[\s\S]*?<\/w:p>|<w:p [^>]*>[\s\S]*?<\/w:p>/g, (par) => (par.includes('<w:drawing')
                ? par
                : par.replace(/(<w:spacing [^>]*w:line="\d+"[^>]*w:lineRule=")auto"/, '$1exact"')));
        zip.file('word/document.xml', xml);
    }
    return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

/** Papel y márgenes: @page con nombre (sección de Word, ver wrapHtml) gana al genérico. */
function pagina(pages) {
    const elegido = pages.find(p => p.nombre) || pages.find(p => !p.nombre);
    const out = { papel: DEFAULTS.papel.map(cm => cm * TWIP_POR.cm), margen: DEFAULTS.margen.map(cm => cm * TWIP_POR.cm) };
    if (!elegido) return out;
    for (const [k, v] of elegido.decls) {
        if (k === 'size') {
            const nombre = PAPELES[v.trim().toUpperCase()];
            const partes = nombre ? nombre.map(cm => cm * TWIP_POR.cm) : v.split(/\s+/).map(aTwips);
            if (partes.length >= 2 && partes.every(Number.isFinite)) out.papel = partes.slice(0, 2);
        } else if (k === 'margin') {
            const p = v.split(/\s+/).map(aTwips);
            if (p.every(Number.isFinite)) {
                const [t, r = t, b = t, l = r] = p;
                out.margen = [t, r, b, l];
            }
        }
    }
    return out;
}

/** Letra base del body: { fuente, tamanoPt, interlineado }. */
function letraBase(reglas) {
    const out = { fuente: DEFAULTS.fuente, tamanoPt: DEFAULTS.tamanoPt, interlineado: null };
    for (const r of reglas) {
        if (r.selector !== 'body') continue;
        for (const [k, v] of r.decls) {
            if (k === 'font-family') out.fuente = v.split(',')[0].replace(/['"]/g, '').trim() || out.fuente;
            else if (k === 'font-size') { const n = parseFloat(v); if (/pt$/i.test(v) && n > 0) out.tamanoPt = n; }
            else if (k === 'line-height') out.interlineado = v;
        }
    }
    return out;
}

/**
 * HTML completo del motor (con o sin BOM) → Buffer .docx.
 * `titulo` va a las propiedades del archivo (lo muestra la vista previa del celular).
 */
async function htmlADocx(htmlCompleto, { titulo } = {}) {
    cargarDeps();
    const html = String(htmlCompleto).replace(/^\uFEFF/, '');
    const doc = parseDocument(html, { decodeEntities: false });
    let css = '';
    elementos(doc, (el) => { if (el.name === 'style') css += render(el.children, { decodeEntities: false }); });
    const { pages, reglas } = parseCss(css);
    let body = null;
    elementos(doc, (el) => { if (!body && el.name === 'body') body = el; });
    const raiz = body || doc;

    inlinarEstilos(raiz, reglas);
    envolverTextoDeCeldas(raiz);
    const letra = letraBase(reglas);
    heredarInterlineado(raiz, letra.interlineado);
    titulosAParrafos(raiz);
    sinCorteDeLinea(raiz);
    bordesSuperiorACelda(raiz);
    divsAParrafos(raiz);
    anchosAEstilo(raiz);
    cederCeldasVaciasFinales(raiz);
    completarAnchosDeTablas(raiz);
    partirJustificadosConBr(raiz);
    normalizarMargenes(raiz);
    interlineadoEnPuntos(raiz, letra.tamanoPt);

    const pg = pagina(pages);
    const [top, right, bottom, left] = pg.margen.map(Math.round);
    anchosAbsolutos(raiz, (pg.papel[0] - left - right) / 20);
    const crudo = await HTMLtoDOCX(render(raiz.children, { decodeEntities: false }), null, {
        orientation: 'portrait',
        pageSize: { width: Math.round(pg.papel[0]), height: Math.round(pg.papel[1]) },
        margins: { top, right, bottom, left, header: 0, footer: 0, gutter: 0 },
        title: titulo || '',
        creator: 'Bóveda LOLS',
        lastModifiedBy: 'Bóveda LOLS',
        font: letra.fuente,
        fontSize: Math.round(letra.tamanoPt * 2),
        complexScriptFontSize: Math.round(letra.tamanoPt * 2),
        lang: 'es-CL',
        table: { row: { cantSplit: true }, addSpacingAfter: false },
        preProcessing: { skipHTMLMinify: true },
    });
    return ajustarXml(crudo);
}

/** ¿Es un Word que generó Bóveda (HTML con extensión .doc)? Un .doc binario subido a la ficha no lo es. */
function esDocGenerado(contenido, fileName) {
    if (!/\.doc$/i.test(String(fileName || ''))) return false;
    const inicio = String(contenido).replace(/^\uFEFF/, '').slice(0, 200);
    return /^\s*<(!doctype html|html)/i.test(inicio);
}

/**
 * Si `fullPath` es un .doc generado por Bóveda, lo devuelve como .docx: { buffer, fileName, mime }. Si no
 * lo es, o la conversión falla, devuelve null y quien llama entrega el archivo tal cual (la descarga nunca
 * se cae por esto; el error queda en el log).
 */
async function docxDeArchivo(fullPath, fileName, { titulo } = {}) {
    let contenido;
    try {
        const head = Buffer.alloc(256);
        const fd = fs.openSync(fullPath, 'r');
        try { fs.readSync(fd, head, 0, 256, 0); } finally { fs.closeSync(fd); }
        if (!esDocGenerado(head.toString('utf8'), fileName)) return null;
        contenido = fs.readFileSync(fullPath, 'utf8');
    } catch {
        return null;
    }
    return docxDeHtml(contenido, fileName, { titulo });
}

/** Igual que docxDeArchivo, con el HTML en memoria (ficha de ingreso sin persistir). */
async function docxDeHtml(html, fileName, { titulo } = {}) {
    try {
        const buffer = await htmlADocx(html, { titulo });
        return { buffer, fileName: String(fileName).replace(/\.doc$/i, '.docx'), mime: MIME_DOCX };
    } catch (err) {
        logger.error('No se pudo convertir el Word a .docx; se entrega el .doc', { fileName, err: err.message });
        return null;
    }
}

/**
 * Responde la descarga de un documento: .docx si es un Word generado por Bóveda, el archivo tal cual si
 * no. Usado por /documentos/download, /documentos-laborales/:id/download y la ficha de ingreso.
 */
async function enviarDescarga(res, { fullPath, fileName, titulo, mimeOriginal }) {
    const docx = await docxDeArchivo(fullPath, fileName, { titulo });
    if (docx) {
        res.attachment(docx.fileName);
        res.type(docx.mime);
        return res.send(docx.buffer);
    }
    if (mimeOriginal) res.type(mimeOriginal);
    return res.download(fullPath, fileName);
}

/** Agrega un documento a un ZIP (`nombre` = nombre dentro del ZIP): los Word generados entran como .docx. */
async function agregarAZip(archive, fullPath, nombre, { titulo } = {}) {
    const docx = await docxDeArchivo(fullPath, nombre, { titulo });
    if (docx) archive.append(docx.buffer, { name: docx.fileName });
    else archive.file(fullPath, { name: nombre });
}

module.exports = {
    MIME_DOCX, htmlADocx, esDocGenerado, docxDeArchivo, docxDeHtml, enviarDescarga, agregarAZip,
    _internal: { parseCss, pagina, letraBase, aTwips },
};
