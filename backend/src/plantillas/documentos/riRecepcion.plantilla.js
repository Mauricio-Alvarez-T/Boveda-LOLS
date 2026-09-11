/** RECEPCIÓN DEL REGLAMENTO INTERNO DE ORDEN, HIGIENE Y SEGURIDAD. 1 página; firma del trabajador. */
const g = require('../../services/docGenerador.service');

function build(ctx) {
    const e = ctx.empresa, t = ctx.trabajador;
    const fecha = ctx.datos?.fecha_documento || ctx.hoy;
    return (
        g.encabezado('RECEPCIÓN REGLAMENTO INTERNO') +
        `<p style="margin-top:40pt;text-align:center;font-weight:bold">EN ESTE ACTO CERTIFICO HABER RECIBIDO EL REGLAMENTO INTERNO DE ORDEN, HIGIENE Y SEGURIDAD DE ${g.escapeHtml(g.sinPuntoFinal(String(e.razon_social || '')).toUpperCase())}.</p>` +
        g.firmaTrabajador(t.nombre, t.rut, fecha)
    );
}

module.exports = {
    codigo: 'RI_RECEPCION',
    version: '1.0',
    titulo: 'Recepción Reglamento Interno',
    requiere: (ctx) => (ctx.empresa ? [] : ['empresa del trabajador']),
    nombreBase: (ctx) => `Reglamento_Interno_${g.slug(ctx.trabajador.apellido_paterno)}_${g.slug(ctx.trabajador.nombres)}`,
    build,
    metadata: (ctx) => ({
        empresa: { id: ctx.empresa.id, razon_social: ctx.empresa.razon_social },
        trabajador: { id: ctx.trabajador.id, nombre: ctx.trabajador.nombre, rut: ctx.trabajador.rut },
        fecha: ctx.datos?.fecha_documento || ctx.hoy,
    }),
};
