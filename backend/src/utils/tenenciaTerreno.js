/**
 * Tenencia de documentos en terreno: el portador puede tener un lote como máximo 4 DÍAS HÁBILES.
 *
 * Corre desde la HORA EXACTA en que el portador confirma el retiro (dueño 2026-10-21; antes el día del
 * retiro contaba entero como día 1). Cada día termina al cumplirse un día hábil a esa misma hora, y el
 * plazo vence al cuarto: aceptado el mié 21 a las 16:26 → día 1 hasta el jue 22 16:26, día 2 hasta el
 * vie 23, día 3 hasta el lun 26, día 4 hasta el mar 27 16:26; desde ahí está atrasado. Sábados, domingos
 * y feriados no cuentan (el fin de semana queda dentro del día que lo cruza). Aceptado en un día no
 * hábil, el reloj parte el primer hábil siguiente a las 00:00.
 *
 * Puro: trabaja con el reloj de pared chileno como texto ('YYYY-MM-DD HH:MM', se compara como string) y
 * el Set de feriados 'YYYY-MM-DD'. Si falta la hora del retiro se toma 00:00, y si `ahora` es solo una
 * fecha se toma el final de ese día (23:59): así, sin horas, da la regla por días de antes.
 */
const { sumarDias } = require('./fechaChile');

const MAX_DIAS_HABILES_TERRENO = 4;

/** Lunes a viernes y no feriado. */
function esHabil(iso, feriados = new Set()) {
    const dow = new Date(`${iso}T12:00:00Z`).getUTCDay();
    return dow !== 0 && dow !== 6 && !feriados.has(iso);
}

/** Primer día hábil DESPUÉS de `iso`. */
function siguienteHabil(iso, feriados = new Set()) {
    let d = sumarDias(iso, 1);
    for (let i = 0; i < 60 && !esHabil(d, feriados); i += 1) d = sumarDias(d, 1);
    return d;
}

const conHora = (s, hora) => (String(s).length <= 10 ? `${String(s).slice(0, 10)} ${hora}` : String(s).slice(0, 16));

/** Desde cuándo corre el reloj: el retiro si fue en día hábil; si no, el hábil siguiente a las 00:00. */
function inicioTenencia(retiro, feriados = new Set()) {
    const r = conHora(retiro, '00:00');
    const fecha = r.slice(0, 10);
    return esHabil(fecha, feriados) ? { fecha, hora: r.slice(11) } : { fecha: siguienteHabil(fecha, feriados), hora: '00:00' };
}

/**
 * { dia, max, vence_el, vence_hora, atrasado, dias_atraso } de un lote retirado en `retiro`
 * ('YYYY-MM-DD HH:MM'), mirado en `ahora` ('YYYY-MM-DD HH:MM', hora de Chile). Si el reloj parte a las 00:00
 * (sin hora, o aceptado en día no hábil) cada día hábil cuenta entero: vence al final del cuarto y
 * `vence_hora` es null.
 */
function tenencia(retiro, ahora, feriados = new Set(), max = MAX_DIAS_HABILES_TERRENO) {
    const ini = inicioTenencia(retiro, feriados);
    const ya = conHora(ahora, '23:59');
    const porDia = ini.hora === '00:00';
    const fechas = [ini.fecha];
    /** k-ésimo día hábil desde el inicio (0 = el del inicio). */
    const habil = (k) => {
        while (fechas.length <= k) fechas.push(siguienteHabil(fechas[fechas.length - 1], feriados));
        return fechas[k];
    };
    /** ¿Ya terminó el día k de tenencia? A la misma hora un día hábil después, o al final del día si porDia. */
    const terminado = (k) => (porDia ? ya > `${habil(k - 1)} 23:59` : ya >= `${habil(k)} ${ini.hora}`);
    let dia = 1;
    if (`${ini.fecha} ${ini.hora}` <= ya) while (dia < 400 && terminado(dia)) dia += 1;
    return {
        dia, max,
        vence_el: porDia ? habil(max - 1) : habil(max),
        vence_hora: porDia ? null : ini.hora,
        atrasado: dia > max,
        dias_atraso: Math.max(0, dia - max),
    };
}

module.exports = { MAX_DIAS_HABILES_TERRENO, esHabil, siguienteHabil, inicioTenencia, tenencia };
