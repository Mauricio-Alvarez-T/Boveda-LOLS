/**
 * Cálculos puros del Análisis de trabajadores (Gestiones → Análisis, mig 163). Sin DB: el service trae
 * las filas y acá se arman series, tramos y conteos. Fechas 'YYYY-MM-DD' / meses 'YYYY-MM'.
 */
const { periodosDe, parseCerrados, toYmd } = require('./periodosLaborales');

const RE_MES = /^\d{4}-(0[1-9]|1[0-2])$/;
const MAX_MESES = 24;
const MESES_DEFECTO = 12;

const mesDe = (ymd) => String(ymd).slice(0, 7);
function sumarMeses(mes, n) {
    const [y, m] = mes.split('-').map(Number);
    const d = new Date(y, m - 1 + n, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function ultimoDia(mes) {
    const [y, m] = mes.split('-').map(Number);
    const d = new Date(y, m, 0);
    return `${mes}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Rango de meses del análisis. `desde`/`hasta` = 'YYYY-MM' (inválidos se ignoran). Por defecto los 12
 * meses que terminan en el actual; máximo 24 (se recorta desde el inicio). `hasta` nunca pasa del mes
 * actual. Devuelve los meses, el primer día y el último día (este no pasa de hoy).
 */
function rangoMeses(query = {}, hoy) {
    const mesHoy = mesDe(hoy);
    let hasta = RE_MES.test(String(query.hasta || '')) ? String(query.hasta) : mesHoy;
    if (hasta > mesHoy) hasta = mesHoy;
    let desde = RE_MES.test(String(query.desde || '')) ? String(query.desde) : sumarMeses(hasta, -(MESES_DEFECTO - 1));
    if (desde > hasta) desde = hasta;
    const meses = [];
    for (let m = desde; m <= hasta && meses.length < 120; m = sumarMeses(m, 1)) meses.push(m);
    const recortados = meses.length > MAX_MESES ? meses.slice(-MAX_MESES) : meses;
    const finRango = ultimoDia(recortados[recortados.length - 1]);
    return {
        meses: recortados,
        fechaDesde: `${recortados[0]}-01`,
        fechaHasta: finRango > hoy ? hoy : finRango,
    };
}

/** Períodos laborales de una fila con fecha_ingreso, fecha_desvinculacion y periodos_cerrados. */
const periodosFila = (t) => periodosDe(
    { fecha_ingreso: toYmd(t.fecha_ingreso), fecha_desvinculacion: toYmd(t.fecha_desvinculacion) },
    parseCerrados(t.periodos_cerrados)
);
const cubre = (p, fecha) => (!p.desde || p.desde <= fecha) && (!p.hasta || p.hasta >= fecha);

/**
 * Por mes: dotación al cierre (trabajadores con algún período que cubre el último día del mes, o hoy si
 * es el mes en curso) e ingresos (períodos que empiezan en el mes; un reingreso cuenta como ingreso, un
 * período repetido por el flujo viejo de reactivar NO se cuenta dos veces).
 */
function serieDotacion(trabajadores, meses, hoy) {
    const filas = trabajadores.map(t => {
        const ps = periodosFila(t);
        const inicios = [...new Set(ps.map(p => p.desde).filter(Boolean))].sort();
        return { ps, inicios };
    });
    return meses.map(mes => {
        const corte = ultimoDia(mes) > hoy ? hoy : ultimoDia(mes);
        let dotacion = 0;
        let ingresos = 0;
        let reingresos = 0;
        for (const f of filas) {
            if (f.ps.some(p => cubre(p, corte))) dotacion += 1;
            f.inicios.forEach((d, i) => {
                if (mesDe(d) !== mes) return;
                ingresos += 1;
                if (i > 0) reingresos += 1; // no es su primer ingreso: volvió
            });
        }
        return { mes, dotacion, ingresos, reingresos, parcial: mes === mesDe(hoy) };
    });
}

/** Años cumplidos entre dos fechas 'YYYY-MM-DD'. */
function aniosEntre(desde, hasta) {
    const [y1, m1, d1] = desde.split('-').map(Number);
    const [y2, m2, d2] = hasta.split('-').map(Number);
    return y2 - y1 - ((m2 < m1 || (m2 === m1 && d2 < d1)) ? 1 : 0);
}
const diasEntre = (desde, hasta) => Math.round((Date.UTC(...hasta.split('-').map((n, i) => Number(n) - (i === 1 ? 1 : 0)))
    - Date.UTC(...desde.split('-').map((n, i) => Number(n) - (i === 1 ? 1 : 0)))) / 86400000);

const TRAMOS_EDAD = ['Menos de 25', '25 a 34', '35 a 44', '45 a 54', '55 a 64', '65 o más'];
function tramoEdad(fechaNacimiento, hoy) {
    const f = toYmd(fechaNacimiento);
    if (!f) return 'Sin dato';
    const e = aniosEntre(f, hoy);
    if (e < 14 || e > 100) return 'Sin dato';
    if (e < 25) return TRAMOS_EDAD[0];
    if (e < 35) return TRAMOS_EDAD[1];
    if (e < 45) return TRAMOS_EDAD[2];
    if (e < 55) return TRAMOS_EDAD[3];
    if (e < 65) return TRAMOS_EDAD[4];
    return TRAMOS_EDAD[5];
}

const TRAMOS_ANTIGUEDAD = ['Menos de 3 meses', '3 a 6 meses', '6 a 12 meses', '1 a 2 años', '2 a 5 años', '5 años o más'];
/** Antigüedad del período actual (desde fecha_ingreso). */
function tramoAntiguedad(fechaIngreso, hoy) {
    const f = toYmd(fechaIngreso);
    if (!f || f > hoy) return 'Sin dato';
    const d = diasEntre(f, hoy);
    if (d < 91) return TRAMOS_ANTIGUEDAD[0];
    if (d < 183) return TRAMOS_ANTIGUEDAD[1];
    if (d < 365) return TRAMOS_ANTIGUEDAD[2];
    if (d < 730) return TRAMOS_ANTIGUEDAD[3];
    if (d < 1826) return TRAMOS_ANTIGUEDAD[4];
    return TRAMOS_ANTIGUEDAD[5];
}

/**
 * Cuenta por etiqueta → [{ etiqueta, n }] ordenado de mayor a menor (o por `orden` si se da).
 * Vacíos → 'Sin dato'. `top` recorta y junta el resto en 'Otros'.
 */
function contar(lista, fn, { orden = null, top = null } = {}) {
    const m = new Map();
    for (const x of lista) {
        const v = fn(x);
        const k = v == null || String(v).trim() === '' ? 'Sin dato' : String(v).trim();
        m.set(k, (m.get(k) || 0) + 1);
    }
    let res = [...m.entries()].map(([etiqueta, n]) => ({ etiqueta, n }));
    if (orden) {
        const idx = (e) => { const i = orden.indexOf(e); return i === -1 ? orden.length + (e === 'Sin dato' ? 1 : 0) : i; };
        res.sort((a, b) => idx(a.etiqueta) - idx(b.etiqueta));
    } else {
        res.sort((a, b) => b.n - a.n || a.etiqueta.localeCompare(b.etiqueta));
    }
    if (top && res.length > top) {
        const resto = res.slice(top).reduce((s, x) => s + x.n, 0);
        res = [...res.slice(0, top), { etiqueta: 'Otros', n: resto }];
    }
    return res;
}

/**
 * Agrupa filas por un id y su nombre → [{ id, etiqueta, n }] de mayor a menor. Sin id → 'Sin dato' (id null).
 * `extra(fila)` suma campos propios del grupo (p. ej. finalizada).
 */
function agrupar(lista, idKey, labelKey, extra = null) {
    const m = new Map();
    for (const x of lista) {
        const id = x[idKey] == null ? null : x[idKey];
        const k = id == null ? 'null' : String(id);
        const g = m.get(k) || { id, etiqueta: id == null ? 'Sin dato' : (x[labelKey] || `#${id}`), n: 0, ...(extra ? extra(x) : {}) };
        g.n += Number(x.n ?? 1) || 0;
        m.set(k, g);
    }
    return [...m.values()].sort((a, b) => b.n - a.n || String(a.etiqueta).localeCompare(String(b.etiqueta), 'es'));
}

function mediana(nums) {
    const v = nums.filter(n => Number.isFinite(n)).sort((a, b) => a - b);
    if (!v.length) return null;
    const m = Math.floor(v.length / 2);
    return v.length % 2 ? v[m] : Math.round((v[m - 1] + v[m]) / 2);
}

const porcentaje = (n, total) => (total > 0 ? Math.round((n / total) * 1000) / 10 : null);

module.exports = {
    rangoMeses, serieDotacion, agrupar, tramoEdad, tramoAntiguedad, contar, mediana, porcentaje, diasEntre,
    TRAMOS_EDAD, TRAMOS_ANTIGUEDAD, sumarMeses, ultimoDia, mesDe,
};
