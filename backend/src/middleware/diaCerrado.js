const { hoyChile } = require('../utils/fechaChile');

/**
 * Día cerrado (Marcos 2026-11-18: «que no tenga la opción de marcar la asistencia si ya pasó, que mejor lo vea
 * Daphne»; y el mismo día, confirmado por Daphne: «que en obra pasen asistencia si se olvidaron cualquier día del
 * mes»). Hora de Chile. Quién escribe la asistencia de un día que ya pasó:
 *   · `asistencia.dias_pasados` (RR.HH. y Super Administrador, mig 154): cualquier día.
 *   · `asistencia.dias_pasados_mes` (jefes de obra, mig 155): un día del MES EN CURSO; un mes anterior, no.
 *   · Los demás: solo hoy (o adelante).
 * Va DESPUÉS de `checkPermission('asistencia.guardar')` en cada ruta que escribe asistencia; los períodos (licencias,
 * vacaciones) no pasan por aquí: RR.HH. los sigue ingresando hacia atrás.
 */
const PERMISO_DIAS_PASADOS = 'asistencia.dias_pasados';
const PERMISO_DIAS_DEL_MES = 'asistencia.dias_pasados_mes';
const MENSAJE_DIA_CERRADO = 'Este día ya cerró: la asistencia se marca el mismo día. '
    + 'Un día que ya pasó solo lo puede marcar o corregir RR.HH.';
const MENSAJE_MES_CERRADO = 'Ese día es de un mes que ya cerró. '
    + 'Un día de un mes anterior solo lo puede marcar o corregir RR.HH.';

const soloFecha = (f) => (typeof f === 'string' && /^\d{4}-\d{2}-\d{2}/.test(f) ? f.slice(0, 10) : null);

/** Primer día del mes de `hoy` ('YYYY-MM-01'). */
const inicioDeMes = (hoy) => `${hoy.slice(0, 7)}-01`;

/** El día más antiguo de `fechas` anterior a `desde` (por defecto, hoy), o null. */
function primerDiaPasado(fechas, desde = hoyChile()) {
    const pasadas = (fechas || []).map(soloFecha).filter(f => f && f < desde).sort();
    return pasadas[0] ?? null;
}

/**
 * `fechasDe(req)` → las fechas que toca el pedido ('YYYY-MM-DD'; puede ser async). Si alguna es anterior a lo que la
 * persona puede escribir, 403 con `codigo: 'DIA_CERRADO'` y el día.
 */
const bloquearDiasPasados = (fechasDe) => async (req, res, next) => {
    try {
        const p = Array.isArray(req.user?.p) ? req.user.p : [];
        if (p.includes(PERMISO_DIAS_PASADOS)) return next();
        const hoy = hoyChile();
        const delMes = p.includes(PERMISO_DIAS_DEL_MES);
        const dia = primerDiaPasado(await fechasDe(req), delMes ? inicioDeMes(hoy) : hoy);
        if (!dia) return next();
        return res.status(403).json({ error: delMes ? MENSAJE_MES_CERRADO : MENSAJE_DIA_CERRADO, codigo: 'DIA_CERRADO', fecha: dia });
    } catch (err) {
        next(err);
    }
};

/** Fechas de los registros de /batch y /bulk. */
const fechasDeRegistros = (req) => (Array.isArray(req.body?.registros) ? req.body.registros.map(r => r?.fecha) : []);
/** La fecha del cuerpo (borrar el día, traslado de obra). */
const fechaDelCuerpo = (req) => [req.body?.fecha];

module.exports = {
    PERMISO_DIAS_PASADOS, PERMISO_DIAS_DEL_MES, MENSAJE_DIA_CERRADO, MENSAJE_MES_CERRADO,
    bloquearDiasPasados, primerDiaPasado, inicioDeMes, fechasDeRegistros, fechaDelCuerpo,
};
