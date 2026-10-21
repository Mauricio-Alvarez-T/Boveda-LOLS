/**
 * Tenencia de documentos en terreno (jefatura 2026-10-21): el portador puede tener un lote como máximo
 * 4 DÍAS HÁBILES. El día del retiro es el día 1 (lunes = 1 … jueves = 4); el viernes ya está fuera de
 * plazo. Sábados, domingos y feriados no cuentan. Retirado en un día no hábil, el día 1 es el primer
 * hábil siguiente.
 *
 * Puro: recibe fechas 'YYYY-MM-DD' (calendario chileno) y el Set de feriados en ese formato.
 */
const { sumarDias } = require('./fechaChile');

const MAX_DIAS_HABILES_TERRENO = 4;

/** Lunes a viernes y no feriado. */
function esHabil(iso, feriados) {
    const dow = new Date(`${iso}T12:00:00Z`).getUTCDay();
    return dow !== 0 && dow !== 6 && !feriados.has(iso);
}

/** Día hábil de tenencia hoy (1 = día del retiro). Nunca menos de 1. */
function diaTenencia(retiroIso, hoyIso, feriados = new Set()) {
    if (!retiroIso || !hoyIso || hoyIso < retiroIso) return 1;
    let n = 0;
    for (let d = retiroIso; d <= hoyIso; d = sumarDias(d, 1)) if (esHabil(d, feriados)) n += 1;
    return Math.max(1, n);
}

/** Último día hábil permitido ('YYYY-MM-DD'). */
function venceEl(retiroIso, feriados = new Set(), max = MAX_DIAS_HABILES_TERRENO) {
    let n = 0;
    let d = retiroIso;
    for (let i = 0; i < 60; i += 1) {
        if (esHabil(d, feriados)) { n += 1; if (n === max) return d; }
        d = sumarDias(d, 1);
    }
    return d;
}

/** { dia, max, vence_el, atrasado, dias_atraso } de un lote retirado el `retiroIso`. */
function tenencia(retiroIso, hoyIso, feriados = new Set(), max = MAX_DIAS_HABILES_TERRENO) {
    const dia = diaTenencia(retiroIso, hoyIso, feriados);
    return { dia, max, vence_el: venceEl(retiroIso, feriados, max), atrasado: dia > max, dias_atraso: Math.max(0, dia - max) };
}

module.exports = { MAX_DIAS_HABILES_TERRENO, esHabil, diaTenencia, venceEl, tenencia };
