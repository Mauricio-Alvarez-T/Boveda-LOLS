const db = require('../config/db');

/**
 * Días hábiles en Chile: de lunes a viernes y sin feriados (tabla `feriados`, Configuración → Feriados; los de una obra
 * no cuentan). Lo usan los recordatorios de pendientes (avisosPendientes.service.js) y el aviso de errores a los
 * programadores (soporteErrores.service.js, de 7:30 a 18:00).
 */

/** Fecha, minuto y día de la semana en Chile (el servidor puede estar en otra zona horaria). */
function ahoraChile(d = new Date()) {
    const p = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short',
    }).formatToParts(d);
    const g = (t) => p.find(x => x.type === t).value;
    return { fecha: `${g('year')}-${g('month')}-${g('day')}`, minutos: (Number(g('hour')) % 24) * 60 + Number(g('minute')), dia: g('weekday') };
}

const finDeSemana = (ahora) => ahora.dia === 'Sat' || ahora.dia === 'Sun';

/** ¿Ese día (AAAA-MM-DD) es feriado para todos? */
async function esFeriado(fecha) {
    const [[f]] = await db.query("SELECT COUNT(*) AS n FROM feriados WHERE fecha = ? AND activo = 1 AND tipo <> 'obra'", [fecha]);
    return Number(f?.n) > 0;
}

module.exports = { ahoraChile, finDeSemana, esFeriado };
