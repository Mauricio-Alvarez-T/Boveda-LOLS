const pool = require('../config/db');
const logger = require('../utils/logger-structured');
const { hoyChile, sumarDias } = require('../utils/fechaChile');

/**
 * Detalle «Asistencia» del Inicio, fase 2 (dueño 2026-10-20, detalle «Por urgencia»). Se pide solo al
 * abrir el detalle (no pesa en /dashboard/summary). Tres bloques, cada uno con su permiso:
 *
 * - `proximos`   (asistencia.ver; los períodos además con asistencia.periodo.ver): lo que viene en los
 *                próximos 14 días — inicios y términos de períodos (licencias, vacaciones…) y feriados.
 * - `descuentos` (asistencia.exportar_excel, el mismo permiso del Excel de remuneraciones): días del mes
 *                en estados que NO cuentan como día trabajado (F, LM, PSG…), por trabajador, más los días
 *                JI. Es una referencia rápida: el cálculo oficial (base 30, horas JI) es el Excel del mes.
 * - `horasExtra` (asistencia.horas_extra.ver, dato sensible de pago): horas extra del mes por obra.
 *
 * Todo con la fila vigente (un estado por trabajador y día) y sin obras ni trabajadores de prueba.
 * Fechas siempre como 'YYYY-MM-DD' desde SQL (DATE_FORMAT), para no pasar por zonas horarias.
 */

const DIAS_PROXIMOS = 14;

// Fila vigente: con duplicados del mismo día en otras obras cuenta solo la más nueva (asistencia.md).
const VIGENTE = `AND NOT EXISTS (
        SELECT 1 FROM asistencias a2
        WHERE a2.trabajador_id = a.trabajador_id AND a2.fecha = a.fecha
          AND a2.obra_id <> a.obra_id AND a2.id > a.id)`;

const tiene = (permisos, clave) => Array.isArray(permisos) && permisos.includes(clave);

/** Primer y último día del mes de `iso` ('YYYY-MM-DD'). */
function rangoMes(iso) {
    const [y, m] = iso.split('-').map(Number);
    const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const mm = String(m).padStart(2, '0');
    return { desde: `${y}-${mm}-01`, hasta: `${y}-${mm}-${String(ultimo).padStart(2, '0')}` };
}

async function proximos(obraId, permisos, hoy) {
    const hasta = sumarDias(hoy, DIAS_PROXIMOS);
    const eventos = [];

    if (tiene(permisos, 'asistencia.periodo.ver')) {
        const filtroObra = obraId ? 'AND t.obra_id = ?' : '';
        const [periodos] = await pool.query(
            `SELECT p.id, DATE_FORMAT(p.fecha_inicio, '%Y-%m-%d') AS inicio, DATE_FORMAT(p.fecha_fin, '%Y-%m-%d') AS fin,
                    ea.codigo, ea.nombre AS estado, t.id AS trabajador_id, t.rut, t.nombres, t.apellido_paterno,
                    o.nombre AS obra
             FROM periodos_ausencia p
             JOIN estados_asistencia ea ON ea.id = p.estado_id
             JOIN trabajadores t ON t.id = p.trabajador_id
             LEFT JOIN obras o ON o.id = t.obra_id
             WHERE p.activo = 1 AND t.activo = 1 AND t.es_prueba = 0
               AND ((p.fecha_inicio > ? AND p.fecha_inicio <= ?) OR (p.fecha_fin >= ? AND p.fecha_fin < ?))
               ${filtroObra}`,
            [hoy, hasta, hoy, hasta, ...(obraId ? [Number(obraId)] : [])]
        );
        for (const p of periodos) {
            const persona = {
                trabajador_id: p.trabajador_id, rut: p.rut, nombres: p.nombres,
                apellido_paterno: p.apellido_paterno, obra: p.obra,
            };
            if (p.inicio > hoy && p.inicio <= hasta) {
                eventos.push({ tipo: 'inicio', fecha: p.inicio, codigo: p.codigo, estado: p.estado, hasta: p.fin, ...persona });
            }
            if (p.fin >= hoy && p.fin < hasta) {
                // Vuelve al día siguiente del término (el front muestra el día hábil que corresponda).
                eventos.push({ tipo: 'fin', fecha: p.fin, codigo: p.codigo, estado: p.estado, vuelve: sumarDias(p.fin, 1), ...persona });
            }
        }
    }

    const [feriados] = await pool.query(
        `SELECT DATE_FORMAT(fecha, '%Y-%m-%d') AS fecha, nombre, irrenunciable
         FROM feriados WHERE activo = 1 AND fecha BETWEEN ? AND ?`,
        [hoy, hasta]
    );
    for (const f of feriados) {
        eventos.push({ tipo: 'feriado', fecha: f.fecha, nombre: f.nombre, irrenunciable: !!f.irrenunciable });
    }

    const orden = { feriado: 0, fin: 1, inicio: 2 };
    eventos.sort((x, y) => x.fecha.localeCompare(y.fecha)
        || orden[x.tipo] - orden[y.tipo]
        || String(x.apellido_paterno ?? '').localeCompare(String(y.apellido_paterno ?? ''), 'es'));
    return { desde: hoy, hasta, eventos };
}

async function descuentos(obraId, desde, hasta) {
    const filtroObra = obraId ? 'AND a.obra_id = ?' : '';
    const [filas] = await pool.query(
        `SELECT a.trabajador_id, t.rut, t.nombres, t.apellido_paterno, ea.codigo, COUNT(DISTINCT a.fecha) AS dias
         FROM asistencias a
         JOIN estados_asistencia ea ON ea.id = a.estado_id
         JOIN trabajadores t ON t.id = a.trabajador_id
         JOIN obras o ON o.id = a.obra_id
         WHERE a.fecha BETWEEN ? AND ? AND t.es_prueba = 0 AND o.es_prueba = 0
           AND (ea.cuenta_dia_trabajado = 0 OR ea.codigo = 'JI')
           ${VIGENTE} ${filtroObra}
         GROUP BY a.trabajador_id, t.rut, t.nombres, t.apellido_paterno, ea.codigo`,
        [desde, hasta, ...(obraId ? [Number(obraId)] : [])]
    );

    const porTrabajador = new Map();
    const codigos = new Set();
    for (const f of filas) {
        const t = porTrabajador.get(f.trabajador_id) || {
            trabajador_id: f.trabajador_id, rut: f.rut, nombres: f.nombres, apellido_paterno: f.apellido_paterno,
            dias: {}, ji: 0, total: 0,
        };
        const n = Number(f.dias) || 0;
        if (f.codigo === 'JI') {
            t.ji += n;
        } else {
            t.dias[f.codigo] = n;
            t.total += n;
            codigos.add(f.codigo);
        }
        porTrabajador.set(f.trabajador_id, t);
    }
    // Más días a descontar arriba; los que solo tienen JI al final.
    const lista = [...porTrabajador.values()].sort((x, y) =>
        y.total - x.total || y.ji - x.ji
        || String(x.apellido_paterno ?? '').localeCompare(String(y.apellido_paterno ?? ''), 'es'));
    // F primero (riesgo legal), luego el resto por orden alfabético.
    const columnas = [...codigos].sort((x, y) => (x === 'F' ? -1 : y === 'F' ? 1 : x.localeCompare(y)));
    return {
        desde, hasta, columnas,
        trabajadores: lista.length,
        dias: lista.reduce((s, t) => s + t.total, 0),
        lista: lista.slice(0, 100),
    };
}

async function horasExtra(obraId, desde, hasta) {
    const filtroObra = obraId ? 'AND a.obra_id = ?' : '';
    const [filas] = await pool.query(
        `SELECT o.id AS obra_id, o.nombre AS obra, SUM(a.horas_extra) AS horas, COUNT(DISTINCT a.trabajador_id) AS trabajadores
         FROM asistencias a
         JOIN trabajadores t ON t.id = a.trabajador_id
         JOIN obras o ON o.id = a.obra_id
         WHERE a.fecha BETWEEN ? AND ? AND a.horas_extra > 0 AND t.es_prueba = 0 AND o.es_prueba = 0
           ${VIGENTE} ${filtroObra}
         GROUP BY o.id, o.nombre
         ORDER BY horas DESC`,
        [desde, hasta, ...(obraId ? [Number(obraId)] : [])]
    );
    const porObra = filas.map(f => ({
        obra_id: f.obra_id, obra: f.obra,
        horas: Math.round((Number(f.horas) || 0) * 100) / 100,
        trabajadores: Number(f.trabajadores) || 0,
    }));
    return { desde, hasta, total: Math.round(porObra.reduce((s, o) => s + o.horas, 0) * 100) / 100, porObra };
}

/**
 * Bloques del detalle según permisos. Un bloque sin permiso llega `null` (el front no lo dibuja); un
 * bloque que falla también llega `null` y no tumba a los otros.
 */
async function getDetalle(obraId, permisos) {
    const hoy = hoyChile();
    const { desde, hasta } = rangoMes(hoy);
    const seguro = (fn) => fn().catch((err) => {
        logger.error('[Inicio] Error en el detalle de asistencia', { err: err.message });
        return null;
    });
    const [p, d, h] = await Promise.all([
        seguro(() => proximos(obraId, permisos, hoy)),
        tiene(permisos, 'asistencia.exportar_excel') ? seguro(() => descuentos(obraId, desde, hasta)) : null,
        tiene(permisos, 'asistencia.horas_extra.ver') ? seguro(() => horasExtra(obraId, desde, hasta)) : null,
    ]);
    return { hoy, proximos: p, descuentos: d, horasExtra: h };
}

module.exports = { getDetalle, _internal: { rangoMes } };
