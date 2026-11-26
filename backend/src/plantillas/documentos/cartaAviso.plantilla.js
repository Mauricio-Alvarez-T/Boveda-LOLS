/**
 * CARTA DE AVISO DE TÉRMINO DE CONTRATO (Marcos 2026-11-26: «los modelos de las cartas, con las distintas causales
 * de despido, ya sea no concurrencia, vencimiento del plazo, necesidades de empresa, etc.»). El 26-11, tras ver los
 * ejemplos: «necesidades de la empresa, vencimiento de plazo y no concurrencia… esas tres cartas… que solo Matías pueda
 * imprimir», y sin el «Recibí copia» ni el «c.c.» del pie («me dice Matías que no es necesario»). Solo esas tres
 * causales; emitir, descargar e imprimir piden `documentos.cartas_aviso` (mig 160, solo Matías + Super Admin).
 *
 * Es la comunicación del art. 162 del Código del Trabajo: causal invocada con su artículo, hechos en que se funda y
 * estado de las cotizaciones previsionales (con los comprobantes adjuntos). Sin montos (Marcos 2026-11-26: «lo referido
 * a dinero… sacarlo, solo texto explicando la causal de despido»). Los textos son DATO reemplazable: RR.HH. (o su
 * abogado) los ajusta acá sin tocar lógica.
 *
 * Igual que el finiquito, sale de la baja VIGENTE del trabajador (`ctx.desvinculacion`, mig 112): la causal y la
 * fecha de término son las registradas al desvincular. Si la baja se registró con una causal operativa LOLS (sin
 * artículo), quien emite elige la causal legal (`datos.causal_codigo`); la registrada nunca se pisa.
 *
 * Las tres causales (`CAUSALES_CARTA`): necesidades de la empresa (161 N° 1), vencimiento del plazo (159 N° 4) y no
 * concurrencia (160 N° 3). Otra causal legal en la baja → no se emite (la carta dice algo que la baja no dice).
 */
const g = require('../../services/docGenerador.service');
const { getCausal } = require('../../config/causalesDesvinculacion');

const LUGAR_DEFAULT = 'Santiago';
/** Causales con carta (orden del selector cuando la baja es operativa LOLS, sin artículo). */
const CAUSALES_CARTA = Object.freeze(['NECESIDADES_EMPRESA', 'VENCIMIENTO_PLAZO', 'INASISTENCIA']);

const esYmd = (s) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
    if (!m) return false;
    const d = new Date(+m[1], +m[2] - 1, +m[3]);
    return d.getFullYear() === +m[1] && d.getMonth() === +m[2] - 1 && d.getDate() === +m[3];
};

/** Causal que se imprime, siempre con artículo (misma regla que el finiquito). */
function causalImpresa(ctx) {
    const r = ctx.desvinculacion?.causal;
    if (r && r.articulo) return r;
    const elegida = ctx.datos?.causal_codigo;
    if (elegida) {
        const c = getCausal(elegida);
        return c && c.articulo ? c : null;
    }
    return null;
}

/**
 * Cómo se nombra la causal EN LA CARTA cuando el nombre del catálogo es una ayuda de pantalla y no el texto legal
 * (p. ej. «Inasistencias injustificadas (2 días seguidos, 2 lunes…)»).
 */
const NOMBRE_EN_CARTA = {
    INASISTENCIA: 'No concurrencia del trabajador a sus labores sin causa justificada',
};
const nombreCausal = (c) => NOMBRE_EN_CARTA[c.codigo] || c.nombre;

const fechaCarta = (ctx) => (esYmd(ctx.datos?.fecha_carta) ? ctx.datos.fecha_carta : ctx.hoy);
const fechaTermino = (ctx) => ctx.desvinculacion?.fecha_desvinculacion || null;
const lugar = (ctx) => String(ctx.datos?.lugar ?? '').trim() || LUGAR_DEFAULT;
const hechos = (ctx) => String(ctx.datos?.hechos ?? '').trim();
/** Días de inasistencia (art. 160 N° 3), 'YYYY-MM-DD', ordenados y sin repetir. */
const diasInasistencia = (ctx) => [...new Set((ctx.datos?.dias_inasistencia || []).filter(esYmd))].sort();
/** «19, 20, 21, 22, 23 y 24 de octubre de 2026» (agrupa por mes; varios meses separados por «y»). */
function listaDias(fechas) {
    const porMes = new Map();
    for (const f of fechas) {
        const k = f.slice(0, 7);
        if (!porMes.has(k)) porMes.set(k, []);
        porMes.get(k).push(Number(f.slice(8, 10)));
    }
    const y = (xs) => (xs.length <= 1 ? String(xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}`);
    const partes = [...porMes.entries()].map(([k, ds]) => {
        const fecha = g.fechaLarga(`${k}-01`).replace(/^01 de /, '');
        return `${y(ds)} de ${fecha}`;
    });
    return y(partes);
}

function requiere(ctx) {
    const f = [];
    const e = ctx.empresa, t = ctx.trabajador || {}, d = ctx.desvinculacion;
    if (!e) f.push('empresa del trabajador');
    else if (!e.representante_nombre) f.push('representante legal de la empresa (Configuración → Empresas)');
    if (!t.rut) f.push('RUT del trabajador');
    if (!t.direccion) f.push('domicilio del trabajador (la carta va a su domicilio)');
    if (!d) {
        f.push('baja vigente registrada (la carta de aviso se emite desde la desvinculación)');
        return f;
    }
    if (!d.fecha_desvinculacion) f.push('fecha de término (la de la desvinculación)');
    const c = causalImpresa(ctx);
    if (!c) f.push('causal legal a imprimir (la baja no tiene artículo del Código del Trabajo: elígela)');
    else if (!CAUSALES_CARTA.includes(c.codigo)) {
        f.push(ctx.desvinculacion?.causal?.articulo
            ? `una baja por necesidades de la empresa, vencimiento del plazo o no concurrencia (esta se registró como «${c.nombre}»)`
            : 'causal de la carta: necesidades de la empresa, vencimiento del plazo o no concurrencia');
    } else {
        if (c.codigo === 'INASISTENCIA' && !diasInasistencia(ctx).length) f.push('los días de inasistencia');
        if (c.codigo === 'NECESIDADES_EMPRESA' && !hechos(ctx)) f.push('los hechos en que se funda la causal (por qué la empresa necesita el despido)');
    }
    const fc = ctx.datos?.fecha_carta;
    if (fc != null && !esYmd(fc)) f.push('fecha de la carta válida (AAAA-MM-DD)');
    return f;
}

/** El párrafo que cambia según la causal: los hechos en que se funda. */
function fundamento(ctx, c) {
    const esc = g.escapeHtml;
    const extra = hechos(ctx) ? ` ${esc(hechos(ctx))}` : '';
    switch (c.codigo) {
        case 'VENCIMIENTO_PLAZO':
            return `<p>Lo anterior, por cuanto el plazo convenido en su contrato de trabajo vence el día ${esc(g.fechaLarga(fechaTermino(ctx)))}.${extra}</p>`;
        case 'INASISTENCIA': {
            const dias = diasInasistencia(ctx);
            return `<p>Los hechos en que se funda la causal invocada son los siguientes: usted no concurrió a sus labores, sin causa justificada, ` +
                `los días ${esc(listaDias(dias))}, lo que suma ${dias.length} ${dias.length === 1 ? 'día' : 'días'} de inasistencia, ` +
                `sin aviso previo ni justificación ante el empleador.${extra}</p>`;
        }
        default:
            return `<p>Los hechos en que se funda la causal invocada son los siguientes: ${esc(hechos(ctx))}</p>`;
    }
}

function build(ctx) {
    const e = ctx.empresa, t = ctx.trabajador;
    const esc = g.escapeHtml;
    const c = causalImpresa(ctx);
    const razon = esc(g.sinPuntoFinal(String(e.razon_social || '').toUpperCase()));
    const domicilio = [t.direccion, t.comuna].filter(Boolean).join(', ');
    return (
        '<table width="100%"><tr>' +
        `<td width="50%" style="vertical-align:top">${g.logoHtml(e)}</td>` +
        `<td width="50%" style="vertical-align:top;text-align:right;padding-top:20pt">${esc(lugar(ctx))}, ${esc(g.fechaLarga(fechaCarta(ctx)))}</td>` +
        '</tr></table>' +
        '<p style="margin:18pt 0 0;text-align:left">Señor(a)</p>' +
        `<p style="margin:0;text-align:left"><b>${esc(String(t.nombre || '').toUpperCase())}</b></p>` +
        `<p style="margin:0;text-align:left">RUT: ${esc(t.rut)}</p>` +
        `<p style="margin:0;text-align:left">Domicilio: ${g.oLinea(domicilio, 40)}</p>` +
        '<p style="margin:0 0 14pt;text-align:left"><u>Presente</u></p>' +
        '<p style="text-align:left"><b>REF.: AVISO DE TÉRMINO DE CONTRATO DE TRABAJO</b></p>' +
        '<p>De nuestra consideración:</p>' +
        `<p>Por medio de la presente, comunicamos a usted que <b>${razon}</b>, RUT ${esc(e.rut)}, ha decidido poner término al contrato de trabajo ` +
        `que lo vincula con la empresa a contar del día <b>${esc(g.fechaLarga(fechaTermino(ctx)))}</b>, por la causal establecida en el ` +
        `${esc(c.articulo_texto)}, esto es, <b>«${esc(nombreCausal(c))}»</b>.</p>` +
        fundamento(ctx, c) +
        '<p>Asimismo, le informamos que sus cotizaciones previsionales se encuentran pagadas hasta el último día del mes anterior al del ' +
        'término de su contrato, según consta en los comprobantes que se adjuntan a la presente.</p>' +
        '<p>Saluda atentamente a usted,</p>' +
        // Sin «Recibí copia» ni «c.c.» al pie (Matías 2026-11-26: no es necesario).
        '<table width="100%" class="firmas" style="margin-top:50pt"><tr><td width="50%"></td><td width="50%">' +
        `<div style="border-top:1px solid #000;padding-top:4pt"><b>${razon}</b><br/>p.p. ${esc(e.representante_nombre)}</div></td></tr></table>`
    );
}

function metadata(ctx) {
    const e = ctx.empresa, t = ctx.trabajador, d = ctx.desvinculacion, c = causalImpresa(ctx);
    return {
        empresa: { id: e.id, razon_social: e.razon_social, rut: e.rut, representante_nombre: e.representante_nombre },
        trabajador: { id: t.id, nombre: t.nombre, rut: t.rut, cargo: t.cargo_nombre, obra: t.obra_nombre },
        desvinculacion: {
            id: d.id, fecha_desvinculacion: d.fecha_desvinculacion,
            causal_registrada: { codigo: d.causal_codigo, nombre: d.causal?.nombre ?? null },
            causal_impresa: { codigo: c.codigo, nombre: c.nombre, articulo_texto: c.articulo_texto },
        },
        carta: {
            fecha: fechaCarta(ctx), lugar: lugar(ctx), hechos: hechos(ctx) || null,
            dias_inasistencia: diasInasistencia(ctx),
        },
    };
}

module.exports = {
    codigo: 'CARTA_AVISO',
    version: '1.0',
    titulo: 'Carta de aviso de término de contrato',
    CAUSALES_CARTA,
    LUGAR_DEFAULT,
    requiere,
    nombreBase: (ctx) => `Carta_aviso_${g.slug(ctx.trabajador.apellido_paterno)}_${g.slug(ctx.trabajador.nombres)}`,
    build,
    metadata,
    /** Solo para tests. */
    _interno: { causalImpresa, listaDias, diasInasistencia },
};
