/**
 * CONTRATO DE TRABAJO — plazo fijo (v1: solo plazo fijo, días editables, default 15; decisión del
 * dueño 2026-09-11). Texto portado del formato en papel de LOLS / MAUA (9 cláusulas). Jornada,
 * gratificación 25% (tope 4,75 IMM) y pago el día 05 son texto fijo. El sueldo se imprime en cifras
 * y en letras desde `ctx.remuneracion` (parámetros del cargo, mig 111) — congelado en metadata.
 */
const g = require('../../services/docGenerador.service');
const { montoEnLetras, capitalizar } = require('../../utils/numeroALetras');

const DIAS_DEFAULT = 15;

function requiere(ctx) {
    const f = [];
    const e = ctx.empresa, t = ctx.trabajador;
    if (!e) f.push('empresa del trabajador');
    else {
        if (!e.representante_nombre) f.push('representante legal de la empresa (Configuración → Empresas)');
        if (!e.direccion) f.push('domicilio de la empresa');
    }
    if (!t.cargo_nombre) f.push('cargo del trabajador');
    if (!t.fecha_ingreso) f.push('fecha de ingreso');
    if (!ctx.remuneracion || !(Number(ctx.remuneracion.sueldo_base) > 0)) f.push(`sueldo base del cargo ${t.cargo_nombre || ''} (Configuración → Cargos → $)`);
    return f;
}

function diasPlazo(ctx) {
    const d = Number(ctx.datos?.dias_plazo);
    return Number.isInteger(d) && d > 0 ? d : DIAS_DEFAULT;
}

function build(ctx) {
    const e = ctx.empresa, t = ctx.trabajador, r = ctx.remuneracion;
    const fechaContrato = ctx.datos?.fecha_documento || ctx.hoy;
    const dias = diasPlazo(ctx);
    const sueldo = Number(r.sueldo_base);
    const razon = String(e.razon_social || '').toUpperCase();
    const domicilioT = [t.direccion, t.comuna].filter(Boolean).join(', ');
    const esc = g.escapeHtml;

    return (
        g.encabezado('CONTRATO DE TRABAJO') +
        `<p style="margin-top:12pt">En Santiago, a ${esc(g.fechaLarga(fechaContrato))} entre <b>${esc(razon)}</b>, RUT: ${esc(e.rut)}, ` +
        `representada por don(ña) ${esc(e.representante_nombre)}${e.representante_rut ? `, RUT ${esc(e.representante_rut)}` : ''}, ` +
        `ambos con domicilio en ${esc(e.direccion)}, y don(ña) <b>${esc(t.nombre)}</b>, RUT ${esc(t.rut)}, ` +
        `de nacionalidad ${g.oLinea(t.nacionalidad, 15)}, estado civil ${g.oLinea(t.estado_civil, 15)}, ` +
        `nacido(a) el ${t.fecha_nacimiento ? esc(g.fechaLarga(t.fecha_nacimiento)) : '_'.repeat(25)}, ` +
        `domiciliado(a) en ${g.oLinea(domicilioT, 40)}, se ha convenido el siguiente CONTRATO DE TRABAJO, ` +
        'para cuyos efectos las partes convienen denominarse EMPLEADOR y TRABAJADOR, respectivamente.</p>' +

        `<p><b>1.-</b> El Empleador contrata los servicios del trabajador a objeto que éste se desempeñe como <b>${esc(t.cargo_nombre)}</b> ` +
        'y otras labores propias de la construcción, en el establecimiento de oficina o terreno, en cualquiera de las obras que estén en ejecución, ' +
        'pudiendo ser trasladado a otro lugar o domicilio, o labores similares dentro de la ciudad, por causa justificada, sin que ello importe menoscabo al trabajador. ' +
        `Su función será ejecutar los trabajos encomendados por los mandantes de acuerdo con las instrucciones impartidas tanto por su supervisor directo como por la gerencia de ${esc(g.sinPuntoFinal(razon))}. ` +
        'Además, si por la naturaleza de los servicios fuese necesario trasladar al trabajador, se entenderá por lugar de trabajo toda la zona geográfica donde la empresa desarrolle su actividad. ' +
        'También de común acuerdo se deja establecido que cuando la empresa lo requiera se trabajará los fines de semana, cambiando estos días por días hábiles.</p>' +

        '<p><b>2.-</b> El trabajador declara que cumple con los siguientes requisitos de idoneidad para desarrollar el servicio especializado para el cual se le contrata:</p>' +
        '<ul><li>Salud compatible con los servicios que prestará al empleador.</li>' +
        '<li>Declara conocer las medidas de seguridad y control de riesgos de su actividad; acepta como condición esencial del contrato de trabajo desarrollar su trabajo cumpliendo con las normas de seguridad y salud medioambiental en los recintos donde preste sus servicios, observando una conducta permanente y positiva en la prevención de accidentes laborales y ambientales.</li></ul>' +

        '<p><b>3.-</b> La jornada de trabajo será la siguiente:<br/>' +
        'Lunes y martes desde las 8:00 AM a 6:00 PM, con 1 hora de colación.<br/>' +
        'Miércoles a viernes desde las 8:00 AM a 5:00 PM, con 1 hora de colación.<br/>' +
        'Es de carácter obligatorio asistir con puntualidad a sus labores y firmar el libro de asistencia cada vez que salga y entre de la empresa. ' +
        'Asimismo, son faltas graves llegar atrasado sin haber notificado a su supervisor, no firmar el libro de asistencia y adulterarlo, las cuales pueden ser motivo de despido de ser recurrentes.</p>' +

        `<p><b>4.- Remuneración:</b> El empleador se compromete a remunerar mensualmente al trabajador con la suma de <b>${esc(g.fmtCLP(sueldo))}</b> ` +
        `(${esc(capitalizar(montoEnLetras(sueldo)))}) como sueldo base por mes.<br/>` +
        'Asimismo, suministrará gratificación del 25% sobre el sueldo base, con tope de 4,75 ingresos mínimos mensuales. ' +
        'Todos estos conceptos serán proporcionales a los días efectivamente trabajados en el mes.<br/>' +
        'Las remuneraciones se pagarán mensualmente, por períodos vencidos, en moneda nacional, en dinero efectivo, depósito o transferencia electrónica bancaria, cheque, vale vista o Servipag, y de su monto el empleador efectuará los descuentos legales establecidos por las leyes vigentes.<br/>' +
        'El empleador pagará el sueldo el día 05 del mes siguiente al que se prestaron los servicios; en caso de que ese día sea festivo, sábado o domingo, se pagará el día hábil siguiente.<br/>' +
        'El tiempo extraordinario (horas extras) se pagará con el recargo legal correspondiente y será cancelado juntamente con el respectivo sueldo.</p>' +

        '<p><b>5.- Obligaciones del trabajador</b></p><ul>' +
        '<li>El trabajador se obliga a ejecutar sus labores cumpliendo y respetando todas las normas de higiene, orden y seguridad contenidas en el Reglamento Interno de la empresa, el cual declara haber recibido y leído en este acto, sin tener dudas sobre su contenido.</li>' +
        '<li>De igual forma, el trabajador se obliga a guardar estricta reserva de las operaciones o procesos que realice o de los que tenga conocimiento en razón del cumplimiento de su trabajo.</li>' +
        '<li>El trabajador se compromete y obliga expresamente a cumplir las instrucciones que le sean impartidas por su jefe inmediato o por la gerencia de la empresa en relación con su trabajo, y a acatar en todas sus partes las normas del Reglamento Interno de Orden, Higiene y Seguridad, las que declara conocer y que forman parte integrante del presente contrato, reglamento del cual se le entrega un ejemplar.</li></ul>' +

        '<p><b>6.-</b> En consideración a la naturaleza de los servicios para los cuales fue contratado, el lugar donde se prestarán y las normas de salud ocupacional, medio ambiente y seguridad, al trabajador le queda expresamente prohibido incurrir en las siguientes conductas:</p><ul>' +
        '<li>Permanecer en el lugar de trabajo fuera de la jornada laboral sin autorización del empleador.</li>' +
        '<li>Distraer la atención del resto de los trabajadores durante las horas de trabajo, efectuando acciones como jugar, fumar, dormir, bromear, etc.</li>' +
        '<li>Presentarse a trabajar bajo la influencia del alcohol y/o drogas, o consumirlos durante su permanencia en el lugar de trabajo.</li>' +
        '<li>Adulterar o falsear documentación, registros o información del empleador y/o de la empresa.</li>' +
        '<li>Comentar, sacar o divulgar, por cualquier medio, documentación, antecedentes, formas de trabajo, procesos o cualquier información de carácter confidencial a la cual tenga acceso en razón de su trabajo.</li>' +
        '<li>Dentro de la jornada laboral está prohibido el uso de celular u otra red social que pudiese distraer y obstaculizar su trabajo habitual, con el fin de evitar todo tipo de accidente o imprudencia.</li>' +
        '<li>Realizar trabajos por cuenta propia y/o comercializar productos de cualquier naturaleza dentro de las horas de trabajo y en las instalaciones del mandante.</li>' +
        '<li>Efectuar trabajos sin acatar los procedimientos, las normas de seguridad o los reglamentos aplicables y establecidos sobre los cuales se le haya instruido.</li>' +
        '<li>Negarse a participar en charlas, capacitaciones o inducciones que determine e imparta el empleador o alguien designado por éste para dicho efecto.</li>' +
        '<li>Usar elementos de protección personal que no estén en buenas condiciones, que no sean apropiados para el trabajo que está realizando o de los cuales desconozca su uso.</li></ul>' +

        '<p><b>7.-</b> Los vehículos, computadores, teléfonos y otros equipos asignados al trabajador, y aquellos que deba usar regular o accidentalmente para el desempeño de sus funciones, así como también las cuentas de correo electrónico institucional, teléfono móvil, WhatsApp Business, bancarias y otras proporcionadas por el empleador, son de uso exclusivamente corporativo. ' +
        'Queda expresamente prohibido utilizar aquellos bienes y cuentas con una finalidad diferente a la de apoyo del correcto desempeño de sus funciones, así como almacenar en ellos datos personales de cualquier tipo o extraer la información empresarial en ellos contenida, considerándose como tal los programas, datos, cartera de clientes, información y modelos de negocio, entre otros. ' +
        'Los vehículos, equipos, llaves, claves y cuentas de propiedad de la empresa que por cualquier motivo mantenga en su poder el trabajador deberán ser devueltos al empleador, en perfecto estado de conservación y con todos sus accesorios, de inmediato al término de la relación laboral.</p>' +

        '<p><b>8.-</b> Se entienden incorporadas al presente contrato todas las disposiciones legales que se dicten con posterioridad a la fecha de suscripción y que tengan relación con él.</p>' +

        `<p><b>9.-</b> El presente contrato tendrá una duración de <b>${dias} días</b>; no obstante, se le podrá poner término antes del plazo señalado cuando concurran para ello causas justificadas que, en conformidad a la ley, puedan producir su caducidad. ` +
        `Se deja constancia que don(ña) ${esc(t.nombre)} ingresó al servicio el día ${esc(g.fechaLarga(t.fecha_ingreso))}.<br/>` +
        'Se firma el presente contrato en 3 ejemplares, quedando en este acto 2 para el empleador y 1 para el trabajador.</p>' +

        g.bloqueFirmas(
            { titulo: 'EMPLEADOR', lineas: [razon, `RUT: ${e.rut}`] },
            { titulo: 'TRABAJADOR', lineas: [t.nombre.toUpperCase(), `RUT: ${t.rut}`] },
            { margenTop: 50 }
        ) +
        '<p style="margin-top:36pt;text-align:center">RECIBÍ COPIA DE CONTRATO &nbsp;&nbsp;&nbsp; _______________________________</p>'
    );
}

function metadata(ctx) {
    const e = ctx.empresa, t = ctx.trabajador;
    return {
        empresa: { id: e.id, razon_social: e.razon_social, rut: e.rut, representante_nombre: e.representante_nombre, representante_rut: e.representante_rut, direccion: e.direccion },
        trabajador: { id: t.id, nombre: t.nombre, rut: t.rut, cargo: t.cargo_nombre, obra: t.obra_nombre, fecha_ingreso: t.fecha_ingreso },
        contrato: { tipo: 'plazo_fijo', dias_plazo: diasPlazo(ctx), fecha_contrato: ctx.datos?.fecha_documento || ctx.hoy },
        remuneracion: { sueldo_base: Number(ctx.remuneracion.sueldo_base), fuente: ctx.remuneracion.fuente || 'cargo_sueldos' },
    };
}

module.exports = {
    codigo: 'CONTRATO',
    version: '1.0',
    titulo: 'Contrato de Trabajo',
    requiere,
    nombreBase: (ctx) => `Contrato_${g.slug(ctx.trabajador.apellido_paterno)}_${g.slug(ctx.trabajador.nombres)}`,
    build,
    metadata,
};
