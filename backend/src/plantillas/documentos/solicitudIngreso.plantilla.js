/**
 * FICHA DE SOLICITUD DE INGRESO — impresión de la ficha digital (mig 108/109). Se emite sola al
 * aprobar (post-commit) y queda en la ficha del trabajador; para una solicitud pendiente se genera
 * al vuelo sin persistir (GET /solicitudes-ingreso/:id/doc). `ctx.solicitud` es la fila completa
 * (SELECT_SOLICITUD). Datos bancarios se imprimen porque la ficha en papel los lleva; el gate de
 * descarga es documentos.laborales.descargar.
 */
const g = require('../../services/docGenerador.service');

const ESTADO = { pendiente: 'Pendiente de revisión', aprobada: 'Aprobada', rechazada: 'Rechazada' };

function fila(label, valor) {
    return `<tr><td width="34%"><b>${g.escapeHtml(label)}</b></td><td>${g.escapeHtml(valor == null || valor === '' ? '—' : String(valor))}</td></tr>`;
}

function build(ctx) {
    const s = ctx.solicitud;
    const nombre = [s.nombres, s.apellido_paterno, s.apellido_materno].filter(Boolean).join(' ');
    const fechaSol = s.fecha_solicitud ? String(s.fecha_solicitud instanceof Date ? s.fecha_solicitud.toISOString() : s.fecha_solicitud).slice(0, 10) : null;
    const fechaRes = s.fecha_resolucion ? String(s.fecha_resolucion instanceof Date ? s.fecha_resolucion.toISOString() : s.fecha_resolucion).slice(0, 10) : null;
    const seccion = (t) => `<tr><td colspan="2" style="background:#eee"><b>${t}</b></td></tr>`;
    return (
        g.encabezado('FICHA DE SOLICITUD DE INGRESO', { fecha: fechaSol }) +
        `<p style="margin-top:10pt;text-align:left"><b>Solicitud N° ${s.id}</b> · Estado: ${g.escapeHtml(ESTADO[s.estado] || s.estado)}` +
        (s.solicitante_nombre ? ` · Solicitada por ${g.escapeHtml(s.solicitante_nombre)}` : '') +
        (fechaRes ? ` · Resuelta el ${g.escapeHtml(g.fechaCorta(fechaRes))}${s.resuelto_por_nombre ? ` por ${g.escapeHtml(s.resuelto_por_nombre)}` : ''}` : '') +
        '</p>' +
        '<table width="100%" class="grid">' +
        seccion('IDENTIFICACIÓN') +
        fila('Nombre completo', nombre) + fila('RUT', s.rut) +
        fila('Fecha de nacimiento', s.fecha_nacimiento ? g.fechaCorta(s.fecha_nacimiento) : null) +
        fila('Nacionalidad', s.nacionalidad) + fila('Estado civil', s.estado_civil) +
        fila('Dirección', [s.direccion, s.comuna].filter(Boolean).join(', ')) + fila('Teléfono', s.telefono) +
        seccion('CONTRATACIÓN') +
        fila('Empresa', s.empresa_nombre) + fila('Obra', s.obra_nombre) + fila('Cargo', s.cargo_nombre) +
        fila('Fecha de ingreso', s.fecha_ingreso ? g.fechaCorta(s.fecha_ingreso) : null) +
        seccion('PREVISIÓN Y CARGAS') +
        fila('AFP', s.afp) + fila('Salud', s.salud) + fila('Cargas familiares', s.cargas_familiares) +
        seccion('TALLAS') +
        fila('Calzado', s.talla_calzado) + fila('Pantalón', s.talla_pantalon) + fila('Polera', s.talla_polera) +
        seccion('PAGO DE REMUNERACIONES') +
        fila('Cuenta RUT', s.cuenta_rut == null ? null : (s.cuenta_rut ? 'Sí' : 'No')) +
        fila('Banco', s.banco) + fila('Tipo de cuenta', s.tipo_cuenta) + fila('N° de cuenta', s.numero_cuenta) +
        seccion('OBSERVACIONES') +
        `<tr><td colspan="2">${g.escapeHtml(s.observaciones || '—')}</td></tr>` +
        '</table>' +
        g.bloqueFirmas({ titulo: 'SOLICITANTE (TERRENO)', lineas: [s.solicitante_nombre || ''] }, { titulo: 'ADMINISTRACIÓN', lineas: [s.resuelto_por_nombre || ''] }, { margenTop: 40 })
    );
}

module.exports = {
    codigo: 'SOLICITUD_INGRESO',
    version: '1.0',
    titulo: 'Ficha de Solicitud de Ingreso',
    requiere: (ctx) => (ctx.solicitud ? [] : ['solicitud']),
    nombreBase: (ctx) => `Solicitud_Ingreso_${g.slug(ctx.solicitud.apellido_paterno)}_${g.slug(ctx.solicitud.nombres)}`,
    build,
    metadata: (ctx) => ({
        solicitud: { id: ctx.solicitud.id, estado: ctx.solicitud.estado, rut: ctx.solicitud.rut, solicitante: ctx.solicitud.solicitante_nombre || null, resuelto_por: ctx.solicitud.resuelto_por_nombre || null },
    }),
};
