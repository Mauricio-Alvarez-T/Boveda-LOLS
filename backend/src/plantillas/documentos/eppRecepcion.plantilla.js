/**
 * RECEPCIÓN DE IMPLEMENTOS DE SEGURIDAD (EPP). Lista editable de implementos (default: casco,
 * guantes, arnés, zapatos de seguridad, antiparras + 2 líneas en blanco). Cita RIOHS cap. XIII art. 62.
 */
const g = require('../../services/docGenerador.service');

const EPP_DEFAULT = ['CASCO', 'GUANTES', 'ARNÉS', 'ZAPATOS DE SEGURIDAD', 'ANTIPARRAS'];

function items(ctx) {
    const lista = Array.isArray(ctx.datos?.epp_items) ? ctx.datos.epp_items.map(s => String(s).trim()).filter(Boolean) : [];
    return lista.length ? lista : EPP_DEFAULT;
}

function build(ctx) {
    const e = ctx.empresa, t = ctx.trabajador;
    const fecha = ctx.datos?.fecha_documento || ctx.hoy;
    const razon = g.escapeHtml(e.razon_social);
    const lis = items(ctx).map(i => `<li>${g.escapeHtml(i.toUpperCase())}</li>`).join('') +
        '<li>__________________________</li><li>__________________________</li>';
    return (
        g.encabezado('RECEPCIÓN DE IMPLEMENTOS DE SEGURIDAD') +
        `<p style="margin-top:24pt">Certifico haber recibido de <b>${razon}</b> los siguientes implementos de seguridad:</p>` +
        `<ul style="list-style:none;margin-left:24pt">${lis}</ul>` +
        `<p>Declaro además haber sido informado por mi empleador <b>${razon}</b> del correcto uso de cada uno de ellos y de la obligación de utilizarlos siempre.</p>` +
        '<p>Tomo conocimiento de que, de no cumplir con lo anterior, se me aplicará una sanción de hasta el 25% del salario diario, según señala el Capítulo N° XIII, Art. 62 del Reglamento Interno de Orden, Higiene y Seguridad.</p>' +
        '<p>Además, y según la ley vigente, de ser sorprendido faltando a esta obligación se aplicará:<br/>' +
        'a) En primera instancia: amonestación verbal.<br/>' +
        'b) En segunda instancia: amonestación escrita con copia a la Inspección del Trabajo.<br/>' +
        'c) En tercera instancia: causal de despido con copia a la Inspección del Trabajo.</p>' +
        g.firmaTrabajador(t.nombre, t.rut, fecha)
    );
}

module.exports = {
    codigo: 'EPP_RECEPCION',
    version: '1.0',
    titulo: 'Recepción de Implementos de Seguridad',
    EPP_DEFAULT,
    requiere: (ctx) => (ctx.empresa ? [] : ['empresa del trabajador']),
    nombreBase: (ctx) => `EPP_${g.slug(ctx.trabajador.apellido_paterno)}_${g.slug(ctx.trabajador.nombres)}`,
    build,
    metadata: (ctx) => ({
        empresa: { id: ctx.empresa.id, razon_social: ctx.empresa.razon_social },
        trabajador: { id: ctx.trabajador.id, nombre: ctx.trabajador.nombre, rut: ctx.trabajador.rut },
        fecha: ctx.datos?.fecha_documento || ctx.hoy,
        implementos: items(ctx),
    }),
};
