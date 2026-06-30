/**
 * Reporte Semanal RRHH — armado de datos + render HTML del correo.
 *
 * Primera automatización de Bóveda LOLS. Corre todos los lunes 08:00 vía cron de
 * cPanel (NO node-cron — Passenger duerme el proceso, ver RUNBOOK §4.1). El script
 * `scripts/reporte_semanal.js` orquesta este servicio + el envío.
 *
 * Diseño: las funciones de datos (`buildReportData`) reciben un `db` (pool mysql2)
 * inyectado para poder testearlas con un mock. El render (`renderHtml`) es puro
 * (no toca DB ni red) → 100% testeable.
 *
 * Secciones del reporte (ventana = semana anterior, lunes a domingo):
 *   1. Contrataciones nuevas (fecha_ingreso en la ventana) + empresa + obra + cargo.
 *   2. Desvinculaciones (fecha_desvinculacion en la ventana).
 *   3. Faltas injustificadas (asistencias con estado código 'A') con sus fechas.
 *   4. Aniversarios: trabajadores que cumplen 10 meses de antigüedad en el mes actual.
 *
 * Gráficos (opcionales): si `data.tendencias` está presente, el render incluye
 * barras email-safe (HTML puro, sin imágenes) con la evolución mensual.
 */

const fs = require('fs');
const path = require('path');
const emailService = require('./email.service');
const logger = require('../utils/logger-structured');

// ── Helpers de fecha (timezone-safe: opera en hora local del server = Chile) ──

/** Formatea un Date a 'YYYY-MM-DD' en hora local (sin shift UTC). */
function ymd(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

/**
 * Normaliza `ref` (Date | 'YYYY-MM-DD' | undefined) a un Date local a medianoche.
 * Un string 'YYYY-MM-DD' se parsea como fecha LOCAL (no UTC) para evitar corrimientos.
 */
function parseRef(ref) {
    if (ref instanceof Date) {
        const d = new Date(ref);
        d.setHours(0, 0, 0, 0);
        return d;
    }
    if (typeof ref === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(ref)) {
        const [y, m, d] = ref.split('-').map(Number);
        return new Date(y, m - 1, d);
    }
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now;
}

/**
 * Devuelve la ventana de la "semana anterior" (lunes a domingo) relativa a `ref`.
 * Para un cron de lunes 08:00, la semana anterior es el lun–dom que terminó ayer.
 * @returns {{ desde: string, hasta: string }} fechas 'YYYY-MM-DD' inclusivas.
 */
function getSemanaPrevia(ref) {
    const d = parseRef(ref);
    const dow = d.getDay();                 // 0=Dom .. 6=Sáb
    const sinceMon = (dow + 6) % 7;         // días transcurridos desde el lunes de ESTA semana
    const thisMon = new Date(d);
    thisMon.setDate(d.getDate() - sinceMon);
    const prevMon = new Date(thisMon);
    prevMon.setDate(thisMon.getDate() - 7);
    const prevSun = new Date(thisMon);
    prevSun.setDate(thisMon.getDate() - 1);
    return { desde: ymd(prevMon), hasta: ymd(prevSun) };
}

/** Nombre completo legible a partir de una fila de trabajador. */
function nombreCompleto(row) {
    return [row.nombres, row.apellido_paterno, row.apellido_materno]
        .filter(Boolean)
        .join(' ')
        .trim();
}

/** Formatea 'YYYY-MM-DD' (o Date) a 'DD-MM-YYYY' para mostrar. Tolera null. */
function fmtFecha(value) {
    if (!value) return '—';
    const s = value instanceof Date ? ymd(value) : String(value).slice(0, 10);
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) return s;
    return `${m[3]}-${m[2]}-${m[1]}`;
}

const MESES_ABBR = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

/** ¿`ref` es el primer lunes de su mes? (día 1..7 y getDay()===1). */
function esPrimerLunesDelMes(ref) {
    const d = parseRef(ref);
    return d.getDay() === 1 && d.getDate() <= 7;
}

/** Spine de los últimos `count` meses (incluye el mes de ref). [{key:'YYYY-MM', label}]. */
function spineMeses(ref, count = 6) {
    const d = parseRef(ref);
    const y = d.getFullYear(), m = d.getMonth();
    const out = [];
    for (let i = count - 1; i >= 0; i--) {
        const dt = new Date(y, m - i, 1);
        const mm = String(dt.getMonth() + 1).padStart(2, '0');
        out.push({ key: `${dt.getFullYear()}-${mm}`, label: MESES_ABBR[dt.getMonth()] });
    }
    return out;
}

// ── Armado de datos (recibe `db` = pool mysql2/promise) ──

/**
 * Construye el objeto de datos del reporte para la ventana dada.
 * @param {import('mysql2/promise').Pool} db
 * @param {{ desde: string, hasta: string, ref?: string|Date }} opts
 */
async function buildReportData(db, { desde, hasta, ref } = {}) {
    if (!desde || !hasta) {
        const w = getSemanaPrevia(ref);
        desde = desde || w.desde;
        hasta = hasta || w.hasta;
    }
    // Mes de referencia para aniversarios + ventana de tendencias mensuales.
    const refDate = parseRef(ref);
    const refYmd = ymd(refDate);
    // Ventana [mesInicio, mesFin) = últimos 6 meses incluyendo el mes de ref.
    const mesInicio = ymd(new Date(refDate.getFullYear(), refDate.getMonth() - 5, 1));
    const mesFin = ymd(new Date(refDate.getFullYear(), refDate.getMonth() + 1, 1));

    const [contratacionesRows] = await db.query(
        `SELECT t.rut, t.nombres, t.apellido_paterno, t.apellido_materno, t.fecha_ingreso,
                e.razon_social AS empresa, o.nombre AS obra, c.nombre AS cargo
           FROM trabajadores t
           LEFT JOIN empresas e ON e.id = t.empresa_id
           LEFT JOIN obras    o ON o.id = t.obra_id
           LEFT JOIN cargos   c ON c.id = t.cargo_id
          WHERE t.es_prueba = 0 AND t.fecha_ingreso BETWEEN ? AND ?
          ORDER BY t.fecha_ingreso ASC, t.apellido_paterno ASC, t.nombres ASC`,
        [desde, hasta]
    );

    const [desvinculacionesRows] = await db.query(
        `SELECT t.rut, t.nombres, t.apellido_paterno, t.apellido_materno, t.fecha_desvinculacion,
                e.razon_social AS empresa, o.nombre AS obra, c.nombre AS cargo
           FROM trabajadores t
           LEFT JOIN empresas e ON e.id = t.empresa_id
           LEFT JOIN obras    o ON o.id = t.obra_id
           LEFT JOIN cargos   c ON c.id = t.cargo_id
          WHERE t.es_prueba = 0 AND t.fecha_desvinculacion BETWEEN ? AND ?
          ORDER BY t.fecha_desvinculacion ASC, t.apellido_paterno ASC, t.nombres ASC`,
        [desde, hasta]
    );

    // Faltas injustificadas: estado código 'A' (Ausente). Una fila por día de falta;
    // se agrupan por trabajador en JS para listar las fechas.
    const [faltasRows] = await db.query(
        `SELECT t.id AS trabajador_id, t.rut, t.nombres, t.apellido_paterno, t.apellido_materno,
                o.nombre AS obra, a.fecha
           FROM asistencias a
           JOIN trabajadores t       ON t.id = a.trabajador_id
           JOIN estados_asistencia es ON es.id = a.estado_id
           LEFT JOIN obras o         ON o.id = a.obra_id
          WHERE es.codigo = 'A' AND t.es_prueba = 0 AND a.fecha BETWEEN ? AND ?
          ORDER BY t.apellido_paterno ASC, t.nombres ASC, a.fecha ASC`,
        [desde, hasta]
    );

    // Aniversarios: cumplen exactamente 10 meses de antigüedad en el mes de `ref`.
    // PERIOD_DIFF compara YYYYMM (granularidad mes) → estable ante timezone.
    const [aniversariosRows] = await db.query(
        `SELECT t.rut, t.nombres, t.apellido_paterno, t.apellido_materno, t.fecha_ingreso,
                e.razon_social AS empresa, o.nombre AS obra, c.nombre AS cargo
           FROM trabajadores t
           LEFT JOIN empresas e ON e.id = t.empresa_id
           LEFT JOIN obras    o ON o.id = t.obra_id
           LEFT JOIN cargos   c ON c.id = t.cargo_id
          WHERE t.activo = 1
            AND t.es_prueba = 0
            AND t.fecha_desvinculacion IS NULL
            AND t.fecha_ingreso IS NOT NULL
            AND PERIOD_DIFF(DATE_FORMAT(?, '%Y%m'), DATE_FORMAT(t.fecha_ingreso, '%Y%m')) = 10
          ORDER BY t.fecha_ingreso ASC, t.apellido_paterno ASC`,
        [refYmd]
    );

    // ── Tendencias mensuales (últimos 6 meses, para los gráficos) ──
    // Faltas por mes = días de ausencia código 'A' (una fila de asistencia = un día).
    const [faltasMesRows] = await db.query(
        `SELECT DATE_FORMAT(a.fecha, '%Y-%m') AS ym, COUNT(*) AS total
           FROM asistencias a
           JOIN estados_asistencia es ON es.id = a.estado_id
           JOIN trabajadores t ON t.id = a.trabajador_id
          WHERE es.codigo = 'A' AND t.es_prueba = 0 AND a.fecha >= ? AND a.fecha < ?
          GROUP BY ym`,
        [mesInicio, mesFin]
    );
    const [contratacionesMesRows] = await db.query(
        `SELECT DATE_FORMAT(fecha_ingreso, '%Y-%m') AS ym, COUNT(*) AS total
           FROM trabajadores
          WHERE es_prueba = 0 AND fecha_ingreso >= ? AND fecha_ingreso < ?
          GROUP BY ym`,
        [mesInicio, mesFin]
    );
    const [desvinculacionesMesRows] = await db.query(
        `SELECT DATE_FORMAT(fecha_desvinculacion, '%Y-%m') AS ym, COUNT(*) AS total
           FROM trabajadores
          WHERE es_prueba = 0 AND fecha_desvinculacion >= ? AND fecha_desvinculacion < ?
          GROUP BY ym`,
        [mesInicio, mesFin]
    );

    // ── Transformaciones ──
    const contrataciones = contratacionesRows.map(r => ({
        rut: r.rut,
        nombre: nombreCompleto(r),
        empresa: r.empresa || '—',
        obra: r.obra || '—',
        cargo: r.cargo || '—',
        fecha_ingreso: r.fecha_ingreso ? String(r.fecha_ingreso).slice(0, 10) : null,
    }));

    const desvinculaciones = desvinculacionesRows.map(r => ({
        rut: r.rut,
        nombre: nombreCompleto(r),
        empresa: r.empresa || '—',
        obra: r.obra || '—',
        cargo: r.cargo || '—',
        fecha_desvinculacion: r.fecha_desvinculacion ? String(r.fecha_desvinculacion).slice(0, 10) : null,
    }));

    // Agrupar faltas por trabajador.
    const faltasMap = new Map();
    for (const r of faltasRows) {
        let entry = faltasMap.get(r.trabajador_id);
        if (!entry) {
            entry = {
                rut: r.rut,
                nombre: nombreCompleto(r),
                obra: r.obra || '—',
                fechas: [],
            };
            faltasMap.set(r.trabajador_id, entry);
        }
        entry.fechas.push(String(r.fecha).slice(0, 10));
    }
    const faltas = Array.from(faltasMap.values()).map(f => ({ ...f, total: f.fechas.length }));

    const aniversarios = aniversariosRows.map(r => ({
        rut: r.rut,
        nombre: nombreCompleto(r),
        empresa: r.empresa || '—',
        obra: r.obra || '—',
        cargo: r.cargo || '—',
        fecha_ingreso: r.fecha_ingreso ? String(r.fecha_ingreso).slice(0, 10) : null,
        meses: 10,
    }));

    // Tendencias: rellena el spine de 6 meses con los conteos (0 donde no hay filas).
    const spine = spineMeses(ref, 6);
    const byYm = (rows) => {
        const map = {};
        for (const r of rows) map[r.ym] = Number(r.total) || 0;
        return map;
    };
    const fMap = byYm(faltasMesRows);
    const cMap = byYm(contratacionesMesRows);
    const dMap = byYm(desvinculacionesMesRows);
    const tendencias = {
        faltasMes: spine.map(s => ({ label: s.label, valor: fMap[s.key] || 0 })),
        movimientoMes: spine.map(s => ({
            label: s.label,
            contrataciones: cMap[s.key] || 0,
            desvinculaciones: dMap[s.key] || 0,
        })),
    };

    // ── Desglose por obra (derivado de filas ya consultadas, sin SQL extra) ──
    // Faltas (días) + trabajadores con falta se atribuyen a la obra de CADA asistencia
    // (faltasRows es día-nivel con su propio obra_id); altas/bajas salen de los arrays ya
    // transformados. Obra nula/'—' se agrupa como 'Sin obra'.
    const SIN_OBRA = 'Sin obra';
    const obraKey = (o) => (o && o !== '—' ? o : SIN_OBRA);
    const porObraMap = new Map();
    const ensureObra = (obra) => {
        const key = obraKey(obra);
        let e = porObraMap.get(key);
        if (!e) {
            e = { obra: key, altas: 0, bajas: 0, faltas_dias: 0, _trab: new Set() };
            porObraMap.set(key, e);
        }
        return e;
    };
    for (const c of contrataciones) ensureObra(c.obra).altas++;
    for (const d of desvinculaciones) ensureObra(d.obra).bajas++;
    for (const r of faltasRows) {
        const e = ensureObra(r.obra);
        e.faltas_dias++;
        e._trab.add(r.trabajador_id);
    }
    const porObra = Array.from(porObraMap.values())
        .map(e => ({
            obra: e.obra, altas: e.altas, bajas: e.bajas,
            faltas_dias: e.faltas_dias, trabajadores_falta: e._trab.size,
        }))
        .filter(e => e.altas > 0 || e.bajas > 0 || e.faltas_dias > 0)
        .sort((a, b) =>
            b.faltas_dias - a.faltas_dias ||
            (b.altas + b.bajas) - (a.altas + a.bajas) ||
            a.obra.localeCompare(b.obra, 'es')
        );

    return {
        rango: { desde, hasta },
        generado_en: new Date().toISOString(),
        contrataciones,
        desvinculaciones,
        faltas,
        aniversarios,
        // Aniversarios solo se informan el 1er lunes del mes (evita repetir 4 semanas).
        aniversariosVigentes: esPrimerLunesDelMes(ref),
        tendencias,
        porObra,
        totales: {
            contrataciones: contrataciones.length,
            desvinculaciones: desvinculaciones.length,
            faltas: faltas.length,
            faltas_dias: faltas.reduce((s, f) => s + f.total, 0),
            aniversarios: aniversarios.length,
            obras: porObra.length,
        },
    };
}

// ════════════════════════════════════════════════════════════════════════════
//  Render HTML (puro, email-safe: tablas + estilos inline, sin <style>/JS/SVG)
// ════════════════════════════════════════════════════════════════════════════

/** Paleta moderna (neutros tipo Tailwind + verde de marca LOLS). */
// Paleta sobria/corporativa: acentos apagados (baja saturación), color usado solo
// como detalle. La jerarquía la dan el tamaño y el peso, no la intensidad del color.
const C = {
    brand: '#33715A',        // verde apagado (acento principal)
    brandDeep: '#1C4D38',    // verde profundo (header sólido)
    ink: '#1E293B', slate: '#64748B', slateLite: '#94A3B8',
    line: '#E2E8F0', surface: '#F8FAFC', surfaceAlt: '#F1F5F9', white: '#FFFFFF',
    red: '#A85852',          // terracota apagado (faltas)
    blue: '#5B7C99',         // azul acero apagado (aniversarios)
    greenSoft: '#EAF1ED', redSoft: '#F3ECEB', blueSoft: '#EDF1F5', neutralSoft: '#F1F5F9',
};

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif";

function esc(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/** Formatea ISO/Date a 'DD-MM-YYYY HH:mm' (hora local). Para el footer. */
function fmtFechaHora(value) {
    const d = value instanceof Date ? value : new Date(value);
    if (isNaN(d)) return '—';
    const p = (n) => String(n).padStart(2, '0');
    return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// ── Bloques reutilizables ─────────────────────────────────────────────────

/** Tarjeta KPI (una celda). Número grande + etiqueta + sublabel. */
function kpiCard(label, value, color, sub) {
    return `<td width="25%" valign="top" style="padding:0 5px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
               style="background:${C.white};border:1px solid ${C.line};border-radius:13px;overflow:hidden;">
            <tr><td style="height:3px;background:${color};font-size:1px;line-height:1px;">&nbsp;</td></tr>
            <tr><td style="padding:15px 14px 16px 14px;">
                <div style="font:700 30px/1 ${FONT};color:${color};letter-spacing:-.3px;">${value}</div>
                <div style="font:600 11px/1.3 ${FONT};color:${C.ink};margin-top:7px;">${esc(label)}</div>
                <div style="font:400 10px/1.3 ${FONT};color:${C.slate};margin-top:2px;">${esc(sub)}</div>
            </td></tr>
        </table>
    </td>`;
}

/**
 * Barra vertical email-safe (tabla con celda coloreada de alto fijo en px).
 * Robusta en Outlook: usa atributos height/bgcolor + estilo inline.
 */
function bar(heightPx, widthPx, color) {
    const h = Math.max(2, Math.round(heightPx));
    return `<table role="presentation" align="center" cellpadding="0" cellspacing="0" style="margin:0 auto;border-collapse:collapse;">`
        + `<tr><td width="${widthPx}" height="${h}" bgcolor="${color}"`
        + ` style="width:${widthPx}px;height:${h}px;background:${color};border-radius:5px 5px 0 0;font-size:1px;line-height:1px;mso-line-height-rule:exactly;">&nbsp;</td></tr></table>`;
}

/**
 * Gráfico de barras vertical (1 o 2 series), HTML puro.
 * @param {string[]} categorias  etiquetas del eje X (ej. meses).
 * @param {{name:string,color:string,data:number[]}[]} series  1 o 2 series.
 * @param {{plotH?:number, showValues?:boolean}} [opts]
 */
function barChart(categorias, series, opts = {}) {
    const plotH = opts.plotH || 132;
    const showValues = opts.showValues !== false && series.length === 1;
    const grouped = series.length > 1;
    const barW = grouped ? 15 : 30;

    let max = 0;
    for (const s of series) for (const v of s.data) if (v > max) max = v;
    max = Math.max(max, 1);

    const colW = `${Math.floor(100 / categorias.length)}%`;
    const hPx = (v) => (v / max) * plotH;

    // Fila del plot: una celda por categoría; dentro, las barras de cada serie.
    // Cada barra (que es una <table>) va en su propio <td> para no romper anidación.
    const plotCells = categorias.map((_, i) => {
        let barsRow;
        if (grouped) {
            const inner = series.map(s =>
                `<td valign="bottom" style="padding:0 2px;">${bar(hPx(s.data[i] || 0), barW, s.color)}</td>`
            ).join('');
            barsRow = `<table role="presentation" align="center" cellpadding="0" cellspacing="0" style="margin:0 auto;"><tr style="vertical-align:bottom;">${inner}</tr></table>`;
        } else {
            barsRow = bar(hPx(series[0].data[i] || 0), barW, series[0].color);
        }
        const valueLabel = showValues
            ? `<div style="font:700 12px/1 ${FONT};color:${C.ink};padding-bottom:7px;">${series[0].data[i] || 0}</div>`
            : '';
        return `<td width="${colW}" valign="bottom" align="center" style="padding:0 4px;">${valueLabel}${barsRow}</td>`;
    }).join('');

    // Etiquetas del eje X.
    const labelCells = categorias.map(c =>
        `<td width="${colW}" align="center" style="padding:7px 2px 0 2px;font:600 11px/1.2 ${FONT};color:${C.slate};">${esc(c)}</td>`
    ).join('');

    // Leyenda (solo si hay 2+ series).
    const legend = grouped
        ? `<table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:14px auto 0 auto;"><tr>`
          + series.map(s =>
                `<td style="padding:0 10px;font:600 11px/1.2 ${FONT};color:${C.slate};">`
                + `<span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${s.color};margin-right:6px;"></span>${esc(s.name)}</td>`
            ).join('')
          + `</tr></table>`
        : '';

    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed;">
        <tr style="vertical-align:bottom;">${plotCells}</tr>
        <tr><td colspan="${categorias.length}" style="border-top:2px solid ${C.line};font-size:1px;line-height:1px;">&nbsp;</td></tr>
        <tr>${labelCells}</tr>
    </table>${legend}`;
}

/** Tarjeta-sección con header (punto + título + conteo) y contenido interno. */
function sectionCard(title, count, accent, innerHtml) {
    return `<tr><td style="padding:7px 24px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
               style="background:${C.white};border:1px solid ${C.line};border-left:4px solid ${accent};border-radius:14px;">
            <tr><td style="padding:17px 20px 13px 18px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
                    <td style="font:700 15px/1.3 ${FONT};color:${C.ink};">${esc(title)}</td>
                    <td align="right">
                        <span style="display:inline-block;background:${C.neutralSoft};color:${accent};font:700 12px/1 ${FONT};padding:5px 11px;border-radius:20px;border:1px solid ${C.line};">${count}</span>
                    </td>
                </tr></table>
            </td></tr>
            ${innerHtml}
        </table>
    </td></tr>`;
}

function emptyState(msg) {
    return `<tr><td style="padding:4px 18px 18px 18px;">
        <div style="background:${C.surface};border:1px dashed ${C.line};border-radius:10px;padding:14px;font:400 12px/1.4 ${FONT};color:${C.slateLite};text-align:center;">${esc(msg)}</div>
    </td></tr>`;
}

/** Tabla de datos moderna: header tintado suave + filas con padding cómodo. */
function dataTable(headers, rows) {
    const ths = headers.map((h, i) =>
        `<th align="left" style="padding:9px 12px;font:700 10px/1.2 ${FONT};color:${C.slate};background:${C.surface};text-transform:uppercase;letter-spacing:.6px;border-bottom:1px solid ${C.line};${i === 0 ? 'border-top-left-radius:10px;' : ''}${i === headers.length - 1 ? 'border-top-right-radius:10px;' : ''}">${esc(h)}</th>`
    ).join('');
    const trs = rows.map((cols) => {
        const tds = cols.map(c =>
            `<td style="padding:10px 12px;font:400 12px/1.45 ${FONT};color:${C.ink};border-bottom:1px solid ${C.line};">${c}</td>`
        ).join('');
        return `<tr>${tds}</tr>`;
    }).join('');
    return `<tr><td style="padding:0 18px 18px 18px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
               style="border-collapse:separate;border-spacing:0;border:1px solid ${C.line};border-radius:11px;overflow:hidden;">
            <tr>${ths}</tr>
            ${trs}
        </table>
    </td></tr>`;
}

/** Bloque del gráfico, envuelto en tarjeta (solo si hay tendencias). */
function chartCard(title, subtitle, chartHtml) {
    return `<tr><td style="padding:7px 24px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
               style="background:${C.white};border:1px solid ${C.line};border-radius:14px;">
            <tr><td style="padding:20px;">
                <div style="font:800 16px/1.3 ${FONT};color:${C.ink};letter-spacing:-.2px;">${esc(title)}</div>
                <div style="font:400 11px/1.3 ${FONT};color:${C.slate};margin:3px 0 18px 0;">${esc(subtitle)}</div>
                ${chartHtml}
            </td></tr>
        </table>
    </td></tr>`;
}

/**
 * Renderiza el HTML del correo. Puro: no toca DB ni red.
 * @param {object} data salida de buildReportData
 * @param {{ logoCid?: string, logoSrc?: string, tituloEmpresa?: string }} [opts]
 *   - logoCid: para envío real (CID embebido por nodemailer).
 *   - logoSrc: src explícito (preview en navegador con file:// o data URI).
 * @returns {string} HTML completo
 */
function renderHtml(data, opts = {}) {
    const { logoCid, logoSrc, tituloEmpresa = 'LOLS Ingeniería' } = opts;
    const { rango, totales } = data;
    const tendencias = data.tendencias;
    const porObra = Array.isArray(data.porObra) ? data.porObra : [];
    // Aniversarios solo vigentes el 1er lunes del mes (default true si no viene el flag).
    const anivVigente = data.aniversariosVigentes !== false;

    // Línea de resumen ejecutivo (bajo el rango). Pluralización simple es/plural.
    const pl = (n, s, p) => `${n} ${n === 1 ? s : p}`;
    const resumenLinea = [
        pl(totales.contrataciones, 'contratación', 'contrataciones'),
        pl(totales.desvinculaciones, 'desvinculación', 'desvinculaciones'),
        pl(totales.faltas_dias, 'falta', 'faltas'),
    ].join(' · ')
        + (porObra.length ? ` · ${pl(porObra.length, 'obra', 'obras')} con movimiento` : '')
        + (anivVigente && totales.aniversarios ? ` · ${pl(totales.aniversarios, 'aniversario', 'aniversarios')}` : '');

    const imgSrc = logoSrc || (logoCid ? `cid:${esc(logoCid)}` : null);
    const logoInner = imgSrc
        ? `<img src="${esc(imgSrc)}" alt="${esc(tituloEmpresa)}" height="30" width="27" style="display:block;border:0;outline:none;height:30px;width:27px;" />`
        : `<div style="width:27px;height:30px;background:${C.brand};border-radius:5px;"></div>`;
    const logoChip = `<table role="presentation" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:13px;"><tr><td align="center" valign="middle" style="width:48px;height:48px;padding:9px;">${logoInner}</td></tr></table>`;

    // ── KPI cards ──
    const kpis = `<tr><td style="padding:4px 19px 8px 19px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
            ${kpiCard('Contrataciones', totales.contrataciones, C.brand, 'nuevos ingresos')}
            ${kpiCard('Desvinculaciones', totales.desvinculaciones, C.ink, 'egresos')}
            ${kpiCard('Faltas', totales.faltas_dias, C.red, `${totales.faltas} trabajador(es)`)}
            ${kpiCard('Aniversarios', anivVigente ? totales.aniversarios : '—', C.blue, anivVigente ? 'cumplen 10 meses' : 'se informa 1er lunes')}
        </tr></table>
    </td></tr>`;

    // ── Gráficos (opcionales) ──
    let chartsBlock = '';
    if (tendencias && Array.isArray(tendencias.faltasMes) && tendencias.faltasMes.length) {
        const cats = tendencias.faltasMes.map(p => p.label);
        const faltasChart = barChart(cats, [{ name: 'Faltas', color: C.red, data: tendencias.faltasMes.map(p => p.valor) }], { showValues: true });
        chartsBlock += chartCard('Faltas injustificadas por mes', `Últimos ${cats.length} meses (días de ausencia código A)`, faltasChart);
    }
    if (tendencias && Array.isArray(tendencias.movimientoMes) && tendencias.movimientoMes.length) {
        const cats = tendencias.movimientoMes.map(p => p.label);
        const movChart = barChart(cats, [
            { name: 'Contrataciones', color: C.brand, data: tendencias.movimientoMes.map(p => p.contrataciones) },
            { name: 'Desvinculaciones', color: C.slateLite, data: tendencias.movimientoMes.map(p => p.desvinculaciones) },
        ], { showValues: false });
        chartsBlock += chartCard('Contrataciones vs Desvinculaciones', `Movimiento de dotación · últimos ${cats.length} meses`, movChart);
    }

    // ── Secciones ──
    const contratacionesInner = data.contrataciones.length === 0
        ? emptyState('Sin contrataciones en la semana.')
        : dataTable(
            ['Trabajador', 'RUT', 'Empresa', 'Obra', 'Cargo', 'Ingreso'],
            data.contrataciones.map(c => [
                `<strong>${esc(c.nombre)}</strong>`, esc(c.rut), esc(c.empresa), esc(c.obra), esc(c.cargo), fmtFecha(c.fecha_ingreso),
            ])
        );

    const desvinculacionesInner = data.desvinculaciones.length === 0
        ? emptyState('Sin desvinculaciones en la semana.')
        : dataTable(
            ['Trabajador', 'RUT', 'Empresa', 'Obra', 'Cargo', 'Egreso'],
            data.desvinculaciones.map(d => [
                `<strong>${esc(d.nombre)}</strong>`, esc(d.rut), esc(d.empresa), esc(d.obra), esc(d.cargo), fmtFecha(d.fecha_desvinculacion),
            ])
        );

    const faltasInner = data.faltas.length === 0
        ? emptyState('Sin faltas injustificadas en la semana.')
        : dataTable(
            ['Trabajador', 'RUT', 'Obra', 'Faltas', 'Fechas'],
            data.faltas.map(f => [
                `<strong>${esc(f.nombre)}</strong>`,
                esc(f.rut),
                esc(f.obra),
                `<strong style="color:${C.red};">${f.total}</strong>`,
                esc(f.fechas.map(fmtFecha).join(', ')),
            ])
        );

    const aniversariosInner = !anivVigente
        ? emptyState('Los aniversarios de 10 meses se informan en el primer reporte de cada mes.')
        : data.aniversarios.length === 0
            ? emptyState('Ningún trabajador cumple 10 meses este mes.')
            : dataTable(
                ['Trabajador', 'RUT', 'Empresa', 'Obra', 'Ingreso'],
                data.aniversarios.map(a => [
                    `<strong>${esc(a.nombre)}</strong>`, esc(a.rut), esc(a.empresa), esc(a.obra), fmtFecha(a.fecha_ingreso),
                ])
            );

    // ── Resumen por obra (overview transversal: dónde ocurre el movimiento) ──
    const porObraInner = porObra.length === 0
        ? emptyState('Sin movimiento por obra en la semana.')
        : dataTable(
            ['Obra', 'Altas', 'Bajas', 'Faltas (días)', 'Trab. c/faltas'],
            porObra.map(o => [
                `<strong>${esc(o.obra)}</strong>`,
                String(o.altas),
                String(o.bajas),
                o.faltas_dias > 0 ? `<strong style="color:${C.red};">${o.faltas_dias}</strong>` : '0',
                String(o.trabajadores_falta),
            ])
        );
    const porObraSection = sectionCard('Resumen por obra', porObra.length, C.slate, porObraInner);

    const sections =
        sectionCard('Contrataciones nuevas', totales.contrataciones, C.brand, contratacionesInner) +
        sectionCard('Desvinculaciones', totales.desvinculaciones, C.slate, desvinculacionesInner) +
        sectionCard('Faltas injustificadas', totales.faltas, C.red, faltasInner) +
        sectionCard('Cumplen 10 meses este mes', anivVigente ? totales.aniversarios : '—', C.blue, aniversariosInner);

    // Texto de preheader (vista previa en bandeja de entrada).
    const preheader = `${totales.contrataciones} contrataciones · ${totales.desvinculaciones} desvinculaciones · ${totales.faltas_dias} faltas${anivVigente ? ` · ${totales.aniversarios} aniversarios` : ''}`;

    return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting"><title>Reporte Semanal RRHH</title></head>
<body style="margin:0;padding:0;background:${C.surfaceAlt};-webkit-font-smoothing:antialiased;">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${C.surfaceAlt};">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.surfaceAlt};padding:28px 0;">
<tr><td align="center">
    <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="width:640px;max-width:640px;">
        <!-- Header -->
        <tr><td bgcolor="${C.brandDeep}" style="background:${C.brandDeep};border-radius:18px 18px 0 0;padding:28px 30px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
                <td valign="middle">
                    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                        <td valign="middle">${logoChip}</td>
                        <td valign="middle" style="padding-left:14px;">
                            <div style="font:800 22px/1.05 ${FONT};color:#ffffff;letter-spacing:.3px;">LOLS</div>
                            <div style="font:600 10px/1.2 ${FONT};color:rgba(255,255,255,0.82);letter-spacing:3px;margin-top:3px;">INGENIERÍA</div>
                        </td>
                    </tr></table>
                </td>
                <td align="right" valign="middle">
                    <span style="display:inline-block;background:rgba(255,255,255,0.16);color:#ffffff;font:700 11px/1 ${FONT};padding:8px 14px;border-radius:20px;letter-spacing:.4px;">Reporte Semanal RRHH</span>
                </td>
            </tr></table>
        </td></tr>
        <!-- Sub-header: rango -->
        <tr><td bgcolor="${C.white}" style="background:${C.white};padding:22px 24px 8px 24px;">
            <div style="font:400 10px/1.2 ${FONT};color:${C.slateLite};text-transform:uppercase;letter-spacing:1.2px;">Resumen de la semana</div>
            <div style="font:800 20px/1.3 ${FONT};color:${C.ink};margin-top:5px;letter-spacing:-.3px;">${fmtFecha(rango.desde)} <span style="color:${C.slateLite};font-weight:600;">al</span> ${fmtFecha(rango.hasta)}</div>
            <div style="font:400 12px/1.45 ${FONT};color:${C.slate};margin-top:7px;">${esc(resumenLinea)}</div>
        </td></tr>
        <!-- KPIs -->
        <tr><td bgcolor="${C.white}" style="background:${C.white};padding-bottom:8px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${kpis}</table>
        </td></tr>
        <!-- Cuerpo -->
        <tr><td bgcolor="${C.surfaceAlt}" style="background:${C.surfaceAlt};padding:6px 0 4px 0;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                ${chartsBlock}
                ${porObraSection}
                ${sections}
            </table>
        </td></tr>
        <!-- Footer -->
        <tr><td bgcolor="${C.white}" style="background:${C.white};border-radius:0 0 18px 18px;padding:22px 24px;border-top:1px solid ${C.line};">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
                <td valign="middle" style="font:700 12px/1.4 ${FONT};color:${C.ink};">
                    ${esc(tituloEmpresa)}
                    <div style="font:400 11px/1.5 ${FONT};color:${C.slate};margin-top:3px;">Reporte automático de Bóveda LOLS · generado el ${fmtFechaHora(data.generado_en)}</div>
                </td>
                <td align="right" valign="middle" style="font:400 10px/1.4 ${FONT};color:${C.slateLite};">No responder<br>a este correo</td>
            </tr></table>
        </td></tr>
    </table>
</td></tr>
</table>
</body></html>`;
}

/** Render de texto plano (fallback para clientes sin HTML). */
function renderText(data) {
    const { rango, totales } = data;
    const lines = [];
    lines.push(`REPORTE SEMANAL RRHH — Semana ${fmtFecha(rango.desde)} al ${fmtFecha(rango.hasta)}`);
    lines.push('');
    lines.push(`Resumen: ${totales.contrataciones} contrataciones · ${totales.desvinculaciones} desvinculaciones · ${totales.faltas_dias} faltas · ${totales.aniversarios} aniversarios`);
    lines.push('');
    const porObra = Array.isArray(data.porObra) ? data.porObra : [];
    lines.push(`Resumen por obra (${porObra.length}):`);
    porObra.forEach(o => lines.push(`  - ${o.obra}: ${o.altas} alta(s), ${o.bajas} baja(s), ${o.faltas_dias} falta(s) en ${o.trabajadores_falta} trabajador(es)`));
    if (!porObra.length) lines.push('  (sin movimiento por obra)');
    lines.push('');
    lines.push(`Contrataciones nuevas (${totales.contrataciones}):`);
    data.contrataciones.forEach(c => lines.push(`  - ${c.nombre} (${c.rut}) · ${c.empresa} · ${c.obra} · ${c.cargo} · ingreso ${fmtFecha(c.fecha_ingreso)}`));
    if (!data.contrataciones.length) lines.push('  (ninguna)');
    lines.push('');
    lines.push(`Desvinculaciones (${totales.desvinculaciones}):`);
    data.desvinculaciones.forEach(d => lines.push(`  - ${d.nombre} (${d.rut}) · ${d.empresa} · ${d.obra} · egreso ${fmtFecha(d.fecha_desvinculacion)}`));
    if (!data.desvinculaciones.length) lines.push('  (ninguna)');
    lines.push('');
    lines.push(`Faltas injustificadas (${totales.faltas} trabajadores, ${totales.faltas_dias} días):`);
    data.faltas.forEach(f => lines.push(`  - ${f.nombre} (${f.rut}) · ${f.obra} · ${f.total} falta(s): ${f.fechas.map(fmtFecha).join(', ')}`));
    if (!data.faltas.length) lines.push('  (ninguna)');
    lines.push('');
    lines.push(`Cumplen 10 meses este mes (${totales.aniversarios}):`);
    data.aniversarios.forEach(a => lines.push(`  - ${a.nombre} (${a.rut}) · ${a.empresa} · ${a.obra} · ingreso ${fmtFecha(a.fecha_ingreso)}`));
    if (!data.aniversarios.length) lines.push('  (ninguno)');
    return lines.join('\n');
}

// ════════════════════════════════════════════════════════════════════════════
//  Orquestación de envío (compartida por el script de cron y el endpoint API)
// ════════════════════════════════════════════════════════════════════════════

/**
 * Resuelve destinatarios: `to` explícito > tabla `reportes_suscriptores` (activo=1)
 * > env `REPORTE_TO` (CSV). Si la tabla no existe (errno 1146) o está vacía, cae a env.
 * @param {import('mysql2/promise').Pool} db
 * @param {string|string[]|null} [cliTo] lista explícita (CSV o array).
 * @returns {Promise<string[]>}
 */
async function resolveRecipients(db, cliTo) {
    if (cliTo) {
        const arr = Array.isArray(cliTo) ? cliTo : String(cliTo).split(',');
        return arr.map(s => String(s).trim()).filter(Boolean);
    }
    try {
        const [rows] = await db.query(
            'SELECT email FROM reportes_suscriptores WHERE activo = 1 ORDER BY email'
        );
        const emails = rows.map(r => r.email).filter(Boolean);
        if (emails.length) return emails;
    } catch (err) {
        // ER_NO_SUCH_TABLE (1146): tabla aún no creada. Cae a env REPORTE_TO.
        if (err && err.errno !== 1146) throw err;
        logger.warn('Tabla reportes_suscriptores no existe todavía — usando REPORTE_TO.');
    }
    return (process.env.REPORTE_TO || '').split(',').map(s => s.trim()).filter(Boolean);
}

/** Logo CID si existe el PNG; si no, el render usa header de texto. */
function resolveLogo() {
    const candidate = process.env.REPORTE_LOGO_PATH
        || path.join(__dirname, '..', '..', 'assets', 'logo-lols-green.png');
    if (fs.existsSync(candidate)) {
        return {
            attachments: [{ filename: 'logo-lols.png', path: candidate, cid: 'logoLols' }],
            logoCid: 'logoLols',
        };
    }
    return { attachments: [], logoCid: null };
}

/**
 * Orquesta el reporte completo: arma datos → renderiza → (envía | dry-run).
 * Usado por el script de cron (con su propio pool) y por el endpoint "enviar prueba"
 * (con el pool de la app). NO crea ni cierra conexiones: recibe `db` inyectado.
 *
 * @param {object} opts
 * @param {import('mysql2/promise').Pool} opts.db
 * @param {string|string[]|null} [opts.to] destinatario(s) explícito(s); si falta, resuelve por suscriptores/env.
 * @param {string} [opts.fecha] 'YYYY-MM-DD' usada como "hoy" (ventana = su semana previa).
 * @param {boolean} [opts.dry] si true, NO envía: retorna el preview.
 * @returns {Promise<object>} dry → { dry:true, html, text, subject, rango, totales };
 *   envío → { dry:false, subject, recipients, messageId, accepted, rejected }.
 */
async function enviarReporteSemanal({ db, to = null, fecha, dry = false } = {}) {
    const rango = getSemanaPrevia(fecha || undefined);
    const data = await buildReportData(db, { desde: rango.desde, hasta: rango.hasta, ref: fecha || undefined });

    const { attachments, logoCid } = resolveLogo();
    const html = renderHtml(data, { logoCid });
    const text = renderText(data);
    const subject = `Reporte Semanal RRHH — ${fmtFecha(rango.desde)} al ${fmtFecha(rango.hasta)}`;

    if (dry) {
        return { dry: true, html, text, subject, rango, totales: data.totales };
    }

    const recipients = await resolveRecipients(db, to);
    if (!recipients.length) {
        throw Object.assign(new Error('Sin destinatarios: define suscriptores activos, REPORTE_TO en .env, o pasa "to".'), { statusCode: 400 });
    }

    const res = await emailService.sendSystemEmail({ to: recipients, subject, html, text, attachments });
    return {
        dry: false,
        subject,
        recipients,
        totales: data.totales,
        messageId: res.messageId,
        accepted: res.accepted || [],
        rejected: res.rejected || [],
    };
}

module.exports = {
    getSemanaPrevia,
    buildReportData,
    renderHtml,
    renderText,
    enviarReporteSemanal,
    resolveRecipients,
    resolveLogo,
    // exportados para test
    _internals: { ymd, parseRef, nombreCompleto, fmtFecha, fmtFechaHora, esc, bar, barChart, esPrimerLunesDelMes, spineMeses },
};
