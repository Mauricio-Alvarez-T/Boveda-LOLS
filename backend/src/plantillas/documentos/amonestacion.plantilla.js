/**
 * CARTA DE AMONESTACIÓN. Portada tal cual de frontend/src/components/workers/ConstanciaModal.tsx
 * (buildCartaHtml), ahora emitida por el servidor: queda en la ficha, con permiso y log.
 * Datos: fecha_carta, fecha_infraccion, motivo (lista cerrada del front u "otro"), detalle opcional.
 */
const g = require('../../services/docGenerador.service');

/** Motivos predefinidos (espejo de frontend/src/components/documents/amonestacionMotivos.ts). */
const MOTIVOS = [
    'Atraso reiterado en el ingreso',
    'Inasistencia injustificada',
    'Abandono de funciones durante la jornada',
    'No uso de elementos de protección personal (EPP)',
    'Incumplimiento de normas de seguridad',
    'Incumplimiento de instrucciones de la jefatura',
    'Uso indebido de equipos o herramientas',
    'Conducta inapropiada en el lugar de trabajo',
];

function requiere(ctx) {
    const f = [];
    if (!ctx.empresa) f.push('empresa del trabajador');
    if (!ctx.datos?.fecha_carta) f.push('fecha de la carta');
    return f;
}

function build(ctx) {
    const e = ctx.empresa, t = ctx.trabajador, d = ctx.datos || {};
    const esc = g.escapeHtml;
    const fInfra = d.fecha_infraccion ? g.fechaLarga(d.fecha_infraccion) : '…………………………………………………………';
    const motivo = String(d.motivo || '').trim();
    const detalle = String(d.detalle || '').trim();
    let falta;
    if (motivo && detalle) falta = `<p>${esc(motivo)}</p><p>${esc(detalle)}</p>`;
    else if (motivo) falta = `<p>${esc(motivo)}</p>`;
    else if (detalle) falta = `<p>${esc(detalle)}</p>`;
    else falta = '<p>_______________________________________________</p>'.repeat(4);
    return (
        g.encabezado('CARTA DE AMONESTACIÓN', { fecha: d.fecha_carta }) +
        `<p style="margin:14pt 0 0;text-align:left"><b>NOMBRE:</b> ${esc(t.nombre)}</p>` +
        // Sin dato va una línea, no el rótulo colgando: la carta se completa a mano y se firma en papel.
        `<p style="margin:0;text-align:left"><b>OBRA:</b> ${g.oLinea(t.obra_nombre, 30)}</p>` +
        `<p style="margin:0;text-align:left"><b>CARGO:</b> ${g.oLinea(t.cargo_nombre, 30)}</p>` +
        `<p style="margin:0;text-align:left"><b>RUT:</b> ${g.oLinea(t.rut, 15)}</p>` +
        '<p style="margin:14pt 0 0">De nuestra consideración:</p>' +
        `<p>Ponemos en su conocimiento que la Administración de ${esc(String(e.razon_social).toUpperCase())} ha determinado sancionarlo con una amonestación escrita.</p>` +
        `<p style="text-align:left">La infracción fue cometida por usted el día ${esc(fInfra)}.</p>` +
        '<p>La falta es la siguiente:</p>' +
        falta +
        '<p style="margin-top:14pt">Le recordamos que las infracciones de forma recurrente pueden generar el término de contrato.</p>' +
        '<p style="margin-top:10pt">Sin otro particular, atentamente,</p>' +
        g.bloqueFirmas({ titulo: 'Empleador', lineas: [] }, { titulo: 'Trabajador', lineas: [] }, { margenTop: 70 })
    );
}

module.exports = {
    codigo: 'AMONESTACION',
    version: '1.0',
    titulo: 'Carta de Amonestación',
    MOTIVOS,
    requiere,
    nombreBase: (ctx) => `Amonestacion_${g.slug(ctx.trabajador.apellido_paterno)}_${g.slug(ctx.trabajador.nombres)}`,
    build,
    metadata: (ctx) => ({
        empresa: { id: ctx.empresa.id, razon_social: ctx.empresa.razon_social },
        trabajador: { id: ctx.trabajador.id, nombre: ctx.trabajador.nombre, rut: ctx.trabajador.rut, cargo: ctx.trabajador.cargo_nombre, obra: ctx.trabajador.obra_nombre },
        carta: { fecha_carta: ctx.datos.fecha_carta, fecha_infraccion: ctx.datos.fecha_infraccion || null, motivo: ctx.datos.motivo || null },
    }),
};
