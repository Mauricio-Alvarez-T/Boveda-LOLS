/**
 * Fecha del calendario CHILENO ('YYYY-MM-DD'), no la de UTC.
 *
 * `new Date().toISOString()` entrega la fecha en UTC: desde las ~21:00 de Chile ya es "mañana", y el
 * Inicio preguntaba por la asistencia de un día que nadie ha marcado (bug visto el 2026-10-20).
 */
const FORMATO = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit',
});

/** 'YYYY-MM-DD' de `d` en Chile. */
const fechaChile = (d = new Date()) => FORMATO.format(d);

/** Suma `dias` a una fecha 'YYYY-MM-DD' sin pasar por zonas horarias. */
const sumarDias = (iso, dias) => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + dias)).toISOString().slice(0, 10);
};

const hoyChile = () => fechaChile();
const ayerChile = () => sumarDias(hoyChile(), -1);

const FORMATO_HORA = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

/** 'YYYY-MM-DD HH:MM' de `d` en Chile (reloj de pared; se compara como texto). */
const ahoraChile = (d = new Date()) => {
    const p = Object.fromEntries(FORMATO_HORA.formatToParts(d).map(x => [x.type, x.value]));
    return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
};

module.exports = { fechaChile, hoyChile, ayerChile, ahoraChile, sumarDias };
