const router = require('express').Router();
const auth = require('../middleware/auth');
const { checkPermission } = require('../middleware/rbac');
const db = require('../config/db');
const { ACCIONES_VISIBLES, NOISY_ACCIONES } = require('../config/log-config');

/**
 * Construye los WHERE conds y params a partir de los query params del
 * request. Compartido por GET / y GET /export para que el archivo CSV
 * refleje exactamente lo que el usuario ve en pantalla.
 *
 * Filtros soportados:
 *   - q             texto libre (entidad_label OR detalle OR usuario.nombre)
 *   - usuario_id    id exacto
 *   - modulo        slug exacto (asistencias, trabajadores, ...)
 *   - accion        CSV de acciones (CREATE,UPDATE,DELETE,...). Si vacío usa
 *                   ACCIONES_VISIBLES por default (excluye LOGIN salvo que
 *                   incluir_logins=true).
 *   - entidad_tipo  filtro exacto (trabajador, obra, ...)
 *   - desde / hasta YYYY-MM-DD (inclusive en ambos extremos)
 *   - incluir_logins boolean (string 'true'). Si false, excluye LOGIN.
 */
function buildLogsFilter(query) {
    const conds = ['1=1'];
    const params = [];

    const {
        q, usuario_id, modulo, accion, entidad_tipo,
        desde, hasta, incluir_logins,
    } = query;

    // LOGIN excluido por default — es ruido en el panel.
    const showLogins = incluir_logins === 'true' || incluir_logins === true;
    if (!showLogins) {
        const noisy = [...NOISY_ACCIONES];
        if (noisy.length > 0) {
            conds.push(`l.accion NOT IN (${noisy.map(() => '?').join(',')})`);
            params.push(...noisy);
        }
    }

    if (usuario_id) {
        conds.push('l.usuario_id = ?');
        params.push(Number(usuario_id));
    }

    if (modulo) {
        conds.push('l.modulo = ?');
        params.push(String(modulo));
    }

    // accion es CSV "CREATE,UPDATE" o cadena simple "DELETE".
    if (accion) {
        const accs = String(accion).split(',').map(s => s.trim()).filter(Boolean);
        if (accs.length > 0) {
            conds.push(`l.accion IN (${accs.map(() => '?').join(',')})`);
            params.push(...accs);
        }
    }

    if (entidad_tipo) {
        conds.push('l.entidad_tipo = ?');
        params.push(String(entidad_tipo));
    }

    if (desde) {
        conds.push('l.created_at >= ?');
        params.push(`${desde} 00:00:00`);
    }
    if (hasta) {
        conds.push('l.created_at <= ?');
        params.push(`${hasta} 23:59:59`);
    }

    if (q) {
        const pat = `%${q}%`;
        conds.push('(l.entidad_label LIKE ? OR l.detalle LIKE ? OR u.nombre LIKE ?)');
        params.push(pat, pat, pat);
    }

    return { whereSql: conds.join(' AND '), params };
}

/**
 * GET /api/logs — listado paginado con filtros.
 *
 * Query params: ver buildLogsFilter() + page (default 1), limit (default 20,
 * tope 200).
 *
 * Response:
 *   {
 *     data:        [...],     // filas con campos de logs_actividad + usuario_nombre
 *     total:       1234,      // total de filas que matchean (sin paginación)
 *     page:        1,
 *     limit:       20,
 *     total_pages: 62
 *   }
 */
router.get('/', auth, checkPermission('sistema.logs.ver'), async (req, res, next) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 20));
        const offset = (page - 1) * limit;

        const { whereSql, params } = buildLogsFilter(req.query);

        // Conteo total — necesario para que la paginación muestre páginas reales.
        const [[{ total }]] = await db.query(
            `SELECT COUNT(*) AS total
             FROM logs_actividad l
             LEFT JOIN usuarios u ON l.usuario_id = u.id
             WHERE ${whereSql}`,
            params
        );

        const [rows] = await db.query(
            `SELECT l.*, u.nombre AS usuario_nombre
             FROM logs_actividad l
             LEFT JOIN usuarios u ON l.usuario_id = u.id
             WHERE ${whereSql}
             ORDER BY l.created_at DESC, l.id DESC
             LIMIT ? OFFSET ?`,
            [...params, limit, offset]
        );

        res.json({
            data: rows,
            total,
            page,
            limit,
            total_pages: Math.max(1, Math.ceil(total / limit)),
        });
    } catch (err) { next(err); }
});

/**
 * GET /api/logs/filtros — datos para llenar los selects del panel.
 *
 * Devuelve sólo valores DISTINCT efectivamente presentes en la tabla, así
 * que la lista no muestra módulos huérfanos. Cacheable a futuro.
 */
router.get('/filtros', auth, checkPermission('sistema.logs.ver'), async (req, res, next) => {
    try {
        const [usuarios] = await db.query(
            `SELECT DISTINCT u.id, u.nombre
             FROM usuarios u
             INNER JOIN logs_actividad l ON l.usuario_id = u.id
             ORDER BY u.nombre ASC`
        );

        const [modulosRows] = await db.query(
            `SELECT DISTINCT modulo
             FROM logs_actividad
             WHERE modulo IS NOT NULL AND modulo != ''
             ORDER BY modulo ASC`
        );

        const [entidadRows] = await db.query(
            `SELECT DISTINCT entidad_tipo
             FROM logs_actividad
             WHERE entidad_tipo IS NOT NULL
             ORDER BY entidad_tipo ASC`
        );

        const [accionRows] = await db.query(
            `SELECT DISTINCT accion FROM logs_actividad ORDER BY accion ASC`
        );

        res.json({
            data: {
                usuarios,
                modulos: modulosRows.map(r => r.modulo),
                entidad_tipos: entidadRows.map(r => r.entidad_tipo),
                acciones: accionRows.map(r => r.accion),
                acciones_default: ACCIONES_VISIBLES,
            }
        });
    } catch (err) { next(err); }
});

/* ───────────────── helpers para CSV ───────────────── */

/**
 * Escapa un valor para una celda CSV. Comillas dobles + envoltura si tiene
 * coma, comilla, salto de línea o ; (Excel ES usa ; como separador en
 * algunas locales — mejor envolver siempre que aparezca).
 */
function csvCell(val) {
    if (val === null || val === undefined) return '';
    let s = String(val);
    if (/[",;\n\r]/.test(s)) {
        s = `"${s.replace(/"/g, '""')}"`;
    }
    return s;
}

function csvLine(arr) {
    return arr.map(csvCell).join(',') + '\r\n';
}

/**
 * Extrae un resumen humano del campo `detalle` (JSON string).
 * Schemas posibles:
 *   - { resumen, ... }                  (formato canónico)
 *   - { type: 'bulk_asistencia', ... }  (asistencias bulk)
 *   - { antes, nuevo }                  (legacy — UPDATE viejo)
 *   - "" / null
 */
function detalleResumen(detalle) {
    if (!detalle) return '';
    let parsed;
    try { parsed = JSON.parse(detalle); } catch (e) { return String(detalle).slice(0, 200); }
    if (parsed && typeof parsed === 'object') {
        if (parsed.resumen) return String(parsed.resumen);
        if (parsed.type === 'bulk_asistencia') {
            return `Asistencia bulk · ${parsed.obra_nombre || `obra ${parsed.obra_id}`} · ${parsed.total || 0} trabajadores`;
        }
        if (parsed.antes && parsed.nuevo) return 'Cambio (legacy)';
    }
    return '';
}

/**
 * GET /api/logs/export?... — descarga CSV con filtros aplicados.
 *
 * Stream row-por-row para no cargar todo en memoria. Tope hard 50.000
 * filas para evitar dump accidental de toda la tabla.
 *
 * Headers:
 *   Content-Type: text/csv; charset=utf-8
 *   Content-Disposition: attachment; filename="historial_YYYY-MM-DD.csv"
 *
 * Excel friendly: BOM UTF-8 al inicio para que las tildes se vean bien al
 * abrir directo en Excel ES.
 */
router.get('/export', auth, checkPermission('sistema.logs.ver'), async (req, res, next) => {
    try {
        const HARD_LIMIT = 50000;
        const { whereSql, params } = buildLogsFilter(req.query);

        // Stream con conexión dedicada para liberarla al cerrar.
        const conn = await db.getConnection();
        try {
            const fecha = new Date().toISOString().split('T')[0];
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="historial_${fecha}.csv"`);

            // BOM UTF-8 → Excel ES detecta encoding correctamente.
            res.write('﻿');
            res.write(csvLine([
                'Fecha', 'Usuario', 'Módulo', 'Acción',
                'Tipo entidad', 'Entidad', 'Resumen', 'IP', 'Item ID'
            ]));

            const [rows] = await conn.query(
                `SELECT l.created_at, l.modulo, l.accion, l.item_id,
                        l.entidad_tipo, l.entidad_label, l.detalle, l.ip,
                        u.nombre AS usuario_nombre
                 FROM logs_actividad l
                 LEFT JOIN usuarios u ON l.usuario_id = u.id
                 WHERE ${whereSql}
                 ORDER BY l.created_at DESC, l.id DESC
                 LIMIT ?`,
                [...params, HARD_LIMIT]
            );

            for (const r of rows) {
                const fechaIso = r.created_at instanceof Date
                    ? r.created_at.toISOString().replace('T', ' ').slice(0, 19)
                    : String(r.created_at || '');
                res.write(csvLine([
                    fechaIso,
                    r.usuario_nombre || 'Sistema',
                    r.modulo || '',
                    r.accion || '',
                    r.entidad_tipo || '',
                    r.entidad_label || (r.item_id ? `ID ${r.item_id}` : ''),
                    detalleResumen(r.detalle),
                    r.ip || '',
                    r.item_id || '',
                ]));
            }
            res.end();
        } finally {
            conn.release();
        }
    } catch (err) { next(err); }
});

module.exports = router;
