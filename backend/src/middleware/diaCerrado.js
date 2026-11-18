const { hoyChile } = require('../utils/fechaChile');

/**
 * Día cerrado (Marcos 2026-11-18: «que no tenga la opción de marcar la asistencia si ya pasó, que mejor lo vea
 * Daphne»). La asistencia se marca el MISMO día, hora de Chile. Un día anterior solo lo marca, corrige, borra o
 * traslada quien tenga `asistencia.dias_pasados` (RR.HH. y Super Administrador, mig 154). Va DESPUÉS de
 * `checkPermission('asistencia.guardar')` en cada ruta que escribe asistencia; los períodos (licencias, vacaciones)
 * no pasan por aquí: RR.HH. los sigue ingresando hacia atrás.
 */
const PERMISO_DIAS_PASADOS = 'asistencia.dias_pasados';
const MENSAJE_DIA_CERRADO = 'Este día ya cerró: la asistencia se marca el mismo día. '
    + 'Un día que ya pasó solo lo puede marcar o corregir RR.HH.';

const soloFecha = (f) => (typeof f === 'string' && /^\d{4}-\d{2}-\d{2}/.test(f) ? f.slice(0, 10) : null);

/** El día más antiguo de `fechas` que ya pasó (o null). */
function primerDiaPasado(fechas, hoy = hoyChile()) {
    const pasadas = (fechas || []).map(soloFecha).filter(f => f && f < hoy).sort();
    return pasadas[0] ?? null;
}

/**
 * `fechasDe(req)` → las fechas que toca el pedido ('YYYY-MM-DD'; puede ser async). Si alguna ya pasó y la persona no
 * tiene el permiso, 403 con `codigo: 'DIA_CERRADO'` y el día.
 */
const bloquearDiasPasados = (fechasDe) => async (req, res, next) => {
    try {
        if (Array.isArray(req.user?.p) && req.user.p.includes(PERMISO_DIAS_PASADOS)) return next();
        const dia = primerDiaPasado(await fechasDe(req));
        if (!dia) return next();
        return res.status(403).json({ error: MENSAJE_DIA_CERRADO, codigo: 'DIA_CERRADO', fecha: dia });
    } catch (err) {
        next(err);
    }
};

/** Fechas de los registros de /batch y /bulk. */
const fechasDeRegistros = (req) => (Array.isArray(req.body?.registros) ? req.body.registros.map(r => r?.fecha) : []);
/** La fecha del cuerpo (borrar el día, traslado de obra). */
const fechaDelCuerpo = (req) => [req.body?.fecha];

module.exports = {
    PERMISO_DIAS_PASADOS, MENSAJE_DIA_CERRADO, bloquearDiasPasados, primerDiaPasado, fechasDeRegistros, fechaDelCuerpo,
};
