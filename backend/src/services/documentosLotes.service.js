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
    SELECT i.id, i.documento_id, i.estado, i.retirado_en, i.resuelto_en, i.observacion,
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

function proyectarLote(r) {
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
    };
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
            return rows.map(proyectarLote);
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
        const lote = proyectarLote(rows[0]);
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
