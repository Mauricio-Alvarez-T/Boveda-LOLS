/**
 * Cadena de custodia de documentos físicos (plan Gestiones B6, mig 114).
 *
 * Los documentos generados por Bóveda se imprimen en oficina y viajan en papel. Se modela el LOTE, no la
 * entrega por documento (decisión del dueño 2026-09-14):
 *   RRHH crea el lote (pendiente_retiro) → el PORTADOR confirma en Bóveda que lo recibió (en_terreno) →
 *   firma en obra → RRHH confirma la devolución (firmado). Doble llave estricta: RRHH no puede confirmar
 *   el retiro por el portador.
 *
 * Reglas (docs/reglas/rrhh-trabajadores.md § Cadena de custodia de documentos físicos):
 *  - Entra al lote un documento `origen='generado'`, activo, en estado `descargado` (ya impreso) y sin
 *    lote vigente (`documentos.lote_id IS NULL`). Un documento está en UN solo lote abierto a la vez.
 *  - Estados del documento: descargado → en_terreno → firmado. Excepción a "monótono": devuelto sin firma
 *    o no entregado vuelve a `descargado` (sigue impreso en oficina) y libera `lote_id`.
 *  - Quien solo tiene documentos.entrega.portar ve y confirma ÚNICAMENTE sus lotes.
 *  - Degradación (D-I): sin la mig 114 (errno 1146/1054) las lecturas devuelven vacío y las escrituras
 *    responden 409 MIGRACION_PENDIENTE. Logs manuales (el logger global excluye /api/documentos-lotes).
 */
const db = require('../config/db');
const { logManualActivity } = require('../middleware/logger');
const logger = require('../utils/logger-structured');
const { hasCols } = require('../utils/schema');
const { hoyChile, sumarDias } = require('../utils/fechaChile');
const { tenencia, MAX_DIAS_HABILES_TERRENO } = require('../utils/tenenciaTerreno');
const { feriadosEntre } = require('../utils/feriadosSet');

const httpError = (msg, statusCode, extra = {}) => Object.assign(new Error(msg), { statusCode, ...extra });
const ERR_ESQUEMA = new Set([1146, 1054]);
const esErrorEsquema = err => err && ERR_ESQUEMA.has(err.errno);
const migracionPendiente = () => httpError('Los documentos físicos requieren la migración 114 (documentos_lotes). Avisa a TI.', 409, { code: 'MIGRACION_PENDIENTE' });

const PERM_REGISTRAR = 'documentos.entrega.registrar';
const PERM_PORTAR = 'documentos.entrega.portar';
const puedeRegistrar = (user) => Array.isArray(user?.p) && user.p.includes(PERM_REGISTRAR);

/** ids enteros positivos, sin repetidos, en el orden recibido. */
const toIds = (arr) => [...new Set((Array.isArray(arr) ? arr : []).map(Number).filter(n => Number.isInteger(n) && n > 0))];
const toNum = (v) => Number(v) || 0;
const nombreCompleto = (r) => [r.apellido_paterno, r.apellido_materno, r.nombres].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();

/**
 * Usuarios con `documentos.entrega.portar` EFECTIVO: rol con la clave o grant por usuario, sin deny; el
 * Super Administrador (rol 1) siempre. SQL directo sobre las tablas de permisos: recalcular con
 * getPermisosEfectivos por cada usuario sería N+1.
 */
const SELECT_PORTADORES = `
    SELECT u.id, u.nombre, u.email
      FROM usuarios u
     WHERE u.activo = 1
       AND NOT EXISTS (SELECT 1 FROM permisos_usuario_override o WHERE o.usuario_id = u.id AND o.permiso_clave = ? AND o.tipo = 'deny' AND u.rol_id <> 1)
       AND (u.rol_id = 1
            OR EXISTS (SELECT 1 FROM permisos_rol_v2 pr WHERE pr.rol_id = u.rol_id AND pr.permiso_clave = ?)
            OR EXISTS (SELECT 1 FROM permisos_usuario_override o WHERE o.usuario_id = u.id AND o.permiso_clave = ? AND o.tipo = 'grant'))
     ORDER BY u.nombre`;

const SELECT_LOTES = `
    SELECT l.id, l.portador_id, up.nombre AS portador_nombre, l.creado_por, uc.nombre AS creado_por_nombre,
           l.estado, l.observacion, l.creado_en, l.retirado_en, l.cerrado_en,
           DATE_FORMAT(l.retirado_en, '%Y-%m-%d') AS retirado_dia,
           COUNT(i.id) AS total,
           SUM(i.estado = 'pendiente') AS pendientes, SUM(i.estado = 'retirado') AS en_terreno,
           SUM(i.estado = 'firmado') AS firmados, SUM(i.estado = 'devuelto_sin_firma') AS sin_firma,
           SUM(i.estado = 'no_entregado') AS no_entregados
      FROM documentos_lotes l
      LEFT JOIN usuarios up ON up.id = l.portador_id
      LEFT JOIN usuarios uc ON uc.id = l.creado_por
      LEFT JOIN documentos_lotes_items i ON i.lote_id = l.id`;
const GROUP_LOTES = ' GROUP BY l.id, l.portador_id, up.nombre, l.creado_por, uc.nombre, l.estado, l.observacion, l.creado_en, l.retirado_en, l.cerrado_en';

const SELECT_ITEMS = `
    SELECT i.id, i.lote_id, i.documento_id, i.estado, i.retirado_en, i.resuelto_en, i.observacion,
           d.nombre_archivo, d.estado AS documento_estado, td.nombre AS tipo_nombre, td.codigo AS tipo_codigo,
           t.id AS trabajador_id, t.nombres, t.apellido_paterno, t.apellido_materno, t.rut, o.nombre AS obra_nombre
      FROM documentos_lotes_items i
      JOIN documentos d ON d.id = i.documento_id
      LEFT JOIN tipos_documento td ON td.id = d.tipo_documento_id
      LEFT JOIN trabajadores t ON t.id = d.trabajador_id
      LEFT JOIN obras o ON o.id = t.obra_id
     WHERE i.lote_id = ?
     ORDER BY o.nombre, t.apellido_paterno, t.nombres, td.nombre, d.id`;

const SELECT_DISPONIBLES = `
    SELECT d.id, d.nombre_archivo, d.fecha_generacion, d.fecha_descarga, td.nombre AS tipo_nombre, td.codigo AS tipo_codigo,
           t.id AS trabajador_id, t.nombres, t.apellido_paterno, t.apellido_materno, t.rut, t.activo AS trabajador_activo,
           o.id AS obra_id, o.nombre AS obra_nombre
      FROM documentos d
      JOIN tipos_documento td ON td.id = d.tipo_documento_id
      LEFT JOIN trabajadores t ON t.id = d.trabajador_id
      LEFT JOIN obras o ON o.id = t.obra_id
     WHERE d.activo = TRUE AND d.origen = 'generado' AND d.estado = 'descargado' AND d.lote_id IS NULL`;

/**
 * `ctx` = { hoy, feriados } para la tenencia en terreno (máx. 4 días hábiles, jefatura 2026-10-21). Sin
 * ctx, o si el lote no está en terreno, `tenencia` es null.
 */
function proyectarLote(r, ctx = null) {
    return {
        id: r.id,
        portador_id: r.portador_id,
        portador_nombre: r.portador_nombre ?? null,
        creado_por: r.creado_por,
        creado_por_nombre: r.creado_por_nombre ?? null,
        estado: r.estado,
        observacion: r.observacion ?? null,
        creado_en: r.creado_en,
        retirado_en: r.retirado_en ?? null,
        cerrado_en: r.cerrado_en ?? null,
        total: toNum(r.total),
        pendientes: toNum(r.pendientes),
        en_terreno: toNum(r.en_terreno),
        firmados: toNum(r.firmados),
        sin_firma: toNum(r.sin_firma),
        no_entregados: toNum(r.no_entregados),
        tenencia: ctx && r.estado === 'en_terreno' && r.retirado_dia ? tenencia(r.retirado_dia, ctx.hoy, ctx.feriados) : null,
    };
}


/** Contexto de tenencia para un grupo de filas: hoy (Chile) y los feriados desde el retiro más antiguo. */
async function _ctxTenencia(rows) {
    const hoy = hoyChile();
    const dias = (rows || []).filter(r => r.estado === 'en_terreno' && r.retirado_dia).map(r => r.retirado_dia).sort();
    return { hoy, feriados: dias.length ? await feriadosEntre(dias[0], sumarDias(hoy, 60)) : new Set() };
}

function proyectarItem(r) {
    return {
        id: r.id,
        documento_id: r.documento_id,
        estado: r.estado,
        retirado_en: r.retirado_en ?? null,
        resuelto_en: r.resuelto_en ?? null,
        observacion: r.observacion ?? null,
        nombre_archivo: r.nombre_archivo,
        documento_estado: r.documento_estado,
        tipo_nombre: r.tipo_nombre ?? null,
        tipo_codigo: r.tipo_codigo ?? null,
        trabajador_id: r.trabajador_id ?? null,
        trabajador_nombre: r.trabajador_id ? nombreCompleto(r) : null,
        rut: r.rut ?? null,
        obra_nombre: r.obra_nombre ?? null,
    };
}

/** Lock del lote dentro de una transacción. */
async function _loteForUpdate(conn, id) {
    const [rows] = await conn.query('SELECT id, portador_id, creado_por, estado FROM documentos_lotes WHERE id = ? FOR UPDATE', [id]);
    if (!rows.length) throw httpError('Lote no encontrado', 404);
    return rows[0];
}

async function _log(userId, accion, loteId, detalle, req) {
    try {
        await logManualActivity(userId, 'documentos-lotes', accion, String(loteId), JSON.stringify(detalle), req);
    } catch (e) {
        logger.warn('No se pudo registrar el log del lote', { err: e.message, loteId });
    }
}

/** Transacción con manejo uniforme: rollback + degradación de esquema a 409 MIGRACION_PENDIENTE. */
async function _tx(fn) {
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        const out = await fn(conn);
        await conn.commit();
        return out;
    } catch (err) {
        await conn.rollback();
        if (esErrorEsquema(err)) throw migracionPendiente();
        throw err;
    } finally {
        conn.release();
    }
}

const documentosLotesService = {
    PERM_REGISTRAR,
    PERM_PORTAR,

    /** Usuarios que pueden retirar documentos (para el <select> de RRHH). */
    async portadores() {
        try {
            const [rows] = await db.query(SELECT_PORTADORES, [PERM_PORTAR, PERM_PORTAR, PERM_PORTAR]);
            return rows.map(r => ({ id: r.id, nombre: r.nombre, email: r.email ?? null }));
        } catch (err) {
            if (esErrorEsquema(err)) return [];
            throw err;
        }
    },

    /** Documentos impresos (descargados) sin lote: lo que RRHH puede meter en un lote. */
    async disponibles({ obra_id, q } = {}) {
        const params = [];
        let sql = SELECT_DISPONIBLES;
        const obra = Number(obra_id);
        if (Number.isInteger(obra) && obra > 0) { sql += ' AND t.obra_id = ?'; params.push(obra); }
        const texto = String(q || '').trim();
        if (texto) {
            sql += ' AND (t.rut LIKE ? OR t.nombres LIKE ? OR t.apellido_paterno LIKE ? OR t.apellido_materno LIKE ?)';
            const like = `%${texto}%`;
            params.push(like, like, like, like);
        }
        sql += ' ORDER BY o.nombre, t.apellido_paterno, t.nombres, td.nombre, d.id';
        try {
            const [rows] = await db.query(sql, params);
            return rows.map(r => ({
                id: r.id, nombre_archivo: r.nombre_archivo, fecha_generacion: r.fecha_generacion, fecha_descarga: r.fecha_descarga,
                tipo_nombre: r.tipo_nombre, tipo_codigo: r.tipo_codigo ?? null,
                trabajador_id: r.trabajador_id ?? null, trabajador_nombre: r.trabajador_id ? nombreCompleto(r) : null, rut: r.rut ?? null,
                trabajador_activo: r.trabajador_activo == null ? null : !!r.trabajador_activo,
                obra_id: r.obra_id ?? null, obra_nombre: r.obra_nombre ?? null,
            }));
        } catch (err) {
            if (esErrorEsquema(err)) return [];
            throw err;
        }
    },

    /**
     * POST / — RRHH declara qué documentos entrega a un portador. Transacción: portador válido (activo y
     * con permiso de portar) → documentos disponibles bajo FOR UPDATE (409 DOCUMENTO_NO_DISPONIBLE con la
     * lista) → lote + ítems → documentos.lote_id.
     */
    async crear({ portador_id, documento_ids, observacion }, userId, req) {
        const ids = toIds(documento_ids);
        if (!ids.length) throw httpError('Marca al menos un documento', 400);
        const portadorId = Number(portador_id);
        if (!Number.isInteger(portadorId) || portadorId <= 0) throw httpError('Portador inválido', 400, { code: 'PORTADOR_INVALIDO' });

        const out = await _tx(async (conn) => {
            const [pRows] = await conn.query(`${SELECT_PORTADORES.replace('ORDER BY u.nombre', '')} AND u.id = ?`, [PERM_PORTAR, PERM_PORTAR, PERM_PORTAR, portadorId]);
            if (!pRows.length) {
                throw httpError('El portador no existe, está inactivo o no tiene el permiso "Portar Documentos Físicos" (Configuración → Usuarios → permisos por usuario).', 400, { code: 'PORTADOR_INVALIDO' });
            }
            const portador = pRows[0];

            const [docs] = await conn.query(
                'SELECT id, activo, origen, estado, lote_id FROM documentos WHERE id IN (?) FOR UPDATE',
                [ids]
            );
            const porId = new Map(docs.map(d => [Number(d.id), d]));
            const noDisponibles = ids.filter(id => {
                const d = porId.get(id);
                return !d || !d.activo || d.origen !== 'generado' || d.estado !== 'descargado' || d.lote_id != null;
            });
            if (noDisponibles.length) {
                throw httpError(
                    `Hay ${noDisponibles.length} documento(s) que ya no están disponibles para retirar (en otro lote, sin imprimir o eliminados). Recarga la lista.`,
                    409, { code: 'DOCUMENTO_NO_DISPONIBLE', details: { no_disponibles: noDisponibles } }
                );
            }

            const obs = String(observacion ?? '').trim() || null;
            const [ins] = await conn.query(
                'INSERT INTO documentos_lotes (portador_id, creado_por, estado, observacion) VALUES (?, ?, \'pendiente_retiro\', ?)',
                [portadorId, userId ?? null, obs]
            );
            const loteId = ins.insertId;
            await conn.query('INSERT INTO documentos_lotes_items (lote_id, documento_id) VALUES ?', [ids.map(id => [loteId, id])]);
            await conn.query('UPDATE documentos SET lote_id = ? WHERE id IN (?)', [loteId, ids]);
            return { lote_id: loteId, portador_id: portadorId, portador_nombre: portador.nombre, n: ids.length };
        });

        await _log(userId, 'CREATE', out.lote_id, { evento: 'lote_creado', portador_id: out.portador_id, documentos: out.n, resumen: `Lote #${out.lote_id}: ${out.n} documento(s) para ${out.portador_nombre}` }, req);
        return out;
    },

    /** Lotes visibles para el usuario: con registrar, todos; con solo portar, los suyos. */
    async listar({ estado } = {}, user) {
        const where = [];
        const params = [];
        if (!puedeRegistrar(user)) { where.push('l.portador_id = ?'); params.push(user.id); }
        if (estado && ['pendiente_retiro', 'en_terreno', 'cerrado'].includes(estado)) { where.push('l.estado = ?'); params.push(estado); }
        const sql = `${SELECT_LOTES}${where.length ? ` WHERE ${where.join(' AND ')}` : ''}${GROUP_LOTES} ORDER BY FIELD(l.estado, 'pendiente_retiro', 'en_terreno', 'cerrado'), l.creado_en DESC LIMIT 200`;
        try {
            const [rows] = await db.query(sql, params);
            const ctx = await _ctxTenencia(rows);
            return rows.map(r => proyectarLote(r, ctx));
        } catch (err) {
            if (esErrorEsquema(err)) return [];
            throw err;
        }
    },

    /** Lote + ítems. 403 si es ajeno y el usuario no registra. */
    async obtener(id, user) {
        let rows;
        try {
            [rows] = await db.query(`${SELECT_LOTES} WHERE l.id = ?${GROUP_LOTES}`, [id]);
        } catch (err) {
            if (esErrorEsquema(err)) throw httpError('Lote no encontrado', 404);
            throw err;
        }
        if (!rows.length) throw httpError('Lote no encontrado', 404);
        const lote = proyectarLote(rows[0], await _ctxTenencia(rows));
        if (!puedeRegistrar(user) && lote.portador_id !== user.id) throw httpError('Este lote es de otro portador', 403);
        const [items] = await db.query(SELECT_ITEMS, [id]);
        return { ...lote, items: items.map(proyectarItem) };
    },

    /**
     * PUT /:id/confirmar-retiro — SOLO el portador del lote (doble llave: RRHH no puede). `documento_ids` =
     * los que sí recibió; el resto queda `no_entregado` y vuelve a oficina (lote_id NULL).
     */
    async confirmarRetiro(id, { documento_ids }, user, req) {
        const recibidosPedidos = toIds(documento_ids);
        const out = await _tx(async (conn) => {
            const lote = await _loteForUpdate(conn, id);
            if (lote.portador_id !== user.id) throw httpError('Solo el portador asignado puede confirmar el retiro de este lote', 403, { code: 'LOTE_AJENO' });
            if (lote.estado !== 'pendiente_retiro') throw httpError('Este lote ya fue confirmado', 409, { code: 'LOTE_NO_PENDIENTE' });

            const [items] = await conn.query('SELECT documento_id FROM documentos_lotes_items WHERE lote_id = ? AND estado = \'pendiente\' FOR UPDATE', [id]);
            const delLote = new Set(items.map(i => Number(i.documento_id)));
            const ajenos = recibidosPedidos.filter(d => !delLote.has(d));
            if (ajenos.length) throw httpError('Hay documentos que no pertenecen a este lote', 400, { details: { ajenos } });
            const recibidos = recibidosPedidos;
            const noRecibidos = [...delLote].filter(d => !recibidos.includes(d));

            if (recibidos.length) {
                await conn.query('UPDATE documentos_lotes_items SET estado = \'retirado\', retirado_en = NOW() WHERE lote_id = ? AND documento_id IN (?)', [id, recibidos]);
                await conn.query('UPDATE documentos SET estado = \'en_terreno\' WHERE id IN (?)', [recibidos]);
            }
            if (noRecibidos.length) {
                await conn.query('UPDATE documentos_lotes_items SET estado = \'no_entregado\', resuelto_en = NOW(), resuelto_por = ? WHERE lote_id = ? AND documento_id IN (?)', [user.id, id, noRecibidos]);
                // Vuelve a oficina: sigue impreso (descargado), libre para otro lote.
                await conn.query('UPDATE documentos SET lote_id = NULL WHERE id IN (?)', [noRecibidos]);
            }
            const estado = recibidos.length ? 'en_terreno' : 'cerrado';
            await conn.query(
                `UPDATE documentos_lotes SET estado = ?, retirado_en = NOW()${estado === 'cerrado' ? ', cerrado_en = NOW()' : ''} WHERE id = ?`,
                [estado, id]
            );
            return { lote_id: Number(id), estado, recibidos: recibidos.length, no_entregados: noRecibidos.length };
        });
        await _log(user.id, 'UPDATE', id, { evento: 'lote_retirado', ...out, resumen: `Lote #${id}: retiro confirmado (${out.recibidos} recibido(s), ${out.no_entregados} no entregado(s))` }, req);
        return out;
    },

    /**
     * PUT /:id/recepcion — RRHH recibe lo que vuelve de la obra: `firmados` (documento → firmado) y
     * `sin_firma` (documento → descargado, para volver a llevarlo). Parcial: el lote se cierra cuando no
     * queda ningún ítem en terreno.
     */
    async recepcion(id, { firmados, sin_firma, observacion }, user, req) {
        const okIds = toIds(firmados);
        const sinIds = toIds(sin_firma).filter(d => !okIds.includes(d));
        if (!okIds.length && !sinIds.length) throw httpError('Marca al menos un documento como firmado o devuelto sin firma', 400);

        const out = await _tx(async (conn) => {
            const lote = await _loteForUpdate(conn, id);
            if (lote.estado !== 'en_terreno') {
                throw httpError(lote.estado === 'pendiente_retiro' ? 'El portador aún no confirmó el retiro de este lote' : 'Este lote ya está cerrado', 409, { code: 'LOTE_NO_EN_TERRENO' });
            }
            const [items] = await conn.query('SELECT documento_id FROM documentos_lotes_items WHERE lote_id = ? AND estado = \'retirado\' FOR UPDATE', [id]);
            const enTerreno = new Set(items.map(i => Number(i.documento_id)));
            const ajenos = [...okIds, ...sinIds].filter(d => !enTerreno.has(d));
            if (ajenos.length) throw httpError('Hay documentos que no están en terreno en este lote', 400, { details: { ajenos } });

            const obs = String(observacion ?? '').trim() || null;
            if (okIds.length) {
                await conn.query('UPDATE documentos_lotes_items SET estado = \'firmado\', resuelto_en = NOW(), resuelto_por = ?, observacion = ? WHERE lote_id = ? AND documento_id IN (?)', [user.id, obs, id, okIds]);
                await conn.query('UPDATE documentos SET estado = \'firmado\', fecha_firmado = NOW(), lote_id = NULL WHERE id IN (?)', [okIds]);
            }
            if (sinIds.length) {
                await conn.query('UPDATE documentos_lotes_items SET estado = \'devuelto_sin_firma\', resuelto_en = NOW(), resuelto_por = ?, observacion = ? WHERE lote_id = ? AND documento_id IN (?)', [user.id, obs, id, sinIds]);
                // Excepción a "estado monótono": vuelve a descargado (sigue impreso) para volver a llevarlo.
                await conn.query('UPDATE documentos SET estado = \'descargado\', lote_id = NULL WHERE id IN (?)', [sinIds]);
            }
            const restantes = enTerreno.size - okIds.length - sinIds.length;
            const estado = restantes > 0 ? 'en_terreno' : 'cerrado';
            if (estado === 'cerrado') await conn.query('UPDATE documentos_lotes SET estado = \'cerrado\', cerrado_en = NOW() WHERE id = ?', [id]);
            return { lote_id: Number(id), estado, firmados: okIds.length, sin_firma: sinIds.length, en_terreno: restantes };
        });
        await _log(user.id, 'UPDATE', id, { evento: 'lote_recepcion', ...out, resumen: `Lote #${id}: ${out.firmados} firmado(s), ${out.sin_firma} sin firma${out.estado === 'cerrado' ? ' · lote cerrado' : ''}` }, req);
        return out;
    },

    /** DELETE /:id — RRHH anula un lote que el portador aún no confirmó (se equivocó al armarlo). */
    async anular(id, user, req) {
        const out = await _tx(async (conn) => {
            const lote = await _loteForUpdate(conn, id);
            if (lote.estado !== 'pendiente_retiro') throw httpError('Solo se puede anular un lote que el portador aún no confirmó', 409, { code: 'LOTE_NO_PENDIENTE' });
            const [upd] = await conn.query('UPDATE documentos SET lote_id = NULL WHERE lote_id = ?', [id]);
            await conn.query('DELETE FROM documentos_lotes_items WHERE lote_id = ?', [id]);
            await conn.query('DELETE FROM documentos_lotes WHERE id = ?', [id]);
            return { lote_id: Number(id), liberados: upd.affectedRows || 0 };
        });
        await _log(user.id, 'DELETE', id, { evento: 'lote_anulado', ...out, resumen: `Lote #${id} anulado (${out.liberados} documento(s) vuelven a "por retirar")` }, req);
        return out;
    },

    /**
     * Lotes en terreno que pasaron los 4 días hábiles de tenencia (jefatura 2026-10-21), con sus documentos
     * aún en terreno. Con registrar, todos; con solo portar, los míos. Es lo que la ventana del inicio de
     * sesión muestra.
     */
    async atrasados(user) {
        const mio = !puedeRegistrar(user);
        const vacio = { max_dias_habiles: MAX_DIAS_HABILES_TERRENO, alcance: mio ? 'propios' : 'todos', lotes: [] };
        let rows;
        try {
            [rows] = await db.query(
                `${SELECT_LOTES} WHERE l.estado = 'en_terreno'${mio ? ' AND l.portador_id = ?' : ''}${GROUP_LOTES}`,
                mio ? [user.id] : []
            );
        } catch (err) {
            if (esErrorEsquema(err)) return vacio;
            throw err;
        }
        const ctx = await _ctxTenencia(rows);
        const vencidos = (rows || []).map(r => proyectarLote(r, ctx)).filter(l => l.tenencia?.atrasado && l.en_terreno > 0);
        if (!vencidos.length) return vacio;
        const [items] = await db.query(
            SELECT_ITEMS.replace('WHERE i.lote_id = ?', "WHERE i.lote_id IN (?) AND i.estado = 'retirado'"),
            [vencidos.map(l => l.id)]
        );
        const porLote = new Map();
        for (const it of items || []) {
            const k = Number(it.lote_id);
            if (!porLote.has(k)) porLote.set(k, []);
            porLote.get(k).push(proyectarItem(it));
        }
        return {
            ...vacio,
            lotes: vencidos
                .sort((a, b) => b.tenencia.dias_atraso - a.tenencia.dias_atraso || a.id - b.id)
                .map(l => ({
                    lote_id: l.id, portador_id: l.portador_id, portador_nombre: l.portador_nombre, retirado_en: l.retirado_en,
                    tenencia: l.tenencia,
                    documentos: (porLote.get(l.id) || []).map(i => ({
                        documento_id: i.documento_id, tipo_nombre: i.tipo_nombre, trabajador_nombre: i.trabajador_nombre, rut: i.rut, obra_nombre: i.obra_nombre,
                    })),
                })),
        };
    },

    /**
     * Flujo completo de los documentos físicos para el detalle de Gestiones del Inicio (detalle D del lienzo,
     * dueño 2026-10-21; solo RRHH): una lista por etapa —sin imprimir, impreso sin portador, en oficina
     * esperando retiro, en terreno (con tenencia) y firmados esta semana—. Los días de las dos primeras se
     * cuentan desde `fecha_generacion`, como las alertas B7. Cada lista llega hasta LIMITE_FLUJO filas; `n`
     * es el total real.
     */
    async flujo(user) {
        const LIMITE_FLUJO = 300;
        const hoy = hoyChile();
        const dow = new Date(`${hoy}T12:00:00Z`).getUTCDay();
        const lunes = sumarDias(hoy, -((dow + 6) % 7));
        const persona = r => (r.trabajador_id ? nombreCompleto(r) : null);
        const doc = r => ({
            documento_id: r.id, tipo_nombre: r.tipo_nombre ?? null, trabajador_id: r.trabajador_id ?? null,
            trabajador_nombre: persona(r), rut: r.rut ?? null, obra_nombre: r.obra_nombre ?? null, dias: toNum(r.dias),
        });
        const BASE = `
            FROM documentos d
            JOIN tipos_documento td ON td.id = d.tipo_documento_id
            LEFT JOIN trabajadores t ON t.id = d.trabajador_id
            LEFT JOIN obras o ON o.id = t.obra_id
           WHERE d.activo = TRUE AND d.origen = 'generado'`;
        const COLS = `SELECT d.id, td.nombre AS tipo_nombre, t.id AS trabajador_id, t.nombres, t.apellido_paterno, t.apellido_materno, t.rut, o.nombre AS obra_nombre`;
        try {
            const [[sinImprimir], [cSin], [impresos], [cImp], [firmados], [cFir], lotes] = await Promise.all([
                db.query(`${COLS}, DATEDIFF(CURDATE(), d.fecha_generacion) AS dias ${BASE} AND d.estado = 'generado' ORDER BY d.fecha_generacion, d.id LIMIT ?`, [LIMITE_FLUJO]),
                db.query(`SELECT COUNT(*) AS n ${BASE} AND d.estado = 'generado'`),
                db.query(`${COLS}, DATEDIFF(CURDATE(), d.fecha_generacion) AS dias ${BASE} AND d.estado = 'descargado' AND d.lote_id IS NULL ORDER BY d.fecha_generacion, d.id LIMIT ?`, [LIMITE_FLUJO]),
                db.query(`SELECT COUNT(*) AS n ${BASE} AND d.estado = 'descargado' AND d.lote_id IS NULL`),
                db.query(`${COLS}, DATE_FORMAT(d.fecha_firmado, '%Y-%m-%d') AS firmado_el, 0 AS dias ${BASE} AND d.estado = 'firmado' AND d.fecha_firmado >= ? ORDER BY d.fecha_firmado DESC, d.id DESC LIMIT ?`, [lunes, LIMITE_FLUJO]),
                db.query(`SELECT COUNT(*) AS n ${BASE} AND d.estado = 'firmado' AND d.fecha_firmado >= ?`, [lunes]),
                this.listar({}, user),
            ]);
            return {
                hoy, desde_firmados: lunes,
                sin_imprimir: { n: toNum(cSin[0]?.n), items: sinImprimir.map(doc) },
                impresos: { n: toNum(cImp[0]?.n), items: impresos.map(doc) },
                en_oficina: lotes.filter(l => l.estado === 'pendiente_retiro'),
                en_terreno: lotes.filter(l => l.estado === 'en_terreno'),
                firmados: { n: toNum(cFir[0]?.n), items: firmados.map(r => ({ ...doc(r), firmado_el: r.firmado_el ?? null })) },
            };
        } catch (err) {
            if (esErrorEsquema(err)) {
                return { hoy, desde_firmados: lunes, sin_imprimir: { n: 0, items: [] }, impresos: { n: 0, items: [] }, en_oficina: [], en_terreno: [], firmados: { n: 0, items: [] } };
            }
            throw err;
        }
    },

    /**
     * Los lotes DEL usuario como portador, para su tarjeta «Tus documentos» del Inicio (dueño 2026-10-21):
     * los que lo esperan en oficina y los que tiene en sus manos (con tenencia), cada uno con sus documentos
     * aún abiertos, más cuántos devolvió esta semana. Siempre por portador_id, aunque también registre.
     */
    async misLotes(user) {
        const hoy = hoyChile();
        const dow = new Date(`${hoy}T12:00:00Z`).getUTCDay();
        const lunes = sumarDias(hoy, -((dow + 6) % 7));
        const vacio = { en_oficina: [], en_mano: [], devueltos_semana: 0 };
        let rows;
        try {
            [rows] = await db.query(
                `${SELECT_LOTES} WHERE l.portador_id = ? AND l.estado IN ('pendiente_retiro', 'en_terreno')${GROUP_LOTES} ORDER BY l.retirado_en, l.creado_en`,
                [user.id]
            );
        } catch (err) {
            if (esErrorEsquema(err)) return vacio;
            throw err;
        }
        const ctx = await _ctxTenencia(rows);
        const lotes = (rows || []).map(r => proyectarLote(r, ctx));
        const porLote = new Map();
        if (lotes.length) {
            const [items] = await db.query(
                SELECT_ITEMS.replace('WHERE i.lote_id = ?', "WHERE i.lote_id IN (?) AND i.estado IN ('pendiente', 'retirado')"),
                [lotes.map(l => l.id)]
            );
            for (const it of items || []) {
                const k = Number(it.lote_id);
                if (!porLote.has(k)) porLote.set(k, []);
                porLote.get(k).push(proyectarItem(it));
            }
        }
        const [dev] = await db.query(
            `SELECT COUNT(*) AS n FROM documentos_lotes_items i JOIN documentos_lotes l ON l.id = i.lote_id
              WHERE l.portador_id = ? AND i.estado IN ('firmado', 'devuelto_sin_firma') AND i.resuelto_en >= ?`,
            [user.id, lunes]
        );
        const conDocs = l => ({ ...l, documentos: porLote.get(l.id) || [] });
        return {
            en_oficina: lotes.filter(l => l.estado === 'pendiente_retiro').map(conDocs),
            en_mano: lotes.filter(l => l.estado === 'en_terreno').map(conDocs)
                .sort((a, b) => (b.tenencia?.dia ?? 0) - (a.tenencia?.dia ?? 0)),
            devueltos_semana: toNum(dev?.[0]?.n),
        };
    },

    /** Contadores para badge/Bandeja: con registrar, globales; con solo portar, los míos. */
    async pendientesCount(user) {
        const mio = !puedeRegistrar(user);
        try {
            const [rows] = await db.query(
                `SELECT SUM(estado = 'pendiente_retiro') AS por_confirmar, SUM(estado = 'en_terreno') AS en_terreno
                   FROM documentos_lotes${mio ? ' WHERE portador_id = ?' : ''}`,
                mio ? [user.id] : []
            );
            return { por_confirmar: toNum(rows[0]?.por_confirmar), en_terreno: toNum(rows[0]?.en_terreno), alcance: mio ? 'propios' : 'todos' };
        } catch (err) {
            if (esErrorEsquema(err)) return { por_confirmar: 0, en_terreno: 0, alcance: mio ? 'propios' : 'todos' };
            throw err;
        }
    },

    /**
     * Enriquece filas de documentos (getByTrabajador) con la custodia vigente: lote, portador y fecha de
     * firma. Consulta aparte y condicionada a la mig 114 para no tocar el fallback 1054 de la mig 110.
     */
    async decorarCustodia(rows) {
        if (!Array.isArray(rows) || !rows.length) return rows;
        if (!(await hasCols('documentos', 'lote_id'))) return rows;
        try {
            const ids = rows.map(r => r.id);
            const [extra] = await db.query(
                `SELECT d.id, d.lote_id, d.fecha_firmado, l.retirado_en AS lote_retirado_en, l.estado AS lote_estado, up.nombre AS portador_nombre
                   FROM documentos d
                   LEFT JOIN documentos_lotes l ON l.id = d.lote_id
                   LEFT JOIN usuarios up ON up.id = l.portador_id
                  WHERE d.id IN (?)`,
                [ids]
            );
            const porId = new Map(extra.map(e => [Number(e.id), e]));
            return rows.map(r => {
                const e = porId.get(Number(r.id));
                return e
                    ? { ...r, lote_id: e.lote_id ?? null, fecha_firmado: e.fecha_firmado ?? null, lote_estado: e.lote_estado ?? null, lote_retirado_en: e.lote_retirado_en ?? null, portador_nombre: e.portador_nombre ?? null }
                    : r;
            });
        } catch (err) {
            if (esErrorEsquema(err)) return rows;
            throw err;
        }
    },
};

module.exports = documentosLotesService;
module.exports._interno = { toIds, proyectarLote, proyectarItem, SELECT_PORTADORES };
