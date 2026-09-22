/**
 * Alertas de documentos sin firmar (plan Gestiones B7, mig 115).
 *
 * Un documento generado por Bóveda cierra su ciclo al volver FIRMADO (cadena de custodia, mig 114). Todo lo
 * que lleva demasiados días sin cerrarlo aparece en la Bandeja del Día y en la pestaña Documentos físicos,
 * con umbrales por tipo (`documentos_alertas_config`): `dias_aviso` (ámbar) y `dias_critico` (rojo).
 *
 * Reglas (docs/reglas/rrhh-trabajadores.md § Alertas de documentos sin firmar):
 *  - Los días de un documento cuentan desde `fecha_generacion` — NUNCA desde la descarga (re-imprimir no
 *    silencia). Etapas: generado → sin_imprimir; descargado → por_retirar (o por_confirmar si ya está en
 *    un lote pendiente); en_terreno → en_terreno. `firmado` sale del radar.
 *  - Los lotes tienen sus propias categorías: LOTE_SIN_CONFIRMAR (desde creado_en) y LOTE_EN_TERRENO
 *    (desde retirado_en).
 *  - Trabajadores de prueba (es_prueba = 1) no alertan. Solo in-app: sin correo en v1.
 *  - Degradación (D-I): sin la mig 115/114/110 (errno 1146/1054) → estructura vacía, nunca 500.
 */
const db = require('../config/db');

const ERR_ESQUEMA = new Set([1146, 1054]);
const esErrorEsquema = err => err && ERR_ESQUEMA.has(err.errno);
const httpError = (msg, statusCode, extra = {}) => Object.assign(new Error(msg), { statusCode, ...extra });
const toNum = v => Number(v) || 0;
const nombreCompleto = r => [r.apellido_paterno, r.apellido_materno, r.nombres].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();

const CAT_LOTE_SIN_CONFIRMAR = 'LOTE_SIN_CONFIRMAR';
const CAT_LOTE_EN_TERRENO = 'LOTE_EN_TERRENO';

// Documentos sin firmar que ya superan el aviso de su tipo. DATEDIFF sobre fecha_generacion (D-D).
const SELECT_DOCS = `
    SELECT d.id, d.estado, d.fecha_generacion, d.lote_id,
           td.codigo AS tipo_codigo, td.nombre AS tipo_nombre,
           t.id AS trabajador_id, t.nombres, t.apellido_paterno, t.apellido_materno, t.rut,
           o.nombre AS obra_nombre,
           c.dias_aviso, c.dias_critico,
           DATEDIFF(CURDATE(), d.fecha_generacion) AS dias,
           l.estado AS lote_estado, up.nombre AS portador_nombre
      FROM documentos d
      JOIN tipos_documento td ON td.id = d.tipo_documento_id
      JOIN documentos_alertas_config c ON c.categoria = td.codigo AND c.activo = 1
      JOIN trabajadores t ON t.id = d.trabajador_id AND t.es_prueba = 0
      LEFT JOIN obras o ON o.id = t.obra_id
      LEFT JOIN documentos_lotes l ON l.id = d.lote_id
      LEFT JOIN usuarios up ON up.id = l.portador_id
     WHERE d.activo = TRUE AND d.origen = 'generado'
       AND d.estado IN ('generado', 'descargado', 'en_terreno')
       AND d.fecha_generacion IS NOT NULL
       AND DATEDIFF(CURDATE(), d.fecha_generacion) >= c.dias_aviso
     ORDER BY dias DESC, d.id ASC`;

// Lotes abiertos con su antigüedad: sin confirmar desde creado_en, en terreno desde retirado_en.
const SELECT_LOTES = `
    SELECT l.id, l.estado, l.portador_id, up.nombre AS portador_nombre, l.creado_en, l.retirado_en,
           DATEDIFF(CURDATE(), CASE WHEN l.estado = 'pendiente_retiro' THEN l.creado_en ELSE l.retirado_en END) AS dias,
           COUNT(i.id) AS documentos
      FROM documentos_lotes l
      LEFT JOIN usuarios up ON up.id = l.portador_id
      LEFT JOIN documentos_lotes_items i ON i.lote_id = l.id AND i.estado IN ('pendiente', 'retirado')
     WHERE l.estado IN ('pendiente_retiro', 'en_terreno')
     GROUP BY l.id, l.estado, l.portador_id, up.nombre, l.creado_en, l.retirado_en
     ORDER BY dias DESC, l.id ASC`;

function etapaDe(row) {
    if (row.estado === 'generado') return 'sin_imprimir';
    if (row.estado === 'en_terreno') return 'en_terreno';
    return row.lote_id != null && row.lote_estado === 'pendiente_retiro' ? 'por_confirmar' : 'por_retirar';
}

const vacio = () => ({
    total: 0, criticos: 0,
    por_tipo: [],
    por_etapa: { sin_imprimir: { total: 0, criticos: 0 }, por_retirar: { total: 0, criticos: 0 }, por_confirmar: { total: 0, criticos: 0 }, en_terreno: { total: 0, criticos: 0 } },
    lotes: { sin_confirmar: { total: 0, criticos: 0, items: [] }, en_terreno: { total: 0, criticos: 0, items: [] } },
    items: [],
});

/** Regla cruzada del CRUD de config: días enteros ≥ 0 y crítico ≥ aviso (validateBody es por campo). */
async function validarConfig(id, safeData, conn) {
    for (const k of ['dias_aviso', 'dias_critico']) {
        if (safeData[k] === undefined) continue;
        const n = Number(safeData[k]);
        if (!Number.isInteger(n) || n < 0 || n > 3650) throw httpError(`${k} debe ser un entero entre 0 y 3650`, 400);
        safeData[k] = n;
    }
    if (safeData.etiqueta !== undefined) {
        const e = String(safeData.etiqueta ?? '').trim();
        if (!e || e.length > 100) throw httpError('etiqueta debe tener entre 1 y 100 caracteres', 400);
        safeData.etiqueta = e;
    }
    if (safeData.activo !== undefined) safeData.activo = safeData.activo === true || safeData.activo === 1 || safeData.activo === '1' || safeData.activo === 'true' ? 1 : 0;
    if (safeData.dias_aviso !== undefined || safeData.dias_critico !== undefined) {
        const [rows] = await conn.query('SELECT dias_aviso, dias_critico FROM documentos_alertas_config WHERE id = ?', [id]);
        if (!rows.length) throw httpError('Alerta no encontrada', 404);
        const aviso = safeData.dias_aviso ?? Number(rows[0].dias_aviso);
        const critico = safeData.dias_critico ?? Number(rows[0].dias_critico);
        if (critico < aviso) throw httpError(`Los días para crítico (${critico}) no pueden ser menos que los de aviso (${aviso})`, 400, { code: 'UMBRALES_INVERTIDOS' });
    }
}

const documentosAlertasService = {
    CAT_LOTE_SIN_CONFIRMAR,
    CAT_LOTE_EN_TERRENO,
    validarConfig,

    /** Todo lo que supera su umbral, agrupado para la Bandeja y la pestaña Documentos físicos. */
    async pendientes() {
        let docs, lotes, config;
        try {
            [[docs], [lotes], [config]] = await Promise.all([
                db.query(SELECT_DOCS),
                db.query(SELECT_LOTES),
                db.query('SELECT categoria, activo, dias_aviso, dias_critico FROM documentos_alertas_config WHERE categoria IN (?, ?)', [CAT_LOTE_SIN_CONFIRMAR, CAT_LOTE_EN_TERRENO]),
            ]);
        } catch (err) {
            if (esErrorEsquema(err)) return vacio();
            throw err;
        }

        const out = vacio();
        const porTipo = new Map();
        for (const r of docs) {
            const dias = toNum(r.dias);
            const critical = dias >= toNum(r.dias_critico);
            const etapa = etapaDe(r);
            out.total++;
            if (critical) out.criticos++;
            out.por_etapa[etapa].total++;
            if (critical) out.por_etapa[etapa].criticos++;
            const t = porTipo.get(r.tipo_codigo) || { tipo_codigo: r.tipo_codigo, tipo_nombre: r.tipo_nombre, total: 0, criticos: 0 };
            t.total++;
            if (critical) t.criticos++;
            porTipo.set(r.tipo_codigo, t);
            out.items.push({
                documento_id: r.id, tipo_codigo: r.tipo_codigo, tipo_nombre: r.tipo_nombre, etapa, dias, critical,
                dias_aviso: toNum(r.dias_aviso), dias_critico: toNum(r.dias_critico),
                trabajador: { id: r.trabajador_id, nombre: nombreCompleto(r), rut: r.rut ?? null },
                obra_nombre: r.obra_nombre ?? null,
                lote_id: r.lote_id ?? null, portador_nombre: r.portador_nombre ?? null,
            });
        }
        out.por_tipo = [...porTipo.values()].sort((a, b) => b.criticos - a.criticos || b.total - a.total);

        const cfg = new Map(config.map(c => [c.categoria, c]));
        for (const l of lotes) {
            const cat = l.estado === 'pendiente_retiro' ? CAT_LOTE_SIN_CONFIRMAR : CAT_LOTE_EN_TERRENO;
            const c = cfg.get(cat);
            if (!c || !toNum(c.activo)) continue;
            const dias = toNum(l.dias);
            if (dias < toNum(c.dias_aviso)) continue;
            const critical = dias >= toNum(c.dias_critico);
            const bucket = l.estado === 'pendiente_retiro' ? out.lotes.sin_confirmar : out.lotes.en_terreno;
            bucket.total++;
            if (critical) bucket.criticos++;
            bucket.items.push({ lote_id: l.id, portador_id: l.portador_id ?? null, portador_nombre: l.portador_nombre ?? null, documentos: toNum(l.documentos), dias, critical });
        }
        return out;
    },
};

module.exports = documentosAlertasService;
module.exports._interno = { etapaDe, SELECT_DOCS, SELECT_LOTES };
