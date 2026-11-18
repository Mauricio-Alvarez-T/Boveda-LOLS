const pool = require('../config/db');
const { hoyChile, sumarDias } = require('../utils/fechaChile');

/**
 * Obras que NO pasaron la lista en los días hábiles anteriores (Marcos 2026-11-18: «cuando una obra no pasa lista,
 * por ejemplo ayer, porque al jefe de obra se le olvidó, que Daphne lo vea en el Inicio y al entrar al otro día»).
 *
 * La tarjeta «Asistencia» del Inicio ya avisa las obras que faltan HOY (`attendanceStatus` de /dashboard/summary);
 * esto mira hacia atrás: los últimos `DIAS_HABILES` días de lunes a viernes, sin feriados activos y sin hoy. En
 * cuanto alguien guarda ese día, la obra deja de aparecer.
 *
 * Mismo criterio que «guardada hoy» (dashboard.service, dueño 2026-11-18):
 * - Solo las obras que deben marcar: activas, no finalizadas ni de prueba, `participa_asistencia = 1`, ya iniciadas
 *   ese día (`fecha_inicio` vacía o anterior) y con al menos un trabajador activo que ya había ingresado.
 * - «Pasó la lista» = hay filas de ese día que no cubre un período activo (licencia, vacaciones, permiso escriben su
 *   fila por adelantado y solas NO cuentan); si TODA la dotación tiene fila (todos de licencia), también cuenta.
 *
 * Qué pasó en cada día: `nadie` (ninguna fila) o `solo_periodos` (solo las filas de licencias o vacaciones). Para
 * saber a quién preguntar: el encargado de la obra y quién guardó su última lista antes de hoy.
 */

const DIAS_HABILES = 5;
/** Días corridos hacia atrás que se revisan para juntar los hábiles (alcanza con dos semanas de feriados). */
const MAX_CORRIDOS = 21;

const esFinDeSemana = (iso) => {
    const [y, m, d] = iso.split('-').map(Number);
    const dia = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    return dia === 0 || dia === 6;
};

/** Los `n` días hábiles anteriores a `hoy` ('YYYY-MM-DD'), del más reciente al más antiguo. */
async function diasHabilesAnteriores(hoy, n = DIAS_HABILES) {
    const candidatos = [];
    for (let i = 1; i <= MAX_CORRIDOS; i++) {
        const dia = sumarDias(hoy, -i);
        if (!esFinDeSemana(dia)) candidatos.push(dia);
    }
    const [feriados] = await pool.query(
        `SELECT DATE_FORMAT(fecha, '%Y-%m-%d') AS fecha FROM feriados
         WHERE activo = 1 AND fecha BETWEEN ? AND ?`,
        [candidatos[candidatos.length - 1], candidatos[0]]
    );
    const libres = new Set(feriados.map(f => f.fecha));
    return candidatos.filter(d => !libres.has(d)).slice(0, n);
}

/** Igual que `guardadaHoy` del resumen: filas propias, o fila para toda la dotación. */
function paso(fila) {
    const registros = Number(fila.registros) || 0;
    const propios = fila.propios == null ? registros : Number(fila.propios);
    const dotacion = Number(fila.dotacion) || 0;
    return propios > 0 || (registros > 0 && registros >= dotacion);
}

async function getSinLista(obraId = null) {
    const hoy = hoyChile();
    const dias = await diasHabilesAnteriores(hoy);
    if (dias.length === 0) return { hoy, dias, obras: [] };

    const fechas = dias.map(() => 'SELECT ? AS fecha').join(' UNION ALL ');
    const [filas] = await pool.query(
        `SELECT o.id AS obra_id, o.nombre AS obra, o.encargado_nombre AS encargado, d.fecha,
                COUNT(a.id) AS registros,
                COUNT(CASE WHEN a.id IS NOT NULL AND NOT EXISTS (
                    SELECT 1 FROM periodos_ausencia p
                    WHERE p.trabajador_id = a.trabajador_id AND p.activo = 1
                      AND p.fecha_inicio <= a.fecha AND p.fecha_fin >= a.fecha
                ) THEN 1 END) AS propios,
                (SELECT COUNT(*) FROM trabajadores t
                 WHERE t.obra_id = o.id AND t.activo = 1 AND t.es_prueba = 0
                   AND (t.fecha_ingreso IS NULL OR t.fecha_ingreso <= d.fecha)) AS dotacion
         FROM obras o
         CROSS JOIN (${fechas}) d
         LEFT JOIN asistencias a ON a.obra_id = o.id AND a.fecha = d.fecha
         WHERE o.activa = 1 AND o.es_prueba = 0 AND o.finalizada = 0
           AND o.participa_asistencia = 1
           AND (o.fecha_inicio IS NULL OR o.fecha_inicio <= d.fecha)
           ${obraId ? 'AND o.id = ?' : ''}
         GROUP BY o.id, o.nombre, o.encargado_nombre, d.fecha`,
        [...dias, ...(obraId ? [Number(obraId)] : [])]
    );

    const porObra = new Map();
    for (const f of filas) {
        if ((Number(f.dotacion) || 0) === 0 || paso(f)) continue;
        const fecha = String(f.fecha).slice(0, 10);
        if (!porObra.has(f.obra_id)) {
            porObra.set(f.obra_id, {
                obra_id: f.obra_id, obra: f.obra, encargado: f.encargado || null,
                dotacion: Number(f.dotacion) || 0, dias: [], ultima: null,
            });
        }
        const o = porObra.get(f.obra_id);
        o.dias.push({ fecha, motivo: Number(f.registros) > 0 ? 'solo_periodos' : 'nadie', registros: Number(f.registros) || 0 });
        o.dotacion = Math.max(o.dotacion, Number(f.dotacion) || 0);
    }
    const obras = [...porObra.values()];

    // Última lista de cada obra antes de hoy y quién la guardó (pocas obras: una consulta cada una).
    await Promise.all(obras.map(async (o) => {
        const [ult] = await pool.query(
            `SELECT DATE_FORMAT(a.fecha, '%Y-%m-%d') AS fecha, u.nombre AS por
             FROM asistencias a
             LEFT JOIN usuarios u ON u.id = a.registrado_por
             WHERE a.obra_id = ? AND a.fecha < ?
               AND NOT EXISTS (
                   SELECT 1 FROM periodos_ausencia p
                   WHERE p.trabajador_id = a.trabajador_id AND p.activo = 1
                     AND p.fecha_inicio <= a.fecha AND p.fecha_fin >= a.fecha)
             ORDER BY a.fecha DESC, a.updated_at DESC
             LIMIT 1`,
            [o.obra_id, hoy]
        );
        o.ultima = ult[0] ? { fecha: ult[0].fecha, por: ult[0].por || null } : null;
    }));

    for (const o of obras) o.dias.sort((x, y) => y.fecha.localeCompare(x.fecha));
    // Primero la que más días lleva sin lista; luego la del día más reciente; luego por nombre.
    obras.sort((x, y) => (y.dias.length - x.dias.length)
        || y.dias[0].fecha.localeCompare(x.dias[0].fecha)
        || String(x.obra).localeCompare(String(y.obra), 'es'));

    return { hoy, dias, obras };
}

module.exports = { getSinLista, _internal: { diasHabilesAnteriores, paso, DIAS_HABILES } };
