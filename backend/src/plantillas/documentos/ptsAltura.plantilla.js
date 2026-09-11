/** PROCEDIMIENTO DE TRABAJO SEGURO EN ALTURA. 1 página; certificación de recepción y firma. */
const g = require('../../services/docGenerador.service');

function build(ctx) {
    const e = ctx.empresa, t = ctx.trabajador;
    const fecha = ctx.datos?.fecha_documento || ctx.hoy;
    return (
        g.encabezado('PROCEDIMIENTO DE TRABAJO SEGURO', { subtitulo: 'EN ALTURA' }) +
        '<p style="margin-top:24pt">Cada vez que se ejecuten <b>TRABAJOS EN ALTURA</b> es obligación cumplir los siguientes pasos:</p>' +
        '<p><b>1.</b> El trabajador deberá subir afirmándose con ambas manos de la escala y, si es posible, amarrarse con una cola de vida utilizando un arnés. Una vez estabilizado, solicitará que le suban el material a instalar a través de una cuerda si existe demasiada altura.</p>' +
        '<p><b>2.</b> Si no fuese posible amarrarse con una cola de vida y equipo de arnés, se deberá utilizar un cuerpo de andamio, si el espacio lo permite.</p>' +
        '<p>Cada vez que se ejecute la misma tarea se debe dar cumplimiento a este Procedimiento de Trabajo Seguro.</p>' +
        `<p>Certifico haber recibido de <b>${g.escapeHtml(e.razon_social)}</b> el Procedimiento de Trabajo Seguro en Altura.</p>` +
        g.firmaTrabajador(t.nombre, t.rut, fecha)
    );
}

module.exports = {
    codigo: 'PTS_ALTURA',
    version: '1.0',
    titulo: 'Procedimiento de Trabajo Seguro en Altura',
    requiere: (ctx) => (ctx.empresa ? [] : ['empresa del trabajador']),
    nombreBase: (ctx) => `PTS_Altura_${g.slug(ctx.trabajador.apellido_paterno)}_${g.slug(ctx.trabajador.nombres)}`,
    build,
    metadata: (ctx) => ({
        empresa: { id: ctx.empresa.id, razon_social: ctx.empresa.razon_social },
        trabajador: { id: ctx.trabajador.id, nombre: ctx.trabajador.nombre, rut: ctx.trabajador.rut },
        fecha: ctx.datos?.fecha_documento || ctx.hoy,
    }),
};
