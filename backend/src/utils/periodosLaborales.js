/**
 * Períodos laborales de un trabajador (reingreso, mig 152 — docs/reglas/rrhh-trabajadores.md
 * § Reingreso y períodos laborales). Módulo PURO: sin DB.
 *
 *  · Período ACTUAL  = [trabajadores.fecha_ingreso, trabajadores.fecha_desvinculacion | abierto].
 *  · Períodos CERRADOS = filas de trabajador_desvinculaciones con reactivado_en (el trabajador volvió):
 *    [fecha_ingreso_periodo, fecha_desvinculacion]. Los carga desvinculacionService.periodosCerrados.
 *
 * Un trabajador sin cerrados tiene UN período: el comportamiento de siempre (antes del contrato o
 * después del finiquito = fuera). Los reactivados con el flujo viejo (ingreso sin mover) quedan con
 * períodos solapados: la unión cubre todo, igual que antes del reingreso.
 *
 * Nombre: «período» a secas ya es la ausencia (periodos_ausencia, /asistencias/periodos).
 */

/** Date | 'YYYY-MM-DD…' → 'YYYY-MM-DD' en hora local; null si vacío. */
function toYmd(v) {
    if (!v) return null;
    if (v instanceof Date) {
        if (Number.isNaN(v.getTime())) return null;
        const p = n => String(n).padStart(2, '0');
        return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`;
    }
    const s = String(v).slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

/**
 * Lista ordenada de períodos {desde, hasta} (YYYY-MM-DD o null = sin límite).
 * @param {{fecha_ingreso?, fecha_desvinculacion?}} trab
 * @param {Array<{desde?, hasta?, fecha_ingreso_periodo?, fecha_desvinculacion?}>} cerrados
 */
function periodosDe(trab, cerrados = []) {
    const lista = (cerrados || []).map(c => ({
        desde: toYmd(c.desde ?? c.fecha_ingreso_periodo),
        hasta: toYmd(c.hasta ?? c.fecha_desvinculacion),
    }));
    lista.sort((a, b) => String(a.desde || '').localeCompare(String(b.desde || '')));
    lista.push({ desde: toYmd(trab?.fecha_ingreso), hasta: toYmd(trab?.fecha_desvinculacion) });
    return lista;
}

const dentro = (fecha, p) => (!p.desde || fecha >= p.desde) && (!p.hasta || fecha <= p.hasta);

/**
 * Motivo por el que `fecha` cae fuera de todo período, o null si está dentro de alguno.
 * 'pre_contrato' (antes del primero) | 'finiquitado' (después del último, ya cerrado) |
 * 'entre_periodos' (hueco entre una baja y el reingreso). Sin períodos → null.
 */
function motivoFuera(fecha, periodos) {
    const f = toYmd(fecha);
    if (!f || !periodos || !periodos.length) return null;
    if (periodos.some(p => dentro(f, p))) return null;
    const desdes = periodos.map(p => p.desde).filter(Boolean);
    if (desdes.length && f < desdes.reduce((a, b) => (a < b ? a : b))) return 'pre_contrato';
    const ultimo = periodos[periodos.length - 1];
    if (ultimo.hasta && f > ultimo.hasta) return 'finiquitado';
    return 'entre_periodos';
}

const dentroDeAlgunPeriodo = (fecha, periodos) => motivoFuera(fecha, periodos) === null;

/** Mensaje para la guarda de asistencia (400). */
function mensajeFuera(motivo, fecha, trabajadorId) {
    const quien = trabajadorId != null ? ` del trabajador ID ${trabajadorId}` : '';
    if (motivo === 'pre_contrato') return `No se puede registrar asistencia antes de la fecha de contratación${quien} (${fecha})`;
    if (motivo === 'finiquitado') return `No se puede registrar asistencia después de la fecha de finiquito${quien} (${fecha})`;
    return `No se puede registrar asistencia entre dos períodos laborales${quien}: no trabajaba en la empresa (${fecha})`;
}

/**
 * Subconsulta correlacionada (alias `t` = trabajadores) que trae los períodos cerrados como texto
 * 'desde|hasta,desde|hasta' en la MISMA fila del trabajador: las guardas de asistencia no suman queries.
 * Sin la mig 112 la query falla con 1146 → el caller reintenta sin ella (SQL_SIN_CERRADOS).
 */
const sqlCerrados = (alias = 't') => `(SELECT GROUP_CONCAT(CONCAT(IFNULL(dp.fecha_ingreso_periodo, ''), '|', dp.fecha_desvinculacion)
                         ORDER BY dp.fecha_desvinculacion SEPARATOR ',')
                    FROM trabajador_desvinculaciones dp
                   WHERE dp.trabajador_id = ${alias}.id AND dp.reactivado_en IS NOT NULL) AS periodos_cerrados`;
const SQL_CERRADOS = sqlCerrados('t');
const SQL_SIN_CERRADOS = 'NULL AS periodos_cerrados';

/** 'desde|hasta,desde|hasta' → [{desde, hasta}] (tolera null/'' → []). */
function parseCerrados(texto) {
    if (!texto) return [];
    return String(texto).split(',').map(par => {
        const [desde, hasta] = par.split('|');
        return { desde: toYmd(desde), hasta: toYmd(hasta) };
    }).filter(p => p.hasta);
}

/** 'YYYY-MM-DD' + 1 día (hora local). */
function sumarUnDia(ymd) {
    const [y, m, d] = String(ymd).split('-').map(Number);
    return toYmd(new Date(y, m - 1, d + 1));
}

module.exports = { toYmd, periodosDe, motivoFuera, dentroDeAlgunPeriodo, mensajeFuera, parseCerrados, sumarUnDia, sqlCerrados, SQL_CERRADOS, SQL_SIN_CERRADOS };
