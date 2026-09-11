/**
 * ODI — Obligación de Informar los Riesgos Laborales (DS 44; ex D.S. 40, Ley 16.744).
 * Cabecera con datos del trabajador, texto legal, tabla de 27 riesgos (dos columnas, dato en
 * odiRiesgos.js) y firmas instructor / trabajador + huella. Portado del formato en papel.
 */
const g = require('../../services/docGenerador.service');
const RIESGOS = require('./odiRiesgos');

function requiere(ctx) {
    const f = [];
    if (!ctx.empresa) f.push('empresa del trabajador');
    if (!ctx.trabajador.cargo_nombre) f.push('cargo del trabajador');
    return f;
}

function filaRiesgos(a, b) {
    const celda = (r) => r
        ? `<td width="50%"><b>${r.n}.- ${g.escapeHtml(r.titulo)}</b><ul style="margin:2pt 0 0 14pt">${r.bullets.map(x => `<li style="font-size:9.5pt;margin:0">${g.escapeHtml(x)}</li>`).join('')}</ul></td>`
        : '<td width="50%"></td>';
    return `<tr>${celda(a)}${celda(b)}</tr>`;
}

function build(ctx) {
    const e = ctx.empresa, t = ctx.trabajador, d = ctx.datos || {};
    const fecha = d.fecha_documento || ctx.hoy;
    const razon = String(e.razon_social || '').toUpperCase();
    const esc = g.escapeHtml;
    const filas = [];
    for (let i = 0; i < RIESGOS.length; i += 2) filas.push(filaRiesgos(RIESGOS[i], RIESGOS[i + 1]));

    return (
        g.encabezado('OBLIGACIÓN DE INFORMAR LOS RIESGOS LABORALES', { subtitulo: 'DECRETO SUPREMO N° 44' }) +
        '<table width="100%" class="grid" style="margin-top:8pt">' +
        `<tr><td width="24%"><b>NOMBRE DEL TRABAJADOR</b></td><td width="43%">${esc(t.nombre)}</td><td width="13%"><b>CARGO</b></td><td width="20%">${esc(t.cargo_nombre || '')}</td></tr>` +
        `<tr><td><b>RUT</b></td><td>${esc(t.rut)}</td><td><b>DIVISIÓN</b></td><td>${esc(d.division || 'CONSTRUCCIÓN')}</td></tr>` +
        `<tr><td><b>FECHA</b></td><td>${esc(g.fechaCorta(fecha))}</td><td><b>UBICACIÓN</b></td><td>${esc(d.ubicacion || t.obra_nombre || '')}</td></tr>` +
        `<tr><td><b>DURACIÓN DE LA CHARLA</b></td><td colspan="3">${esc(d.duracion_charla || '30 minutos')}</td></tr>` +
        '</table>' +
        `<p style="margin-top:10pt;font-size:10.5pt"><b>${esc(razon)}</b>, en cumplimiento a lo dispuesto en el Decreto N° 40 de la Ley 16.744 y las modificaciones introducidas por el Decreto N° 50 de 1988 del Ministerio del Trabajo y Previsión Social, Título VI "DE LA OBLIGACIÓN DE INFORMAR DE LOS RIESGOS LABORALES", artículos 21, 22, 23 y 24, ha publicado para conocimiento de todos sus trabajadores los riesgos generales más representativos de la construcción y, además, a través de la presente capacitación al trabajador abajo firmante, éste declara conocer los riesgos potenciales de accidente que conllevan las labores que ejecuta y las medidas preventivas que debe respetar, empleando métodos de trabajo correctos o seguros para evitar cometer acciones inseguras, comprometiéndose a cumplir con todas las instrucciones de la jefatura superior.</p>` +
        '<p style="font-size:10.5pt">Aquellos riesgos o dudas específicas que se presenten en los lugares donde trabajo o en la forma de efectuarlo, deberé informarlos oportunamente a la jefatura directa, para que los analice y establezca los procedimientos y métodos que deberé adoptar para ejecutar en forma segura tales labores. Esta capacitación será realizada por mi supervisión y, por medio del presente registro, quedará constancia de ella.</p>' +
        `<table width="100%" class="grid">${filas.join('')}</table>` +
        '<table width="100%" style="margin-top:36pt"><tr>' +
        '<td width="50%" style="text-align:center"><div style="border-top:1px solid #000;padding-top:4pt;margin:0 20pt"><b>INSTRUCTOR</b><br/>Nombre: ____________________________<br/>RUT: ______________<br/>Firma</div></td>' +
        `<td width="50%" style="text-align:center"><div style="border-top:1px solid #000;padding-top:4pt;margin:0 20pt"><b>TRABAJADOR</b><br/>${esc(t.nombre)}<br/>RUT: ${esc(t.rut)}<br/>Firma &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Huella</div></td>` +
        '</tr></table>'
    );
}

module.exports = {
    codigo: 'ODI_D40',
    version: '1.0',
    titulo: 'ODI – Obligación de Informar (DS 44)',
    requiere,
    nombreBase: (ctx) => `ODI_${g.slug(ctx.trabajador.apellido_paterno)}_${g.slug(ctx.trabajador.nombres)}`,
    build,
    metadata: (ctx) => ({
        empresa: { id: ctx.empresa.id, razon_social: ctx.empresa.razon_social },
        trabajador: { id: ctx.trabajador.id, nombre: ctx.trabajador.nombre, rut: ctx.trabajador.rut, cargo: ctx.trabajador.cargo_nombre },
        charla: { fecha: ctx.datos?.fecha_documento || ctx.hoy, ubicacion: ctx.datos?.ubicacion || ctx.trabajador.obra_nombre || null, duracion: ctx.datos?.duracion_charla || '30 minutos' },
    }),
};
