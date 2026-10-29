/**
 * Dobles de prueba del módulo Sitio web (mig 147): una BD en memoria y un repo de GitHub en memoria.
 *
 * crearBd()      entiende las sentencias que usa el módulo (INSERT / UPDATE / DELETE / SELECT de una tabla, sin
 *                JOIN): WHERE con AND/OR de `col = ?`, `<>`, `IN (?)`, `IN ('a','b')`, `IS [NOT] NULL`; ORDER BY con
 *                FIELD(); LIMIT. GET_LOCK/RELEASE_LOCK (el nombre TIENE que llevar la base: GET_LOCK es de todo el
 *                servidor MySQL y staging comparte instancia con producción), transacciones (copia y restaura) y
 *                `ON UPDATE` de updated_at.
 *                Una sentencia que no entiende LANZA (así un SQL nuevo no pasa en silencio).
 * crearGithub()  un repo con blobs, árboles, commits y una rama, detrás de un `fetch` que responde como la API de
 *                GitHub (Git Data API, compare y Actions). PATCH sin force exige avance rápido (si no, 422).
 *
 * Sin red ni BD real. Se usan desde sitio_web_publicar.test.js.
 */
const crypto = require('crypto');

const copiar = (v) => (v instanceof Date ? new Date(v) : (v && typeof v === 'object' && !Buffer.isBuffer(v) ? JSON.parse(JSON.stringify(v)) : v));
const copiarFila = (f) => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v instanceof Date ? new Date(v) : v]));

/** Parte por `sep` fuera de comillas y paréntesis. */
function partir(texto, sep) {
    const out = [];
    let nivel = 0; let comilla = false; let actual = '';
    for (let i = 0; i < texto.length; i++) {
        const c = texto[i];
        if (c === "'") comilla = !comilla;
        if (!comilla) {
            if (c === '(') nivel++;
            if (c === ')') nivel--;
            if (nivel === 0 && texto.startsWith(sep, i)) { out.push(actual); actual = ''; i += sep.length - 1; continue; }
        }
        actual += c;
    }
    out.push(actual);
    return out.map(s => s.trim());
}

function literal(tok, params) {
    const t = tok.trim();
    if (t === '?') return params.shift();
    if (/^NULL$/i.test(t)) return null;
    if (/^TRUE$/i.test(t)) return true;
    if (/^FALSE$/i.test(t)) return false;
    if (/^'.*'$/.test(t)) return t.slice(1, -1);
    if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
    throw new Error(`BD falsa: valor no soportado: ${t}`);
}

const nulo = (v) => v === null || v === undefined;
function igual(a, b) {
    if (nulo(a) || nulo(b)) return false;
    if (typeof a === 'boolean' || typeof b === 'boolean') return Number(a) === Number(b);
    if (a instanceof Date || b instanceof Date) return new Date(a).getTime() === new Date(b).getTime();
    return String(a) === String(b);
}

/** WHERE → función fila → boolean (consume los ? en orden). */
function condicion(where, params) {
    if (!where) return () => true;
    const grupos = partir(where, ' OR ').map(g => partir(g, ' AND ').map((atomo) => {
        let m;
        if ((m = atomo.match(/^(\w+) IS NOT NULL$/i))) { const c = m[1]; return f => !nulo(f[c]); }
        if ((m = atomo.match(/^(\w+) IS NULL$/i))) { const c = m[1]; return f => nulo(f[c]); }
        if ((m = atomo.match(/^(\w+) IN \((.+)\)$/i))) {
            const c = m[1];
            const lista = m[2].trim() === '?' ? [].concat(params.shift()) : partir(m[2], ',').map(t => literal(t, params));
            return f => lista.some(v => igual(f[c], v));
        }
        if ((m = atomo.match(/^(\w+) (=|<>) (.+)$/))) {
            const [, c, op, tok] = m;
            const v = literal(tok, params);
            return op === '=' ? (f => igual(f[c], v)) : (f => !nulo(f[c]) && !nulo(v) && !igual(f[c], v));
        }
        throw new Error(`BD falsa: condición no soportada: ${atomo}`);
    }));
    return f => grupos.some(g => g.every(fn => fn(f)));
}

function ordenar(filas, orderBy) {
    if (!orderBy) return filas;
    const terminos = partir(orderBy, ',').map((t) => {
        let m;
        if ((m = t.match(/^FIELD\((\w+), (.+)\)$/i))) {
            const c = m[1]; const valores = partir(m[2], ',').map(x => x.replace(/^'|'$/g, ''));
            return { valor: f => valores.indexOf(f[c]), dir: 1 };
        }
        m = t.match(/^(\w+)(?: (ASC|DESC))?$/i);
        if (!m) throw new Error(`BD falsa: ORDER BY no soportado: ${t}`);
        return { valor: f => f[m[1]], dir: /DESC/i.test(m[2] || '') ? -1 : 1 };
    });
    const cmp = (a, b) => {
        if (a === b) return 0;
        if (nulo(a)) return -1;
        if (nulo(b)) return 1;
        if (a instanceof Date || b instanceof Date) return new Date(a) - new Date(b);
        if (typeof a === 'number' && typeof b === 'number') return a - b;
        return String(a) < String(b) ? -1 : (String(a) > String(b) ? 1 : 0);
    };
    return [...filas].sort((x, y) => {
        for (const t of terminos) {
            const r = cmp(t.valor(x), t.valor(y)) * t.dir;
            if (r) return r;
        }
        return 0;
    });
}

const DEFAULTS = {
    sitio_obras: () => ({
        obra_id: null, titular: null, tipo: null, mandante: null, mandante_autoriza: false, mandante_autoriza_por: null, mandante_autoriza_at: null,
        comuna: null, direccion: null, superficie_m2: null, estado: 'en_construccion', anio: null, inicio: null, servicios: '', desafio: null,
        solucion: null, resultado: null, referencia: null, orden: 0, incluir: false, publicado_hash: null, publicado_json: null, publicado_at: null,
        creado_por: null, actualizado_por: null, created_at: new Date(), updated_at: new Date(),
    }),
    sitio_obra_fotos: () => ({
        rol: 'portada', orden: 0, alt: null, heredada_src: null, subido_por: null, sin_personas_confirmado: false, confirmado_por: null,
        confirmado_at: null, aprobada_por: null, aprobada_at: null, aprobada_hash: null, rechazada_por: null, rechazada_at: null,
        created_at: new Date(), updated_at: new Date(),
    }),
    sitio_publicaciones: () => ({
        estado: 'en_curso', commit_sha: null, parent_sha: null, manifiesto_previsto: null, manifiesto: null, obras_json: null, obras_incluidas: 0,
        resumen: null, error_codigo: null, error_mensaje: null, build_estado: null, build_url: null, en_linea_at: null, created_at: new Date(),
        finalizado_at: null,
    }),
    sitio_web_historial: () => ({ sitio_obra_id: null, entidad_id: null, detalle: null, usuario_id: null, created_at: new Date() }),
    usuarios: () => ({}),
};

function crearBd({ usuarios = [{ id: 5, nombre: 'Ana Pérez' }], idInicial = 990000 } = {}) {
    let tablas;
    let seq;
    let lockOcupado;
    let fallas;
    let copia = null;
    const sentencias = [];

    function reiniciar() {
        tablas = { sitio_obras: [], sitio_obra_fotos: [], sitio_publicaciones: [], sitio_web_historial: [], usuarios: usuarios.map(u => ({ ...u })) };
        seq = { sitio_obras: idInicial, sitio_obra_fotos: idInicial, sitio_publicaciones: idInicial, sitio_web_historial: 0, usuarios: 1000 };
        lockOcupado = false;
        fallas = [];
        copia = null;
        sentencias.length = 0;
    }
    reiniciar();

    function insertar(tabla, cols, vals) {
        if (!tablas[tabla]) throw new Error(`BD falsa: tabla desconocida ${tabla}`);
        const fila = { ...(DEFAULTS[tabla] ? DEFAULTS[tabla]() : {}) };
        cols.forEach((c, i) => { fila[c] = copiar(vals[i]); });
        if (tabla === 'sitio_obras' && tablas.sitio_obras.some(o => o.slug === fila.slug)) {
            throw Object.assign(new Error("Duplicate entry for key 'uk_sitio_obras_slug'"), { code: 'ER_DUP_ENTRY' });
        }
        if (fila.id === undefined) fila.id = ++seq[tabla];
        tablas[tabla].push(fila);
        return [{ insertId: fila.id, affectedRows: 1 }];
    }

    function actualizar(tabla, set, where, params) {
        const asignaciones = partir(set, ',').map((a) => {
            const m = a.match(/^(\w+) = (.+)$/);
            if (!m) throw new Error(`BD falsa: SET no soportado: ${a}`);
            const [, col, expr] = m;
            if (/^\w+$/.test(expr) && !/^(NULL|TRUE|FALSE|\d+)$/i.test(expr)) return { col, de: expr };
            return { col, valor: literal(expr, params) };
        });
        const cumple = condicion(where, params);
        let n = 0;
        for (const f of tablas[tabla]) {
            if (!cumple(f)) continue;
            n++;
            const nueva = { ...f };
            for (const a of asignaciones) nueva[a.col] = a.de !== undefined ? f[a.de] : copiar(a.valor);
            if ('updated_at' in f && !asignaciones.some(a => a.col === 'updated_at')) nueva.updated_at = new Date();
            Object.assign(f, nueva);
        }
        return [{ affectedRows: n }];
    }

    function borrar(tabla, where, params) {
        const cumple = condicion(where, params);
        const antes = tablas[tabla].length;
        const borradas = tablas[tabla].filter(cumple);
        tablas[tabla] = tablas[tabla].filter(f => !cumple(f));
        if (tabla === 'sitio_obras') {
            const ids = new Set(borradas.map(f => f.id));
            tablas.sitio_obra_fotos = tablas.sitio_obra_fotos.filter(f => !ids.has(f.sitio_obra_id));   // ON DELETE CASCADE
        }
        return [{ affectedRows: antes - tablas[tabla].length }];
    }

    function seleccionar(proyeccion, tabla, where, orderBy, limite, params) {
        if (!tablas[tabla]) throw new Error(`BD falsa: tabla desconocida ${tabla}`);
        const cumple = condicion(where, params);
        let filas = ordenar(tablas[tabla].filter(cumple), orderBy);
        if (limite !== undefined) filas = filas.slice(0, Number(limite));
        if (proyeccion.trim() === '*') return [filas.map(copiarFila)];
        const cols = partir(proyeccion, ',').map((c) => {
            const m = c.match(/^(\w+)(?: AS (\w+))?$/i);
            if (!m) throw new Error(`BD falsa: columna no soportada: ${c}`);
            return [m[1], m[2] || m[1]];
        });
        return [filas.map(f => Object.fromEntries(cols.map(([c, alias]) => [alias, f[c] instanceof Date ? new Date(f[c]) : (f[c] === undefined ? null : f[c])])))];
    }

    async function query(crudo, params = []) {
        const sql = String(crudo).replace(/\s+/g, ' ').trim();
        sentencias.push(sql);
        for (const f of fallas) {
            if (f.veces > 0 && f.re.test(sql)) { f.veces -= 1; throw f.error; }
        }
        const p = [...params];
        let m;
        if (/^SELECT (GET|RELEASE)_LOCK\(/.test(sql) && !/_LOCK\(CONCAT\(COALESCE\(DATABASE\(\), ''\), ':sitio_web_publicar'\)/.test(sql)) {
            throw new Error(`BD falsa: el lock tiene que llevar el nombre de la base: ${sql}`);
        }
        if (/^SELECT GET_LOCK\(/.test(sql)) {
            if (lockOcupado) return [[{ ok: 0 }]];
            lockOcupado = true;
            return [[{ ok: 1 }]];
        }
        if (/^SELECT RELEASE_LOCK\(/.test(sql)) { lockOcupado = false; return [[{ r: 1 }]]; }
        // El único JOIN del módulo: la foto con el nombre y el slug de su obra (sitioWebFotos.fotoOFalla).
        if (/^SELECT f\.\*, s\.nombre AS obra_nombre, s\.slug AS obra_slug FROM sitio_obra_fotos f JOIN sitio_obras s ON s\.id = f\.sitio_obra_id WHERE f\.id = \?$/.test(sql)) {
            const f = tablas.sitio_obra_fotos.find(x => igual(x.id, p[0]));
            const o = f && tablas.sitio_obras.find(x => igual(x.id, f.sitio_obra_id));
            return [f && o ? [{ ...copiarFila(f), obra_nombre: o.nombre, obra_slug: o.slug }] : []];
        }
        if ((m = sql.match(/^INSERT INTO (\w+) \(([^)]*)\) VALUES \((.*)\)$/))) {
            return insertar(m[1], partir(m[2], ','), partir(m[3], ',').map(t => literal(t, p)));
        }
        if ((m = sql.match(/^UPDATE (\w+) SET (.+?) WHERE (.+)$/))) return actualizar(m[1], m[2], m[3], p);
        if ((m = sql.match(/^DELETE FROM (\w+) WHERE (.+)$/))) return borrar(m[1], m[2], p);
        if ((m = sql.match(/^SELECT (.+?) FROM (\w+)(?: WHERE (.+?))?(?: ORDER BY (.+?))?(?: LIMIT (\d+))?$/))) {
            return seleccionar(m[1], m[2], m[3], m[4], m[5], p);
        }
        throw new Error(`BD falsa: sentencia no soportada: ${sql}`);
    }

    const conn = {
        query,
        async beginTransaction() { copia = { tablas: Object.fromEntries(Object.entries(tablas).map(([k, v]) => [k, v.map(copiarFila)])) }; },
        async commit() { copia = null; },
        async rollback() { if (copia) tablas = copia.tablas; copia = null; },
        release() {},
    };

    return {
        query,
        getConnection: async () => conn,
        conn,
        get tablas() { return tablas; },
        sentencias,
        reiniciar,
        ocuparLock() { lockOcupado = true; },
        get lockOcupado() { return lockOcupado; },
        /** La próxima sentencia que calce con `re` lanza `error` (`veces` veces). */
        fallarEn(re, error, veces = 1) { fallas.push({ re, error, veces }); },
    };
}

/* ═══════════════════════ GitHub ═══════════════════════ */

const sha1 = (t) => crypto.createHash('sha1').update(t).digest('hex');
const gitBlobSha = (buf) => crypto.createHash('sha1').update(`blob ${buf.length}\0`).update(buf).digest('hex');

function crearGithub({ repo, rama = 'main', token, archivos = {} }) {
    const blobs = new Map();
    const arboles = new Map();
    const commits = new Map();
    const llamadas = [];
    const fallas = [];
    const corridas = [];
    let ref;
    let contador = 0;
    let antesDePatch = null;

    const guardarBlob = (contenido) => {
        const b = Buffer.isBuffer(contenido) ? contenido : Buffer.from(String(contenido), 'utf8');
        const s = gitBlobSha(b);
        blobs.set(s, b);
        return s;
    };
    const guardarArbol = (mapa) => {
        const s = sha1(`tree ${JSON.stringify([...mapa].sort())}`);
        arboles.set(s, new Map(mapa));
        return s;
    };
    const nuevoCommit = ({ tree, parents, message, author = null }) => {
        contador += 1;
        const s = sha1(`commit ${tree} ${parents.join(',')} ${message} ${contador}`);
        commits.set(s, { tree, parents, message, author });
        return s;
    };
    const arbolDe = (commitSha) => arboles.get(commits.get(commitSha).tree);

    const inicial = new Map(Object.entries(archivos).map(([r, c]) => [r, guardarBlob(c)]));
    ref = nuevoCommit({ tree: guardarArbol(inicial), parents: [], message: 'inicial' });

    /** ¿`base` es ancestro de (o igual a) `head`? */
    function esAncestro(base, head) {
        const pila = [head]; const vistos = new Set();
        while (pila.length) {
            const s = pila.pop();
            if (s === base) return true;
            if (vistos.has(s) || !commits.has(s)) continue;
            vistos.add(s);
            pila.push(...commits.get(s).parents);
        }
        return false;
    }

    const respuesta = (status, cuerpo, headers = {}) => new Response(cuerpo === undefined ? null : JSON.stringify(cuerpo), {
        status, headers: { 'content-type': 'application/json', ...headers },
    });

    async function fetchFalso(url, opciones = {}) {
        const u = new URL(url);
        const metodo = opciones.method || 'GET';
        const prefijo = `/repos/${repo}`;
        const ruta = u.pathname.startsWith(prefijo) ? u.pathname.slice(prefijo.length) : u.pathname;
        const body = opciones.body ? JSON.parse(opciones.body) : null;
        llamadas.push({ metodo, ruta, query: u.search, body, headers: { ...(opciones.headers || {}) }, redirect: opciones.redirect, url });
        for (const f of fallas) {
            if (f.veces > 0 && f.metodo === metodo && f.re.test(ruta)) {
                f.veces -= 1;
                if (f.lanzar) throw f.lanzar;
                return respuesta(f.status, f.cuerpo || { message: 'falla de prueba' }, f.headers || {});
            }
        }
        if (!u.pathname.startsWith(prefijo)) return respuesta(404, { message: 'Not Found' });
        if ((opciones.headers || {}).Authorization !== `Bearer ${token}`) return respuesta(401, { message: 'Bad credentials' });
        let m;
        if (metodo === 'GET' && ruta === `/git/ref/heads/${rama}`) return respuesta(200, { ref: `refs/heads/${rama}`, object: { sha: ref, type: 'commit' } });
        if (metodo === 'GET' && (m = ruta.match(/^\/git\/commits\/([0-9a-f]{40})$/))) {
            const c = commits.get(m[1]);
            return c ? respuesta(200, { sha: m[1], tree: { sha: c.tree }, parents: c.parents.map(p => ({ sha: p })), message: c.message }) : respuesta(404, {});
        }
        if (metodo === 'GET' && (m = ruta.match(/^\/git\/trees\/([0-9a-f]{40})$/))) {
            const a = arboles.get(m[1]);
            if (!a) return respuesta(404, {});
            return respuesta(200, { sha: m[1], truncated: false, tree: [...a].map(([path, sha]) => ({ path, mode: '100644', type: 'blob', sha, size: blobs.get(sha).length })) });
        }
        if (metodo === 'GET' && (m = ruta.match(/^\/git\/blobs\/([0-9a-f]{40})$/))) {
            const b = blobs.get(m[1]);
            return b ? respuesta(200, { sha: m[1], encoding: 'base64', content: b.toString('base64').replace(/(.{60})/g, '$1\n') }) : respuesta(404, {});
        }
        if (metodo === 'POST' && ruta === '/git/blobs') return respuesta(201, { sha: guardarBlob(Buffer.from(body.content, 'base64')) });
        if (metodo === 'POST' && ruta === '/git/trees') {
            const base = arboles.get(body.base_tree);
            if (!base) return respuesta(422, { message: 'base_tree inválido' });
            const nuevo = new Map(base);
            for (const e of body.tree) {
                if (e.sha === null) nuevo.delete(e.path);
                else { if (!blobs.has(e.sha)) return respuesta(422, { message: 'blob desconocido' }); nuevo.set(e.path, e.sha); }
            }
            return respuesta(201, { sha: guardarArbol(nuevo) });
        }
        if (metodo === 'POST' && ruta === '/git/commits') {
            if (!arboles.has(body.tree) || body.parents.some(p => !commits.has(p))) return respuesta(422, { message: 'commit inválido' });
            return respuesta(201, { sha: nuevoCommit({ tree: body.tree, parents: body.parents, message: body.message, author: body.author || null }) });
        }
        if (metodo === 'PATCH' && ruta === `/git/refs/heads/${rama}`) {
            if (antesDePatch) { const h = antesDePatch; antesDePatch = null; await h(); }
            const c = commits.get(body.sha);
            if (!c) return respuesta(422, { message: 'commit desconocido' });
            if (!body.force && !esAncestro(ref, body.sha)) return respuesta(422, { message: 'Update is not a fast forward' });
            ref = body.sha;
            return respuesta(200, { ref: `refs/heads/${rama}`, object: { sha: ref } });
        }
        if (metodo === 'GET' && (m = ruta.match(/^\/compare\/([0-9a-f]{40})\.\.\.([0-9a-f]{40})$/))) {
            const [, b, h] = m;
            if (!commits.has(b) || !commits.has(h)) return respuesta(404, {});
            const status = b === h ? 'identical' : esAncestro(b, h) ? 'ahead' : esAncestro(h, b) ? 'behind' : 'diverged';
            return respuesta(200, { status });
        }
        if (metodo === 'GET' && ruta === '/actions/runs') {
            const sha = u.searchParams.get('head_sha');
            return respuesta(200, { total_count: 0, workflow_runs: corridas.filter(c => c.head_sha === sha) });
        }
        return respuesta(404, { message: 'Not Found' });
    }

    return {
        fetch: fetchFalso,
        llamadas,
        get ref() { return ref; },
        commit: (s) => commits.get(s),
        /** Map ruta → Buffer del árbol de la rama (o de un commit). */
        archivos(commitSha = ref) {
            return new Map([...arbolDe(commitSha)].map(([r, s]) => [r, blobs.get(s)]));
        },
        /** Alguien empuja a main a mano: { ruta: contenido | null (borrar) }. */
        empujar(cambios, message = 'cambio a mano') {
            const nuevo = new Map(arbolDe(ref));
            for (const [r, c] of Object.entries(cambios)) { if (c === null) nuevo.delete(r); else nuevo.set(r, guardarBlob(c)); }
            ref = nuevoCommit({ tree: guardarArbol(nuevo), parents: [ref], message });
            return ref;
        },
        /** Vuelve la rama a un commit anterior como un commit nuevo (lo que deja un `git revert`). */
        revertirA(commitSha, message = 'Revert') {
            ref = nuevoCommit({ tree: commits.get(commitSha).tree, parents: [ref], message });
            return ref;
        },
        fallar({ metodo = 'GET', re, status = 500, headers, cuerpo, veces = 1, lanzar = null }) { fallas.push({ metodo, re, status, headers, cuerpo, veces, lanzar }); },
        antesDelPatch(fn) { antesDePatch = fn; },
        corrida(c) { corridas.push(c); },
        cuenta: (metodo, re) => llamadas.filter(l => l.metodo === metodo && re.test(l.ruta)).length,
    };
}

module.exports = { crearBd, crearGithub, gitBlobSha, partir };
