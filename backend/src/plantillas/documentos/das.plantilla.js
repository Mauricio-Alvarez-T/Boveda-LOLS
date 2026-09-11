/** DECLARACIÓN DE RECIBIR EL DERECHO A SABER (DS 44 / Ley 16.744). 1 página; firma del trabajador. */
const g = require('../../services/docGenerador.service');

function build(ctx) {
    const e = ctx.empresa, t = ctx.trabajador;
    const fecha = ctx.datos?.fecha_documento || ctx.hoy;
    const razon = String(e.razon_social || '').toUpperCase();
    return (
        g.encabezado('DECLARACIÓN DE RECIBIR EL DERECHO A SABER') +
        '<p style="margin-top:24pt">En cumplimiento a lo dispuesto en el Decreto N° 44 de la Ley N° 16.744 y las modificaciones introducidas por el Decreto N° 50 de 1988 del Ministerio del Trabajo y Previsión Social, "DE LAS OBLIGACIONES DE INFORMAR LOS RIESGOS LABORALES".</p>' +
        `<p>Declaro haber sido informado por mi empleador <b>${g.escapeHtml(razon)}</b> de los riesgos que implican las faenas que ejecuta la empresa y que he recibido la siguiente capacitación para personal nuevo:</p>` +
        '<ul><li>Fundamentos y normas de protección personal.</li>' +
        '<li>Prevención de riesgos y causas de accidentes.</li>' +
        '<li>Procedimientos en caso de contingencias y accidentes.</li></ul>' +
        g.firmaTrabajador(t.nombre, t.rut, fecha)
    );
}

module.exports = {
    codigo: 'DAS',
    version: '1.0',
    titulo: 'Declaración Derecho a Saber',
    requiere: (ctx) => (ctx.empresa ? [] : ['empresa del trabajador']),
    nombreBase: (ctx) => `DAS_${g.slug(ctx.trabajador.apellido_paterno)}_${g.slug(ctx.trabajador.nombres)}`,
    build,
    metadata: (ctx) => ({
        empresa: { id: ctx.empresa.id, razon_social: ctx.empresa.razon_social },
        trabajador: { id: ctx.trabajador.id, nombre: ctx.trabajador.nombre, rut: ctx.trabajador.rut },
        fecha: ctx.datos?.fecha_documento || ctx.hoy,
    }),
};
