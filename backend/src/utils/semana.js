/**
 * Helpers de SEMANA (lunes a viernes) — espejo de `frontend/src/utils/semanas.ts`.
 *
 * Las listas de actividades sugeridas no se asignan a un día sino a una semana,
 * identificada por la fecha de su LUNES ('YYYY-MM-DD'). Acá viven las conversiones
 * que comparten el servicio, el informe Excel y el log de actividad, para que la
 * etiqueta ("Semana lun 28/09 – vie 02/10") sea idéntica en toda la app.
 */

const pad2 = (n) => String(n).padStart(2, '0');

/** 'YYYY-MM-DD' desde string ISO (con o sin hora) o Date de mysql2. NULL si no es fecha. */
function isoDe(valor) {
    if (!valor) return null;
    if (valor instanceof Date) {
        if (Number.isNaN(valor.getTime())) return null;
        return `${valor.getFullYear()}-${pad2(valor.getMonth() + 1)}-${pad2(valor.getDate())}`;
    }
    const s = String(valor).slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

/** Date local a mediodía (inmune a TZ) desde 'YYYY-MM-DD'. */
function aMediodia(iso) {
    const d = new Date(iso + 'T12:00:00');
    return Number.isNaN(d.getTime()) ? null : d;
}

/** true si la fecha es lunes. */
function esLunesIso(valor) {
    const iso = isoDe(valor);
    if (!iso) return false;
    const d = aMediodia(iso);
    return !!d && d.getDay() === 1;
}

/** Viernes ('YYYY-MM-DD') de la semana cuyo lunes se indica. */
function viernesDe(valor) {
    const iso = isoDe(valor);
    if (!iso) return null;
    const d = aMediodia(iso);
    if (!d) return null;
    d.setDate(d.getDate() + 4);
    return isoDe(d);
}

/** "Semana lun 28/09 – vie 02/10" (o null si el valor no es una fecha). */
function labelSemana(valor) {
    const iso = isoDe(valor);
    if (!iso) return null;
    const lunes = aMediodia(iso);
    const viernes = aMediodia(viernesDe(iso));
    if (!lunes || !viernes) return null;
    const dm = (d) => `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}`;
    return `Semana lun ${dm(lunes)} – vie ${dm(viernes)}`;
}

module.exports = { isoDe, esLunesIso, viernesDe, labelSemana };
