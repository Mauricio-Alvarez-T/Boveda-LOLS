const db = require('../config/db');
const { normalizeUbicacion: _normalizeUbicacion } = require('../utils/ubicacionStock');
const { registrarMovimiento } = require('./stockMovimiento.service');
const logger = require('../utils/logger-structured');
const { normalizePagination } = require('../utils/pagination');

// Aislamiento de datos de prueba: excluye transferencias cuyo origen o destino
// sea una obra marcada es_prueba. NULL-safe (origen/destino puede ser bodega →
// obra_id NULL). Se concatena al WHERE de los listados; funciona también en el
// COUNT (no depende de los alias de JOIN, sólo de las columnas base de `t`).
// INNEGOCIABLE: los datos de prueba nunca se muestran, en ningún listado.
const EXCLUIR_SOLO_PRUEBA =
    ' AND (t.origen_obra_id IS NULL OR t.origen_obra_id NOT IN (SELECT id FROM obras WHERE es_prueba = 1))' +
    ' AND (t.destino_obra_id IS NULL OR t.destino_obra_id NOT IN (SELECT id FROM obras WHERE es_prueba = 1))';
// Política default de los listados: además de prueba, oculta obras FINALIZADAS.
// El histórico la levanta con ?incluir_finalizadas=true (mismo escape que GET /obras).
const EXCLUIR_OBRAS_PRUEBA =
    ' AND (t.origen_obra_id IS NULL OR t.origen_obra_id NOT IN (SELECT id FROM obras WHERE es_prueba = 1 OR finalizada = 1))' +
    ' AND (t.destino_obra_id IS NULL OR t.destino_obra_id NOT IN (SELECT id FROM obras WHERE es_prueba = 1 OR finalizada = 1))';

/**
 * Helper SoD: ¿el usuario tiene el permiso especial para saltarse las reglas
 * de Segregation of Duties (solicitante ≠ aprobador ≠ transportista ≠ receptor)?
 * Usado en flujo normal (aprobar / despachar / recibir). Los flujos especiales
 * (push_directo, intra_bodega, orden_gerencia) NO aplican SoD porque por diseño
 * consolidan roles — su gate de permiso individual ya implica autoridad.
 */
function _hasBypass(userPermisos) {
    return Array.isArray(userPermisos) && userPermisos.includes('inventario.transferencias.sod_bypass');
}

/** ¿El usuario tiene un permiso específico? */
function _hasPerm(userPermisos, permiso) {
    return Array.isArray(userPermisos) && userPermisos.includes(permiso);
}

/**
 * Construye un Error con statusCode 403 para violaciones SoD. El errorHandler
 * global respeta `err.statusCode` (ver middleware/errorHandler.js:61).
 */
function _sodError(msg) {
    const e = new Error(msg);
    e.statusCode = 403;
    return e;
}

/**
 * Flujo de stock (Ola 2 — decremento al recibir):
 *
 *  pendiente   → no toca stock
 *  aprobada    → no toca stock (solo persiste splits y cambia estado)
 *  en_transito → no toca stock
 *  recibida    → se mueve SOLO lo ENVIADO (regla del dueño 2026-10-21):
 *                ORIGEN -= enviado  +  DESTINO += enviado, por evento de recepción
 *                (parcial: hasta lo declarado, sin pasar de lo enviado; el 'total' que
 *                cierra completa la enviada). El origen sale FIFO por split vía
 *                transferencia_item_origenes.cantidad_decrementada. Lo DECLARADO por el
 *                receptor se acumula en transferencia_items.cantidad_recibida.
 *                Si al cerrar (recepción 'total') lo declarado acumulado ≠ enviado →
 *                se registra discrepancia (transferencia_discrepancias, diferencia_aplicada=0):
 *                  · declarado < enviado → faltante
 *                  · declarado > enviado → sobrante
 *                La diferencia NO está en el stock: queda PENDIENTE. Resolverla = APROBAR
 *                lo declarado (sobrante: destino +dif / origen −dif; faltante: destino −f /
 *                origen + lo que de verdad salió de más, hasta f; kardex 'discrepancia').
 *                Descartarla = RECHAZAR lo declarado
 *                (no mueve stock: queda lo enviado). Las diferencias de la regla anterior
 *                (diferencia_aplicada=1, la diferencia SÍ se aplicó al recibir) se rehacen
 *                primero con rehacerDiscrepancia (solo Super Admin).
 *  rechazada   → no toca stock (nada que revertir)
 *  cancelada   → no toca stock (nada que revertir)
 *
 * Compatibilidad legacy (transferencias creadas antes del deploy de Ola 2 que
 * ya descontaron stock al aprobar): la columna `stock_reconciliado` discrimina
 *   · TRUE  → régimen NUEVO. recibir() decrementa origen; rechazar/cancelar no.
 *   · FALSE → régimen LEGACY. recibir() NO decrementa (ya se hizo: lo enviado);
 *             solo suma lo enviado al destino; rechazar/cancelar SÍ revierten
 *             vía _reversarStockAprobada.
 * El script `backend/scripts/fix_stock_transferencias_aprobadas.js` flipa
 * FALSE→TRUE tras re-incrementar el origen, llevando legacy al régimen nuevo.
 */

// Procesa ediciones del aprobador sobre ítems personalizados (cantidad aprobada,
// fuente comprar/obra, nota, rechazar) + ítems nuevos. Sirve para solicitudes
// solo-materiales Y mixtas (catálogo + custom). NO transiciona estado.
async function _aprobarCustomItems(conn, id, data) {
    const edits = Array.isArray(data.items_custom) ? data.items_custom : [];
    const nuevos = Array.isArray(data.items_custom_nuevos) ? data.items_custom_nuevos : [];
    // Sin cambios de custom en el payload → no toca la DB (no agrega queries a la
    // rama de catálogo: mantiene intactos los mocks de los tests catálogo-solo).
    if (!edits.length && !nuevos.length) return;
    const [customRows] = await conn.query('SELECT id FROM transferencia_items_custom WHERE transferencia_id = ?', [id]);
    const validIds = new Set(customRows.map(r => Number(r.id)));
    for (const e of edits) {
        if (!e || !validIds.has(Number(e.id))) continue;
        const aprobadoFlag = e.aprobado === false ? 0 : 1;
        const desc = (e.descripcion != null && String(e.descripcion).trim()) ? String(e.descripcion).trim().slice(0, 500) : null;
        const unidad = e.unidad != null ? (String(e.unidad).slice(0, 50) || null) : null;
        const cantAprob = Number(e.cantidad_aprobada) > 0 ? Number(e.cantidad_aprobada) : null;
        const nota = e.nota_aprobador != null ? (String(e.nota_aprobador).slice(0, 1000) || null) : null;
        const fuente = (e.fuente === 'obra' && Number(e.origen_obra_id) > 0) ? 'obra' : 'comprar';
        const origenObra = fuente === 'obra' ? Number(e.origen_obra_id) : null;
        await conn.query(
            `UPDATE transferencia_items_custom
                SET descripcion = COALESCE(?, descripcion), unidad = ?, cantidad_aprobada = ?,
                    aprobado = ?, nota_aprobador = ?, fuente = ?, origen_obra_id = ?
              WHERE id = ? AND transferencia_id = ?`,
            [desc, unidad, cantAprob, aprobadoFlag, nota, fuente, origenObra, Number(e.id), id]
        );
    }
    for (const n of nuevos) {
        const ndesc = String((n && n.descripcion) || '').trim();
        if (!ndesc) continue;
        const ncant = Number(n.cantidad) > 0 ? Number(n.cantidad) : 1;
        const nfuente = (n.fuente === 'obra' && Number(n.origen_obra_id) > 0) ? 'obra' : 'comprar';
        const norigen = nfuente === 'obra' ? Number(n.origen_obra_id) : null;
        await conn.query(
            `INSERT INTO transferencia_items_custom
               (transferencia_id, descripcion, cantidad, unidad, observacion, cantidad_aprobada, aprobado, agregado_por_aprobador, fuente, origen_obra_id)
             VALUES (?, ?, ?, ?, ?, ?, 1, 1, ?, ?)`,
            [id, ndesc.slice(0, 500), ncant, n.unidad ? String(n.unidad).slice(0, 50) : null, n.observacion ? String(n.observacion) : null, ncant, nfuente, norigen]
        );
    }
    await conn.query(
        `UPDATE transferencia_items_custom SET cantidad_aprobada = cantidad WHERE transferencia_id = ? AND aprobado = 1 AND cantidad_aprobada IS NULL`,
        [id]
    );
}

// Acumula la cantidad recibida de ítems personalizados (multi-viaje). NO mueve stock.
async function _recibirCustomItems(conn, id, itemsCustom) {
    const arr = Array.isArray(itemsCustom) ? itemsCustom : [];
    if (!arr.length) return;
    const [rows] = await conn.query('SELECT id FROM transferencia_items_custom WHERE transferencia_id = ?', [id]);
    const validIds = new Set(rows.map(r => Number(r.id)));
    for (const c of arr) {
        const cid = Number(c && c.transferencia_item_custom_id);
        const cant = Number(c && c.cantidad_recibida);
        if (!validIds.has(cid) || !(cant > 0)) continue;
        await conn.query(
            'UPDATE transferencia_items_custom SET cantidad_recibida = COALESCE(cantidad_recibida, 0) + ? WHERE id = ? AND transferencia_id = ?',
            [cant, cid, id]
        );
    }
}

// Origen "primario" de un ítem: el de transferencia_items (aprobar lo fija con el primer split) y, si
// falta, el de la cabecera. recibir() descuenta ahí lo que los splits no cubren (y todo, si el ítem no
// tiene splits); aprobar/rehacer una diferencia devuelve/descuenta en el mismo lugar → un solo sitio.
function _origenPrimario(itemRow, trf) {
    return _normalizeUbicacion(
        itemRow?.origen_obra_id ?? trf.origen_obra_id,
        itemRow?.origen_bodega_id ?? trf.origen_bodega_id
    );
}

// ── Helpers de las diferencias (discrepancias) de transferencia ──
// Cantidades DECIMAL(12,4): mysql2 las entrega como string → Number + redondeo a 4 decimales
// (evita arrastre de coma flotante en comparaciones y en lo que se escribe).
const _r4 = (n) => Math.round((Number(n) || 0) * 10000) / 10000;
const _fmtCant = (n) => String(_r4(n)).replace('.', ',');
const _ubicKey = (u) => `${u.obra ?? ''}|${u.bodega ?? ''}`;
const _httpError = (msg, statusCode, extra = {}) => Object.assign(new Error(msg), { statusCode, ...extra });
// ¿El error es «columna desconocida» (errno 1054) de alguna de las columnas indicadas? Otro 1054 es un bug real.
const _esFaltaColumna = (err, re) => !!(err && err.errno === 1054 && re.test(String(err.sqlMessage || err.message || '')));
const _migracionPendiente = (num, columna) => _httpError(
    `Falta aplicar la migración ${num} (transferencia_discrepancias.${columna}). Avisa a TI.`,
    409, { code: 'MIGRACION_PENDIENTE' }
);
// Choque con otra transacción sobre las mismas filas (revisión 2026-10-21): deadlock (errno 1213, InnoDB ya deshizo
// la transacción) o espera de lock agotada (1205). Es pasajero, no una regla de negocio → 409 REINTENTAR con un texto
// que se entiende, en vez de un 500 con el mensaje de MySQL. Lo usan resolver, rehacer y los dos borrados.
const _esBloqueoConcurrente = (err) => !!(err && (
    err.errno === 1213 || err.errno === 1205 || err.code === 'ER_LOCK_DEADLOCK' || err.code === 'ER_LOCK_WAIT_TIMEOUT'
));
const MENSAJE_REINTENTAR = 'Otra persona está trabajando en esta solicitud: reintenta en unos segundos';
const _reintentar = () => _httpError(MENSAJE_REINTENTAR, 409, { code: 'REINTENTAR' });
// transferencia_discrepancias.ajuste_stock es TEXT con JSON { ajustes, aviso, rehecha? }; tolera NULL,
// columna ausente y JSON corrupto.
function _parseAjusteStock(raw) {
    if (raw == null || raw === '') return null;
    if (typeof raw === 'object') return raw;
    try { return JSON.parse(raw); } catch (_) { return null; }
}
// ¿El ajuste guardado movió stock (al resolver o al rehacer)?
function _ajusteMovioStock(ajuste) {
    if (!ajuste) return false;
    const con = (a) => Array.isArray(a) && a.length > 0;
    return con(ajuste.ajustes) || con(ajuste.rehecha && ajuste.rehecha.ajustes);
}
// diferencia_aplicada (mig 130, TINYINT(1) → boolean por el typeCast; 0/1 en mocks). SOLO 0/false explícito
// es «regla nueva» (la diferencia NO está en el stock). 1 = regla antigua (recibir() la aplicó al stock);
// NULL no debería existir tras la mig 130 (marca NULL → 1) y se trata como antigua.
function _esReglaNueva(valor) {
    return valor === false || valor === 0 || valor === '0';
}
// «1 unidad» / «N unidades» y «de 1» / «de las N» (los avisos de 1 unidad son lo más común).
const _unid = (n) => `${_fmtCant(n)} ${Number(n) === 1 ? 'unidad' : 'unidades'}`;
const _deLas = (n) => (Number(n) === 1 ? `de ${_fmtCant(n)}` : `de las ${_fmtCant(n)}`);

// Aviso cuando una ubicación no tenía stock para descontar (quedó en 0). Origen: cuántas unidades quedaron sin
// respaldo. Destino (solo al rehacer un sobrante): cuántas no se pudieron quitar.
function _avisoSinStock(sinStock) {
    if (!Array.isArray(sinStock) || !sinStock.length) return null;
    return sinStock.map(s => (s.esDestino
        ? `${s.nombre || 'El destino'} no tenía esas unidades: no se pudieron quitar ${_fmtCant(s.faltan)} ${_deLas(s.pedido)} (quedó en 0). Revisa su stock.`
        : `${s.nombre || 'El origen'} no tenía stock suficiente: ${_fmtCant(s.faltan)} ${_deLas(s.pedido)} ${Number(s.pedido) === 1 ? 'unidad quedó' : 'unidades quedaron'} sin respaldo (quedó en 0). Revisa su stock.`
    )).join(' ');
}
// Aprobar ('resuelta') una pendiente de la regla anterior: lo declarado YA está en el stock → se cierra sin moverlo.
const AVISO_REGLA_ANTERIOR = 'Regla anterior: la diferencia ya estaba aplicada; se cierra sin mover stock';
// Fecha de un DATETIME (mysql2 la entrega como Date en hora local) para los avisos: «dd-mm-aaaa hh:mm».
function _fmtFecha(v) {
    if (v == null || v === '') return '';
    const f = v instanceof Date ? v : new Date(String(v).replace(' ', 'T'));
    if (Number.isNaN(f.getTime())) return String(v);
    const p = (n) => String(n).padStart(2, '0');
    return `${p(f.getDate())}-${p(f.getMonth() + 1)}-${f.getFullYear()} ${p(f.getHours())}:${p(f.getMinutes())}`;
}
// normalizeUbicacion que no lanza (null si no hay obra ni bodega): para listas informativas, no para mover stock.
const _ubicSegura = (obra, bodega) => { try { return _normalizeUbicacion(obra, bodega); } catch (_) { return null; } };
const _ubicDeFila = (r) => ({
    obra: r.obra_id != null ? Number(r.obra_id) : null,
    bodega: r.bodega_id != null ? Number(r.bodega_id) : null,
});
// SELECT de transferencia_discrepancias tolerante a las columnas de las mig 129/130 (sin ellas cae a menos columnas;
// sin la tabla, 1146 → []). `extra` = columnas fijas adicionales; `resto` = WHERE … (FOR UPDATE).
async function _selectDiscrepancias(conn, extra, resto, params) {
    const columnas = [
        `${extra}, estado, ajuste_stock, diferencia_aplicada`,
        `${extra}, estado, ajuste_stock`,
        `${extra}, estado`,
    ];
    for (let i = 0; i < columnas.length; i += 1) {
        try {
            const [rows] = await conn.query(`SELECT ${columnas[i]} FROM transferencia_discrepancias ${resto}`, params);
            return Array.isArray(rows) ? rows : [];
        } catch (err) {
            if (err && err.errno === 1146) return [];
            if (!(err && err.errno === 1054) || i === columnas.length - 1) throw err;
        }
    }
    return [];
}
// ¿Esta fila de discrepancia es una pendiente de la regla anterior (su diferencia ya está en el stock)? Sin la
// columna (mig 130 sin aplicar) no se sabe → no bloquea.
const _pendienteReglaAnterior = (fila) =>
    fila.estado === 'pendiente' && fila.diferencia_aplicada !== undefined && !_esReglaNueva(fila.diferencia_aplicada);

const transferenciaService = {
    /**
     * Helper: SELECT de transferencia con FOR UPDATE para transición de estado.
     * La migración 036 (columna `stock_reconciliado`) ya está aplicada en
     * todos los entornos — desde Sprint 3 de la auditoría se asume su
     * existencia y se eliminó el fallback ER_BAD_FIELD_ERROR.
     */
    async _selectForStatusChange(conn, sqlTemplate, params) {
        const sql = sqlTemplate.replace('{reconcil}', 'stock_reconciliado');
        const [rows] = await conn.query(sql, params);
        return rows[0] || null;
    },

    /**
     * Genera código único TRF-YYYYMM-XXXX
     */
    async _generarCodigo() {
        const now = new Date();
        const prefix = `TRF-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
        const [rows] = await db.query(
            "SELECT codigo FROM transferencias WHERE codigo LIKE ? ORDER BY id DESC LIMIT 1",
            [`${prefix}%`]
        );
        let seq = 1;
        if (rows.length) {
            const last = rows[0].codigo.split('-').pop();
            seq = parseInt(last, 10) + 1;
        }
        return `${prefix}-${String(seq).padStart(4, '0')}`;
    },

    async crear(data, solicitanteId) {
        const {
            destino_obra_id, destino_bodega_id, items, items_custom, observaciones,
            requiere_pionetas, cantidad_pionetas,
            tipo_flujo, motivo,
            origen_obra_id, origen_bodega_id, // para devolución (obra → bodega)
        } = data;
        const itemsArr = Array.isArray(items) ? items : [];
        const customArr = Array.isArray(items_custom) ? items_custom : [];
        if (!itemsArr.length && !customArr.length) {
            throw new Error('Debe incluir al menos un ítem (catálogo o personalizado)');
        }
        // Items custom solo válidos en flujos donde la obra pide cosas a comprar
        // (solicitud estándar y solicitud de materiales). En devolucion/intra_obra
        // no aplica porque ya son items existentes que se trasladan.
        const flujosConItemsCustom = ['solicitud', 'solicitud_materiales'];
        if (customArr.length && tipo_flujo && !flujosConItemsCustom.includes(tipo_flujo)) {
            throw new Error('Items personalizados solo permitidos en flujos de solicitud');
        }
        // Validar shape de items custom
        for (const c of customArr) {
            if (!c.descripcion || typeof c.descripcion !== 'string' || !c.descripcion.trim()) {
                throw new Error('Item personalizado: descripcion requerida');
            }
            const cant = Number(c.cantidad);
            if (!Number.isFinite(cant) || cant < 1) {
                throw new Error('Item personalizado: cantidad debe ser >= 1');
            }
        }
        if (!destino_obra_id && !destino_bodega_id) throw new Error('Debe especificar un destino');
        const flujo = tipo_flujo || 'solicitud';
        const flujosPermitidos = ['solicitud', 'solicitud_materiales', 'devolucion', 'intra_obra', 'intra_bodega'];
        if (!flujosPermitidos.includes(flujo)) {
            throw new Error(`tipo_flujo inválido para crear(): ${flujo}`);
        }
        // Devolución: origen debe ser una obra; destino debe ser una bodega.
        if (flujo === 'devolucion') {
            if (!origen_obra_id) throw new Error('Devolución requiere origen_obra_id');
            if (!destino_bodega_id) throw new Error('Devolución requiere destino_bodega_id');
        }
        // Intra-obra: origen y destino son obras distintas.
        if (flujo === 'intra_obra') {
            if (!origen_obra_id) throw new Error('Intra-obra requiere origen_obra_id');
            if (!destino_obra_id) throw new Error('Intra-obra requiere destino_obra_id');
            if (origen_obra_id === destino_obra_id) {
                throw new Error('Intra-obra: origen y destino deben ser obras distintas');
            }
        }
        // Intra-bodega: origen y destino son bodegas distintas. Antes era un flujo
        // instantáneo aparte (nacía 'recibida'); ahora pasa por el flujo normal con
        // aprobación (decisión jefatura: bodeguero no mueve stock sin visto bueno).
        if (flujo === 'intra_bodega') {
            if (!origen_bodega_id) throw new Error('Intra-bodega requiere origen_bodega_id');
            if (!destino_bodega_id) throw new Error('Intra-bodega requiere destino_bodega_id');
            if (origen_bodega_id === destino_bodega_id) {
                throw new Error('Intra-bodega: origen y destino deben ser bodegas distintas');
            }
        }
        // Stock relevante para validación: por obra (devolucion, intra_obra),
        // por bodega (intra_bodega) o global (solicitud).
        const validarStockPorObra = flujo === 'devolucion' || flujo === 'intra_obra';
        const validarStockPorBodega = flujo === 'intra_bodega';

        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();

            // Validación de stock por ORIGEN FÍSICO: devolución/intra_obra (obra origen) e
            // intra_bodega (bodega origen) no pueden mover más de lo que existe en ese origen.
            // REGLA DE ORO: la SOLICITUD (origen central/global) NO valida stock — se PERMITE
            // SOBRE-PEDIR; el aprobador la abastece (bodegas primero; obras solo él, al aprobar).
            for (const item of itemsArr) {
                if (!validarStockPorObra && !validarStockPorBodega) continue; // solicitud: sobre-pedido permitido
                let disponible;
                let desc;
                if (validarStockPorObra) {
                    const [stockRows] = await conn.query(
                        `SELECT COALESCE(cantidad, 0) as total,
                                (SELECT descripcion FROM items_inventario WHERE id = ?) as descripcion
                         FROM ubicaciones_stock
                         WHERE item_id = ? AND obra_id = ? AND bodega_id IS NULL`,
                        [item.item_id, item.item_id, origen_obra_id]
                    );
                    disponible = stockRows.length ? Number(stockRows[0].total) || 0 : 0;
                    desc = stockRows.length ? stockRows[0].descripcion : `ítem ${item.item_id}`;
                } else {
                    const [stockRows] = await conn.query(
                        `SELECT COALESCE(cantidad, 0) as total,
                                (SELECT descripcion FROM items_inventario WHERE id = ?) as descripcion
                         FROM ubicaciones_stock
                         WHERE item_id = ? AND obra_id IS NULL AND bodega_id = ?`,
                        [item.item_id, item.item_id, origen_bodega_id]
                    );
                    disponible = stockRows.length ? Number(stockRows[0].total) || 0 : 0;
                    desc = stockRows.length ? stockRows[0].descripcion : `ítem ${item.item_id}`;
                }
                const solicitado = Number(item.cantidad) || 0;
                if (solicitado > disponible) {
                    throw new Error(`Stock insuficiente para ${desc}. Disponible: ${disponible}, solicitado: ${solicitado}`);
                }
            }

            const codigo = await this._generarCodigo();

            const [result] = await conn.query(
                `INSERT INTO transferencias
                 (codigo, origen_obra_id, origen_bodega_id, destino_obra_id, destino_bodega_id,
                  solicitante_id, observaciones, requiere_pionetas, cantidad_pionetas,
                  tipo_flujo, motivo, creado_por)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    codigo,
                    // origen_obra_id: flujos por obra (devolucion, intra_obra) o solicitud con obra.
                    //   intra_bodega nunca tiene obra origen.
                    validarStockPorBodega ? null : (validarStockPorObra ? origen_obra_id : (origen_obra_id || null)),
                    // origen_bodega_id: intra_bodega (siempre) o solicitud con bodega.
                    //   devolucion/intra_obra nunca tienen bodega origen.
                    validarStockPorBodega ? origen_bodega_id : (validarStockPorObra ? null : (origen_bodega_id || null)),
                    destino_obra_id || null,
                    destino_bodega_id || null,
                    solicitanteId,
                    observaciones || null,
                    requiere_pionetas || false,
                    cantidad_pionetas || null,
                    flujo,
                    motivo || null,
                    solicitanteId, // audit creado_por
                ]
            );
            const trfId = result.insertId;

            // Auditoría perf: batch INSERT en vez de loop async (N round-trips → 1).
            // Antes: 20 ítems = 20 queries serializadas dentro de transacción.
            if (itemsArr.length > 0) {
                const placeholders = itemsArr.map(() => '(?, ?, ?)').join(', ');
                const values = itemsArr.flatMap(item => [trfId, item.item_id, item.cantidad]);
                await conn.query(
                    `INSERT INTO transferencia_items (transferencia_id, item_id, cantidad_solicitada) VALUES ${placeholders}`,
                    values
                );
            }

            // Items personalizados (no en catálogo) — los lee el aprobador para tramitar compra.
            for (const c of customArr) {
                await conn.query(
                    `INSERT INTO transferencia_items_custom
                     (transferencia_id, descripcion, cantidad, unidad, observacion)
                     VALUES (?, ?, ?, ?, ?)`,
                    [
                        trfId,
                        String(c.descripcion).trim().slice(0, 500),
                        Number(c.cantidad),
                        c.unidad ? String(c.unidad).slice(0, 50) : null,
                        c.observacion ? String(c.observacion) : null,
                    ]
                );
            }

            await conn.commit();
            return { id: trfId, codigo };
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }
    },

    /**
     * Helper: revierte stock al origen cuando una transferencia 'aprobada' se
     * rechaza o cancela. Lee splits desde transferencia_item_origenes (fuente de
     * verdad multi-origen). Si el ítem no tiene splits (transferencias aprobadas
     * antes de la migración 032), usa el origen de transferencia_items como
     * fallback — mismo comportamiento legacy.
     */
    async _reversarStockAprobada(conn, transferenciaId, trf) {
        const [items] = await conn.query(
            `SELECT id, item_id, cantidad_enviada, origen_obra_id, origen_bodega_id
             FROM transferencia_items WHERE transferencia_id = ?`,
            [transferenciaId]
        );
        for (const item of items) {
            const [splits] = await conn.query(
                `SELECT origen_obra_id, origen_bodega_id, cantidad_enviada
                 FROM transferencia_item_origenes WHERE transferencia_item_id = ?`,
                [item.id]
            );

            if (splits.length > 0) {
                for (const s of splits) {
                    if (s.cantidad_enviada > 0) {
                        const ubic = _normalizeUbicacion(s.origen_obra_id, s.origen_bodega_id);
                        await conn.query(
                            `INSERT INTO ubicaciones_stock (item_id, obra_id, bodega_id, cantidad)
                             VALUES (?, ?, ?, ?)
                             ON DUPLICATE KEY UPDATE cantidad = cantidad + VALUES(cantidad)`,
                            [item.item_id, ubic.obra, ubic.bodega, s.cantidad_enviada]
                        );
                    }
                }
            } else {
                // Fallback legacy: usa origen de transferencia_items (transfers pre-032).
                const cantidad = item.cantidad_enviada || 0;
                if (cantidad > 0) {
                    const obraId = item.origen_obra_id ?? trf.origen_obra_id;
                    const bodegaId = item.origen_bodega_id ?? trf.origen_bodega_id;
                    const ubic = _normalizeUbicacion(obraId, bodegaId);
                    await conn.query(
                        `INSERT INTO ubicaciones_stock (item_id, obra_id, bodega_id, cantidad)
                         VALUES (?, ?, ?, ?)
                         ON DUPLICATE KEY UPDATE cantidad = cantidad + VALUES(cantidad)`,
                        [item.item_id, ubic.obra, ubic.bodega, cantidad]
                    );
                }
            }
        }
    },

    /**
     * Aprueba la transferencia.
     *
     * Acepta DOS shapes de payload (backward-compatible):
     *
     *   A) Legacy (1 origen por ítem):
     *      { items: [{ item_id, cantidad_enviada, origen_obra_id, origen_bodega_id }] }
     *
     *   B) Multi-origen (N splits por ítem):
     *      { items: [{ item_id, splits: [{ origen_obra_id, origen_bodega_id, cantidad }] }] }
     *
     * En ambos casos:
     *   - Permite enviar MENOS que lo solicitado (aprobación parcial).
     *   - Valida que el stock exista en cada origen (previene errores obvios),
     *     pero NO decrementa stock. El decremento ocurre al recibir.
     *   - Persiste filas en transferencia_item_origenes (1 por split).
     *   - transferencia_items.cantidad_enviada queda como SUMA de splits (denormalizado).
     *   - transferencia_items.origen_obra_id/bodega_id apuntan al split primario (primer
     *     split con cantidad > 0) — mantiene compat con rechazar() y reportes legacy.
     *
     *   Nota Ola 2: dos aprobaciones pueden comprometer el mismo stock físico
     *   (validación no reserva). La segunda recepción lo notará como discrepancia.
     */
    async aprobar(id, aprobadorId, data, userPermisos) {
        const items = (data && data.items) || [];

        const defaultObraId = data.origen_obra_id || null;
        const defaultBodegaId = data.origen_bodega_id || null;

        // Normalizar payload a forma canónica: cada ítem con un array `splits`.
        // Shape legacy (cantidad_enviada + origen_*) se convierte en un solo split.
        const canonicales = items.map(item => {
            if (Array.isArray(item.splits)) {
                const splits = item.splits
                    .map(s => ({
                        obraId: s.origen_obra_id ?? null,
                        bodegaId: s.origen_bodega_id ?? null,
                        cantidad: parseFloat(s.cantidad) || 0,
                    }))
                    .filter(s => s.cantidad > 0);
                return { item_id: item.item_id, splits };
            }
            // Legacy shape
            const enviada = parseFloat(item.cantidad_enviada) || 0;
            if (enviada <= 0) return { item_id: item.item_id, splits: [] };
            return {
                item_id: item.item_id,
                splits: [{
                    obraId: item.origen_obra_id ?? defaultObraId ?? null,
                    bodegaId: item.origen_bodega_id ?? defaultBodegaId ?? null,
                    cantidad: enviada,
                }],
            };
        });

        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();

            // FOR UPDATE: lock pesimista contra race condition de doble aprobación
            const [trf] = await conn.query('SELECT estado, solicitante_id FROM transferencias WHERE id = ? FOR UPDATE', [id]);
            if (!trf.length || trf[0].estado !== 'pendiente') throw new Error('Transferencia no está pendiente');

            // SoD: el aprobador no puede ser el solicitante.
            // sod_bypass es para casos excepcionales (obra unipersonal, emergencias);
            // queda registrado en logs_actividad para auditoría.
            if (trf[0].solicitante_id != null && trf[0].solicitante_id === aprobadorId && !_hasBypass(userPermisos)) {
                throw _sodError('SoD violation: no puedes aprobar transferencias que tú mismo solicitaste. Otro usuario con permiso "Aprobar Transferencia" debe hacerlo.');
            }

            const [dbItems] = await conn.query(
                'SELECT id, item_id, cantidad_solicitada FROM transferencia_items WHERE transferencia_id = ?',
                [id]
            );

            // ── Early branch: transferencia sin items de catálogo ──
            // Caso típico: solicitud_materiales (sólo items_custom, materiales a comprar).
            // No hay stock que reservar ni splits que crear — sólo transición de estado.
            if (dbItems.length === 0) {
                const [customRows] = await conn.query(
                    'SELECT id FROM transferencia_items_custom WHERE transferencia_id = ?',
                    [id]
                );
                if (customRows.length === 0) {
                    throw new Error('La transferencia no tiene items para aprobar');
                }
                const validIds = new Set(customRows.map(r => Number(r.id)));
                const edits = Array.isArray(data.items_custom) ? data.items_custom : [];
                const nuevos = Array.isArray(data.items_custom_nuevos) ? data.items_custom_nuevos : [];

                // Ediciones del aprobador sobre ítems existentes: cantidad aprobada,
                // descripción/unidad corregidas, nota, o quitar/rechazar (aprobado=false).
                for (const e of edits) {
                    if (!e || !validIds.has(Number(e.id))) continue;
                    const aprobadoFlag = e.aprobado === false ? 0 : 1;
                    const desc = (e.descripcion != null && String(e.descripcion).trim())
                        ? String(e.descripcion).trim().slice(0, 500) : null; // null → COALESCE conserva la actual
                    const unidad = e.unidad != null ? (String(e.unidad).slice(0, 50) || null) : null;
                    const cantAprob = Number(e.cantidad_aprobada) > 0 ? Number(e.cantidad_aprobada) : null;
                    const nota = e.nota_aprobador != null ? (String(e.nota_aprobador).slice(0, 1000) || null) : null;
                    // Origen: 'obra' solo si viene explícito + obra válida; si no, 'comprar'.
                    const fuente = (e.fuente === 'obra' && Number(e.origen_obra_id) > 0) ? 'obra' : 'comprar';
                    const origenObra = fuente === 'obra' ? Number(e.origen_obra_id) : null;
                    await conn.query(
                        `UPDATE transferencia_items_custom
                            SET descripcion = COALESCE(?, descripcion),
                                unidad = ?,
                                cantidad_aprobada = ?,
                                aprobado = ?,
                                nota_aprobador = ?,
                                fuente = ?,
                                origen_obra_id = ?
                          WHERE id = ? AND transferencia_id = ?`,
                        [desc, unidad, cantAprob, aprobadoFlag, nota, fuente, origenObra, Number(e.id), id]
                    );
                }

                // Ítems que agregó el aprobador (no los pidió la obra).
                for (const n of nuevos) {
                    const ndesc = String((n && n.descripcion) || '').trim();
                    if (!ndesc) continue;
                    const ncant = Number(n.cantidad) > 0 ? Number(n.cantidad) : 1;
                    const nfuente = (n.fuente === 'obra' && Number(n.origen_obra_id) > 0) ? 'obra' : 'comprar';
                    const norigen = nfuente === 'obra' ? Number(n.origen_obra_id) : null;
                    await conn.query(
                        `INSERT INTO transferencia_items_custom
                           (transferencia_id, descripcion, cantidad, unidad, observacion,
                            cantidad_aprobada, aprobado, agregado_por_aprobador, fuente, origen_obra_id)
                         VALUES (?, ?, ?, ?, ?, ?, 1, 1, ?, ?)`,
                        [
                            id, ndesc.slice(0, 500), ncant,
                            n.unidad ? String(n.unidad).slice(0, 50) : null,
                            n.observacion ? String(n.observacion) : null, ncant,
                            nfuente, norigen,
                        ]
                    );
                }

                // Default: ítems aprobados sin cantidad_aprobada explícita heredan la solicitada.
                await conn.query(
                    `UPDATE transferencia_items_custom
                        SET cantidad_aprobada = cantidad
                      WHERE transferencia_id = ? AND aprobado = 1 AND cantidad_aprobada IS NULL`,
                    [id]
                );

                // Debe quedar ≥1 ítem aprobado; si quitó todos, el flujo correcto es Rechazar.
                const [aprobCnt] = await conn.query(
                    'SELECT COUNT(*) AS c FROM transferencia_items_custom WHERE transferencia_id = ? AND aprobado = 1',
                    [id]
                );
                if (Number(aprobCnt[0].c) === 0) {
                    throw new Error('No queda ningún ítem aprobado. Si no se comprará nada, usa Rechazar.');
                }

                await conn.query(
                    `UPDATE transferencias
                     SET estado = 'aprobada', aprobador_id = ?, aprobado_por = ?, fecha_aprobacion = NOW()
                     WHERE id = ?`,
                    [aprobadorId, aprobadorId, id]
                );
                await conn.commit();
                return { id, estado: 'aprobada' };
            }

            // ── Caso normal: requiere items en payload ──
            if (!items.length) throw new Error('Debe incluir ítems');
            const itemInfo = {}; // item_id → { id, cantidad_solicitada }
            dbItems.forEach(r => { itemInfo[r.item_id] = { id: r.id, cantidad_solicitada: r.cantidad_solicitada }; });

            // Agregar totales por item_id (consolidar si llegan varias filas para un mismo ítem)
            const totalByItem = {};
            for (const c of canonicales) {
                if (!(c.item_id in itemInfo)) {
                    throw new Error(`Ítem ${c.item_id} no pertenece a esta transferencia`);
                }
                for (const s of c.splits) {
                    if (s.cantidad < 0) throw new Error(`Cantidad inválida para ítem ${c.item_id}`);
                    if (!s.obraId && !s.bodegaId) {
                        throw new Error(`Ítem ${c.item_id}: cada split debe especificar origen (obra o bodega)`);
                    }
                }
                const total = c.splits.reduce((a, s) => a + s.cantidad, 0);
                totalByItem[c.item_id] = (totalByItem[c.item_id] || 0) + total;
            }

            // Validar suma de splits ≤ cantidad_solicitada por ítem
            for (const [itemId, total] of Object.entries(totalByItem)) {
                const solicitada = itemInfo[itemId].cantidad_solicitada;
                if (total > solicitada) {
                    throw new Error(`Ítem ${itemId}: suma de splits (${total}) excede lo solicitado (${solicitada})`);
                }
            }

            // Validar stock por origen + lock pesimista para evitar race condition.
            // Auditoría 6.5: antes era un SELECT sin lock, y dos aprobaciones
            // concurrentes del mismo ítem desde la misma obra pasaban ambas
            // validación → decrementaban origen dos veces. Ahora SELECT ... FOR UPDATE
            // dentro de la transacción ya abierta serializa las aprobaciones que
            // tocan la misma fila de stock.
            for (const c of canonicales) {
                for (const s of c.splits) {
                    const [stock] = await conn.query(
                        'SELECT cantidad FROM ubicaciones_stock WHERE item_id = ? AND obra_id <=> ? AND bodega_id <=> ? FOR UPDATE',
                        [c.item_id, s.obraId, s.bodegaId]
                    );
                    const disponible = stock.length ? stock[0].cantidad : 0;
                    if (s.cantidad > disponible) {
                        throw new Error(`Stock insuficiente para ítem ${c.item_id} en el origen indicado. Disponible: ${disponible}, requerido: ${s.cantidad}`);
                    }
                }
            }

            // Origen "principal" (cabecera): primer split con cantidad > 0 del primer ítem.
            let primario = null;
            for (const c of canonicales) {
                const firstSplit = c.splits.find(s => s.cantidad > 0);
                if (firstSplit) { primario = firstSplit; break; }
            }

            await conn.query(
                `UPDATE transferencias SET estado = 'aprobada', aprobador_id = ?, aprobado_por = ?, origen_obra_id = ?, origen_bodega_id = ?, fecha_aprobacion = NOW() WHERE id = ?`,
                [aprobadorId, aprobadorId, primario?.obraId || null, primario?.bodegaId || null, id]
            );

            // Actualizar cada transferencia_item + persistir splits.
            // Auditoría perf: acumular splits en un solo INSERT batch al final
            // (antes era 1 INSERT por split dentro del loop anidado).
            const origenRows = [];
            for (const c of canonicales) {
                const info = itemInfo[c.item_id];
                const total = c.splits.reduce((a, s) => a + s.cantidad, 0);
                const primarioItem = c.splits.find(s => s.cantidad > 0);

                await conn.query(
                    `UPDATE transferencia_items
                     SET cantidad_enviada = ?, origen_obra_id = ?, origen_bodega_id = ?
                     WHERE id = ?`,
                    [total, primarioItem?.obraId || null, primarioItem?.bodegaId || null, info.id]
                );

                // Limpiar splits previos (idempotencia: re-aprobación no duplica filas)
                await conn.query(
                    'DELETE FROM transferencia_item_origenes WHERE transferencia_item_id = ?',
                    [info.id]
                );

                for (const s of c.splits) {
                    origenRows.push([info.id, s.obraId, s.bodegaId, s.cantidad]);
                }
            }

            // Batch INSERT de todos los splits acumulados. Ola 2: no se decrementa
            // stock acá — el decremento ocurre al recibir.
            if (origenRows.length > 0) {
                const placeholders = origenRows.map(() => '(?, ?, ?, ?)').join(', ');
                const values = origenRows.flatMap(r => r);
                await conn.query(
                    `INSERT INTO transferencia_item_origenes
                     (transferencia_item_id, origen_obra_id, origen_bodega_id, cantidad_enviada)
                     VALUES ${placeholders}`,
                    values
                );
            }

            // Solicitud MIXTA: procesar también los ítems personalizados (fuente,
            // cantidad aprobada, nota, nuevos). No-op si la transferencia no tiene custom.
            await _aprobarCustomItems(conn, id, data);

            await conn.commit();
            return { id, estado: 'aprobada' };
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }
    },

    /**
     * Auto-crea una nueva solicitud por el "faltante" tras una aprobación parcial.
     * - Lee la transferencia original (destino, solicitante, items originales).
     * - Calcula el faltante por ítem: cantidad_solicitada - cantidad_enviada (de items).
     * - Crea una nueva transferencia en estado 'pendiente' apuntando con es_faltante_de_id.
     * - Retorna el id/código de la nueva solicitud.
     * - Se usa normalmente DESPUÉS de aprobar() con cantidades parciales.
     */
    async crearFaltante(transferenciaOriginalId, solicitanteId) {
        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();

            const [[origRow]] = await conn.query(
                'SELECT destino_obra_id, destino_bodega_id FROM transferencias WHERE id = ? FOR UPDATE',
                [transferenciaOriginalId]
            );
            if (!origRow) throw new Error('Transferencia original no encontrada');

            // Idempotencia: si ya existe una solicitud de faltante para esta
            // original (doble click / doble submit con red lenta), devolver la
            // existente en vez de crear duplicados. El FOR UPDATE sobre la fila
            // original serializa llamadas concurrentes: la segunda espera, luego
            // encuentra acá el faltante que creó la primera y lo retorna.
            const [[faltanteExistente]] = await conn.query(
                'SELECT id, codigo FROM transferencias WHERE es_faltante_de_id = ? AND activo = 1 ORDER BY id ASC LIMIT 1',
                [transferenciaOriginalId]
            );
            if (faltanteExistente) {
                await conn.commit();
                return { id: faltanteExistente.id, codigo: faltanteExistente.codigo, ya_existia: true };
            }

            const [origItems] = await conn.query(
                `SELECT item_id, cantidad_solicitada, COALESCE(cantidad_enviada, 0) AS cantidad_enviada
                 FROM transferencia_items WHERE transferencia_id = ?`,
                [transferenciaOriginalId]
            );

            const faltantes = origItems
                .map(i => ({
                    item_id: i.item_id,
                    cantidad: Math.max(0, i.cantidad_solicitada - i.cantidad_enviada),
                }))
                .filter(i => i.cantidad > 0);

            if (!faltantes.length) {
                await conn.rollback();
                return null; // No hay faltante, no se crea nada
            }

            const codigo = await this._generarCodigo();

            const [result] = await conn.query(
                `INSERT INTO transferencias
                 (codigo, destino_obra_id, destino_bodega_id, solicitante_id, observaciones, es_faltante_de_id, creado_por)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    codigo,
                    origRow.destino_obra_id,
                    origRow.destino_bodega_id,
                    solicitanteId,
                    `Faltante de transferencia #${transferenciaOriginalId} (auto-generada)`,
                    transferenciaOriginalId,
                    solicitanteId, // audit creado_por
                ]
            );
            const newId = result.insertId;

            for (const f of faltantes) {
                await conn.query(
                    `INSERT INTO transferencia_items (transferencia_id, item_id, cantidad_solicitada)
                     VALUES (?, ?, ?)`,
                    [newId, f.item_id, f.cantidad]
                );
            }

            await conn.commit();
            return { id: newId, codigo, items: faltantes.length };
        } catch (err) {
            try { await conn.rollback(); } catch { /* ignore */ }
            throw err;
        } finally {
            conn.release();
        }
    },

    /**
     * Cambia el estado a en_transito. No mueve stock (ya se movió al aprobar).
     */
    async despachar(id, transportistaId, userPermisos) {
        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();

            const [trf] = await conn.query('SELECT estado, aprobador_id FROM transferencias WHERE id = ? FOR UPDATE', [id]);
            if (!trf.length || trf[0].estado !== 'aprobada') throw new Error('Transferencia no está aprobada');

            // SoD: el transportista (quien despacha) no puede ser el aprobador.
            if (trf[0].aprobador_id != null && trf[0].aprobador_id === transportistaId && !_hasBypass(userPermisos)) {
                throw _sodError('SoD violation: no puedes despachar transferencias que tú mismo aprobaste. Otro usuario con permiso "Despachar Transferencia" debe hacerlo.');
            }

            await conn.query(
                "UPDATE transferencias SET estado = 'en_transito', transportista_id = ?, despachado_por = ?, fecha_despacho = NOW() WHERE id = ?",
                [transportistaId, transportistaId, id]
            );

            await conn.commit();
            return { id, estado: 'en_transito' };
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }
    },

    /**
     * Recepción: stock sube al destino y baja del origen (régimen nuevo) SOLO por lo ENVIADO.
     * Soporta DOS modos via parámetro `tipo`:
     *   · 'total'    → cierra la TRF (estado 'recibida'). Gaps acumulados vs
     *                  cantidad_enviada generan discrepancias automáticamente.
     *                  Comportamiento por defecto (back-compat con clientes
     *                  que no envían `tipo`).
     *   · 'parcial'  → registra lo que llegó en ESTE viaje y deja la TRF en
     *                  estado 'recepcion_parcial'. Permite múltiples eventos
     *                  hasta que el receptor cierre con 'total'. No genera
     *                  discrepancia. Bloquea over-receive (cumulative > enviada).
     *
     * Stock por evento (regla del dueño 2026-10-21): por ítem, lo movido hasta ahora es
     * min(declarado acumulado, enviada). Un 'parcial' lo lleva a min(declarado nuevo, enviada)
     * (= lo de este viaje, por el tope de over-receive); el 'total' que cierra lo lleva a la
     * enviada completa, aunque se declare de más o de menos. Se mueve delta = después − antes.
     * Así la recepción nunca crea stock sin respaldo: lo declarado de más/menos queda como
     * discrepancia PENDIENTE (diferencia_aplicada = 0) y solo mueve stock si se APRUEBA
     * (resolverDiscrepancia). Para origen, FIFO por split via columna
     * transferencia_item_origenes.cantidad_decrementada (migración 048).
     *
     * Régimen legacy (stock_reconciliado = FALSE): el origen ya se descontó
     * al aprobar la TRF completa (lo enviado). Solo se incrementa destino (por delta).
     * La auditoría y los eventos se registran igual.
     *
     * cantidad_recibida en transferencia_items ACUMULA lo DECLARADO (no sobreescribe) entre
     * eventos. La cifra final = SUM de todos los eventos. transferencia_recepcion_items guarda
     * lo declarado en cada evento.
     *
     * SoD: el receptor no puede ser el transportista. Caso aprobada→recibida
     * directa (sin despacho intermedio): tampoco el aprobador. Se valida en
     * CADA evento.
     */
    async recibir(id, receptorId, items, userPermisos, tipo = 'total', observacion = null, itemsCustom = [], userBodegaId = null) {
        // items vacío es válido en transferencias de sólo items_custom (ej. solicitud_materiales).
        // Se valida después: si hay items de catálogo en BD, exigimos items en el payload.
        items = Array.isArray(items) ? items : [];
        if (tipo !== 'parcial' && tipo !== 'total') {
            throw new Error('tipo debe ser "parcial" o "total"');
        }

        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();

            const [trfRows] = await conn.query('SELECT * FROM transferencias WHERE id = ? FOR UPDATE', [id]);
            if (!trfRows.length) throw new Error('Transferencia no encontrada');
            const trf = trfRows[0];
            if (!['en_transito', 'aprobada', 'recepcion_parcial'].includes(trf.estado)) {
                throw new Error('Transferencia no puede ser recibida');
            }

            // Bodeguero (usuarios.bodega_id, mig 097): solo puede recepcionar
            // transferencias DESTINADAS a su bodega. Usuarios sin bodega = sin cambio.
            if (userBodegaId != null && trf.destino_bodega_id !== userBodegaId) {
                throw Object.assign(new Error('Solo puedes recepcionar transferencias destinadas a tu bodega.'), { statusCode: 403 });
            }

            // SoD: el receptor no puede ser el transportista (quien despachó).
            // Caso aprobada→recibida directa (sin estado en_tránsito intermedio):
            // tampoco puede ser el aprobador (transportista_id está null).
            if (trf.transportista_id != null && trf.transportista_id === receptorId && !_hasBypass(userPermisos)) {
                throw _sodError('SoD violation: no puedes recibir transferencias que tú mismo despachaste. Otro usuario con permiso "Recibir Transferencia" debe hacerlo.');
            }
            if (trf.estado === 'aprobada' && trf.transportista_id == null && trf.aprobador_id != null
                && trf.aprobador_id === receptorId && !_hasBypass(userPermisos)) {
                throw _sodError('SoD violation: no puedes recibir transferencias que tú mismo aprobaste (sin paso por despacho). Otro usuario debe recibirla.');
            }

            // Régimen nuevo: decrementar origen según splits. Si la columna es
            // FALSE, legacy / ya descontado al aprobar.
            const regimenNuevo = trf.stock_reconciliado !== 0 && trf.stock_reconciliado !== false;

            // Fetch cantidades enviadas + cantidad_recibida acumulada desde BD
            const [dbItems] = await conn.query(
                'SELECT id, item_id, cantidad_enviada, cantidad_recibida, origen_obra_id, origen_bodega_id FROM transferencia_items WHERE transferencia_id = ?',
                [id]
            );

            // ── Early branch: transferencia sin items de catálogo ──
            // Caso típico: solicitud_materiales (sólo items_custom). No hay stock
            // que decrementar/incrementar — sólo transición de estado a 'recibida'.
            if (dbItems.length === 0) {
                const [customCnt] = await conn.query(
                    'SELECT COUNT(*) AS c FROM transferencia_items_custom WHERE transferencia_id = ?',
                    [id]
                );
                if (Number(customCnt[0].c) === 0) {
                    throw new Error('La transferencia no tiene items para recibir');
                }
                // Audit: registrar evento de recepción. observacion = nota libre del
                // receptor (ej. "llegaron 10, se usaron 6, sobran 4 tarros").
                // Soporta entrega en MÚLTIPLES VIAJES: tipo='parcial' deja la
                // solicitud abierta (recepcion_parcial) y registra el viaje con su
                // receptor; tipo='total' cierra la solicitud.
                const obs = observacion ? String(observacion).slice(0, 2000) : null;
                const [recRes] = await conn.query(
                    `INSERT INTO transferencia_recepciones (transferencia_id, receptor_id, tipo, observacion)
                     VALUES (?, ?, ?, ?)`,
                    [id, receptorId, tipo, obs]
                );
                await _recibirCustomItems(conn, id, itemsCustom);
                if (tipo === 'parcial') {
                    // No fija receptor/fecha final — eso lo hace el cierre 'total'.
                    await conn.query(
                        "UPDATE transferencias SET estado = 'recepcion_parcial' WHERE id = ?",
                        [id]
                    );
                    await conn.commit();
                    return { id, estado: 'recepcion_parcial', recepcion_id: recRes.insertId };
                }
                await conn.query(
                    "UPDATE transferencias SET estado = 'recibida', receptor_id = ?, recibido_por = ?, fecha_recepcion = NOW() WHERE id = ?",
                    [receptorId, receptorId, id]
                );
                await conn.commit();
                return { id, estado: 'recibida', recepcion_id: recRes.insertId };
            }

            // ── Caso normal: requiere items en payload ──
            if (!items.length) throw new Error('Debe incluir ítems');

            const enviadaMap = {};
            const acumuladoMap = {};
            const trfItemIdMap = {};
            const itemRowMap = {};
            dbItems.forEach(r => {
                // mysql2 devuelve DECIMAL como string ('10.0000'); normalizar a número.
                // Sin esto, el guard de discrepancia (totalRecibidoFinal !== enviadaMap)
                // compara number vs string y SIEMPRE da true → crea discrepancias
                // fantasma con diferencia 0 aunque las cantidades cuadren.
                enviadaMap[r.item_id] = Number(r.cantidad_enviada) || 0;
                acumuladoMap[r.item_id] = Number(r.cantidad_recibida) || 0;
                trfItemIdMap[r.item_id] = r.id;
                itemRowMap[r.item_id] = r;
            });

            // Validación parcial: cumulative recibida (acumulado + este viaje)
            // no puede exceder cantidad_enviada. Para over-receive usar tipo='total'.
            // `proyectadoMap` corre por entrada: un item_id repetido en el payload suma.
            if (tipo === 'parcial') {
                const proyectadoMap = { ...acumuladoMap };
                for (const item of items) {
                    if (!(item.item_id in enviadaMap)) {
                        throw new Error(`Ítem ${item.item_id} no pertenece a esta transferencia`);
                    }
                    const recibidaEnEvento = parseFloat(item.cantidad_recibida) || 0;
                    if (recibidaEnEvento < 0) {
                        throw new Error(`Cantidad recibida inválida para ítem ${item.item_id}`);
                    }
                    const proyectado = _r4(proyectadoMap[item.item_id] + recibidaEnEvento);
                    proyectadoMap[item.item_id] = proyectado;
                    if (proyectado > enviadaMap[item.item_id]) {
                        const err = new Error(
                            `Recepción parcial no puede exceder cantidad enviada (ítem ${item.item_id}: ` +
                            `acumulado ${acumuladoMap[item.item_id]} + este viaje ${recibidaEnEvento} > enviada ${enviadaMap[item.item_id]}). ` +
                            `Usa "Recepción Total" para cerrar con discrepancia.`
                        );
                        err.statusCode = 400;
                        throw err;
                    }
                }
            }

            // Insertar cabecera del evento de recepción (audit)
            const [recepHeader] = await conn.query(
                `INSERT INTO transferencia_recepciones (transferencia_id, receptor_id, tipo, observacion)
                 VALUES (?, ?, ?, ?)`,
                [id, receptorId, tipo, null]
            );
            const recepcionId = recepHeader.insertId;

            // Kardex (Fase 13): helpers para registrar movimientos sin alterar los
            // UPDATE/INSERT de stock existentes (enfoque aditivo). Leen la cantidad
            // previa, dejan correr el statement original y registran el delta.
            const _selCant = async (itemId, obra, bodega) => {
                const [rows] = await conn.query(
                    'SELECT cantidad FROM ubicaciones_stock WHERE item_id = ? AND obra_id <=> ? AND bodega_id <=> ?',
                    [itemId, obra, bodega]
                );
                return rows.length ? Number(rows[0].cantidad) || 0 : 0;
            };
            const _logMov = async (itemId, obra, bodega, tipoMov, prev, nueva) => {
                await registrarMovimiento(conn, {
                    item_id: itemId, obra_id: obra, bodega_id: bodega,
                    tipo: tipoMov, cantidad_anterior: prev, cantidad_nueva: nueva,
                    referencia_tipo: 'transferencia', referencia_id: id,
                    usuario_id: receptorId,
                });
            };

            // Regla del dueño 2026-10-21: el stock se mueve SOLO por lo ENVIADO, nunca por lo
            // declarado de más o de menos. Por ítem, lo movido hasta ahora es
            // min(declarado acumulado, enviada); un evento 'parcial' lo lleva a
            // min(declarado nuevo, enviada) y el 'total' que cierra, a la enviada completa.
            // Este evento mueve delta = después − antes. La diferencia declarada queda PENDIENTE
            // en transferencia_discrepancias (diferencia_aplicada = 0) hasta que se apruebe o rechace.
            // `movidoMap`/`acumuladoMap` corren por entrada: un item_id repetido en el payload no
            // mueve dos veces lo mismo, y su discrepancia se registra una vez (en su última entrada).
            const movidoMap = {};
            Object.keys(enviadaMap).forEach(k => { movidoMap[k] = Math.min(acumuladoMap[k], enviadaMap[k]); });
            const ultimaEntrada = {};
            items.forEach((it, idx) => { ultimaEntrada[it.item_id] = idx; });

            // Procesar cada item del evento
            for (const [idx, item] of items.entries()) {
                if (!(item.item_id in enviadaMap)) {
                    throw new Error(`Ítem ${item.item_id} no pertenece a esta transferencia`);
                }
                const recibidaEnEvento = parseFloat(item.cantidad_recibida) || 0;
                if (recibidaEnEvento < 0) {
                    throw new Error(`Cantidad recibida inválida para ítem ${item.item_id}`);
                }
                const enviada = enviadaMap[item.item_id];
                const declaradoDespues = _r4(acumuladoMap[item.item_id] + recibidaEnEvento);
                const movidoAntes = movidoMap[item.item_id];
                const movidoDespues = tipo === 'total' ? enviada : Math.min(declaradoDespues, enviada);
                const delta = _r4(Math.max(0, movidoDespues - movidoAntes));
                movidoMap[item.item_id] = Math.max(movidoAntes, movidoDespues);
                acumuladoMap[item.item_id] = declaradoDespues;

                // Decremento de origen (solo régimen nuevo) por lo MOVIDO: FIFO por split via
                // cantidad_decrementada. En parciales sucesivos, el split que no
                // tiene saldo se salta y se consume del siguiente.
                if (regimenNuevo && delta > 0) {
                    let amountRemaining = delta;
                    const trfItemId = trfItemIdMap[item.item_id];
                    const [splits] = await conn.query(
                        `SELECT id, origen_obra_id, origen_bodega_id, cantidad_enviada, cantidad_decrementada
                         FROM transferencia_item_origenes
                         WHERE transferencia_item_id = ?
                         ORDER BY id ASC FOR UPDATE`,
                        [trfItemId]
                    );
                    if (splits.length > 0) {
                        for (const s of splits) {
                            if (amountRemaining <= 0) break;
                            const splitDisponible = (s.cantidad_enviada || 0) - (s.cantidad_decrementada || 0);
                            if (splitDisponible <= 0) continue;
                            const take = Math.min(amountRemaining, splitDisponible);
                            const ubicSplit = _normalizeUbicacion(s.origen_obra_id, s.origen_bodega_id);
                            const prevSplit = await _selCant(item.item_id, ubicSplit.obra, ubicSplit.bodega);
                            await conn.query(
                                `UPDATE ubicaciones_stock SET cantidad = GREATEST(cantidad - ?, 0)
                                 WHERE item_id = ? AND obra_id <=> ? AND bodega_id <=> ?`,
                                [take, item.item_id, ubicSplit.obra, ubicSplit.bodega]
                            );
                            await _logMov(item.item_id, ubicSplit.obra, ubicSplit.bodega,
                                'transferencia_salida', prevSplit, Math.max(prevSplit - take, 0));
                            await conn.query(
                                'UPDATE transferencia_item_origenes SET cantidad_decrementada = cantidad_decrementada + ? WHERE id = ?',
                                [take, s.id]
                            );
                            amountRemaining -= take;
                        }
                        // Defensa: con datos consistentes los splits suman la enviada y lo movido
                        // nunca la supera, así que no sobra nada. Si los splits no alcanzan
                        // (datos antiguos o splits incompletos), el resto sale del origen primario.
                        if (amountRemaining > 0) {
                            const ubicFb = _origenPrimario(itemRowMap[item.item_id], trf);
                            const prevFb = await _selCant(item.item_id, ubicFb.obra, ubicFb.bodega);
                            await conn.query(
                                `UPDATE ubicaciones_stock SET cantidad = GREATEST(cantidad - ?, 0)
                                 WHERE item_id = ? AND obra_id <=> ? AND bodega_id <=> ?`,
                                [amountRemaining, item.item_id, ubicFb.obra, ubicFb.bodega]
                            );
                            await _logMov(item.item_id, ubicFb.obra, ubicFb.bodega,
                                'transferencia_salida', prevFb, Math.max(prevFb - amountRemaining, 0));
                        }
                    } else {
                        // Sin splits → fallback al origen de transferencia_items o cabecera
                        const ubicFb = _origenPrimario(itemRowMap[item.item_id], trf);
                        const prevFb = await _selCant(item.item_id, ubicFb.obra, ubicFb.bodega);
                        await conn.query(
                            `UPDATE ubicaciones_stock SET cantidad = GREATEST(cantidad - ?, 0)
                             WHERE item_id = ? AND obra_id <=> ? AND bodega_id <=> ?`,
                            [delta, item.item_id, ubicFb.obra, ubicFb.bodega]
                        );
                        await _logMov(item.item_id, ubicFb.obra, ubicFb.bodega,
                            'transferencia_salida', prevFb, Math.max(prevFb - delta, 0));
                    }
                }

                // Acumular lo DECLARADO en transferencia_items.cantidad_recibida (no sobreescribir)
                await conn.query(
                    'UPDATE transferencia_items SET cantidad_recibida = COALESCE(cantidad_recibida, 0) + ? WHERE transferencia_id = ? AND item_id = ?',
                    [recibidaEnEvento, id, item.item_id]
                );

                // Incrementar stock en destino (upsert)
                // Auditoría 6.6: copiar valor_arriendo_override del origen al destino si
                // el destino aún no existe. Antes el INSERT no incluía el override y la
                // facturación destino caía al valor base, perdiendo el precio especial
                // que tenía el ítem en la obra de origen.
                // Usamos el origen registrado en transferencia_items (itemRowMap) en vez
                // del trf.origen_* del header, porque el header puede ser NULL en flujos
                // legacy o multi-origen. Si tampoco está, omitimos la búsqueda (override
                // queda NULL en destino — comportamiento previo, sin regresión).
                // Si el destino YA tiene una fila, mantenemos su override (no
                // sobrescribir — el destino pudo haber sido configurado a propósito).
                // Se suma lo MOVIDO (delta), no lo declarado. En legacy es la única escritura de stock.
                if (delta > 0) {
                    const ubicDest = _normalizeUbicacion(trf.destino_obra_id, trf.destino_bodega_id);
                    const rowItem = itemRowMap[item.item_id];
                    let overrideOrigen = null;
                    if (rowItem && (rowItem.origen_obra_id || rowItem.origen_bodega_id)) {
                        const origenResult = await conn.query(
                            `SELECT valor_arriendo_override FROM ubicaciones_stock
                             WHERE item_id = ? AND obra_id <=> ? AND bodega_id <=> ?`,
                            [item.item_id, rowItem.origen_obra_id ?? null, rowItem.origen_bodega_id ?? null]
                        );
                        const rows = Array.isArray(origenResult) ? origenResult[0] : null;
                        if (Array.isArray(rows) && rows.length > 0) {
                            overrideOrigen = rows[0].valor_arriendo_override ?? null;
                        }
                    }
                    const prevDest = await _selCant(item.item_id, ubicDest.obra, ubicDest.bodega);
                    await conn.query(
                        `INSERT INTO ubicaciones_stock (item_id, obra_id, bodega_id, cantidad, valor_arriendo_override)
                         VALUES (?, ?, ?, ?, ?)
                         ON DUPLICATE KEY UPDATE cantidad = cantidad + VALUES(cantidad)`,
                        [item.item_id, ubicDest.obra, ubicDest.bodega, delta, overrideOrigen]
                    );
                    await _logMov(item.item_id, ubicDest.obra, ubicDest.bodega,
                        'transferencia_entrada', prevDest, _r4(prevDest + delta));
                }

                // Audit item del evento
                await conn.query(
                    `INSERT INTO transferencia_recepcion_items
                     (recepcion_id, transferencia_item_id, cantidad_recibida, observacion)
                     VALUES (?, ?, ?, ?)`,
                    [recepcionId, trfItemIdMap[item.item_id], recibidaEnEvento, item.observacion || null]
                );

                // Discrepancia: SOLO en recepción total y solo si lo declarado acumulado ≠ enviada.
                // En parcial no se crea discrepancia (lo que falta "viene en otro viaje").
                // diferencia_aplicada = 0 (mig 130): la diferencia NO está en el stock (se movió lo
                // enviado); queda pendiente hasta que se apruebe (mueve stock) o se rechace (no mueve).
                // Literal en el SQL, nunca NULL: la mig 130 marca NULL como «regla antigua».
                if (tipo === 'total' && ultimaEntrada[item.item_id] === idx) {
                    const totalDeclarado = acumuladoMap[item.item_id];
                    if (_r4(totalDeclarado) !== _r4(enviada)) {
                        await conn.query(
                            `INSERT INTO transferencia_discrepancias
                             (transferencia_id, item_id, cantidad_enviada, cantidad_recibida, observacion, reportado_por, diferencia_aplicada)
                             VALUES (?, ?, ?, ?, ?, ?, 0)`,
                            [id, item.item_id, enviada, totalDeclarado, item.observacion || null, receptorId]
                        );
                    }
                }
            }

            // Transición de estado:
            //   · parcial → recepcion_parcial. Header receptor/fecha NO se setea
            //     (queda para la recepción final que cierra la TRF).
            //   · total   → recibida. Header receptor/fecha = ESTE evento.
            if (tipo === 'parcial') {
                await conn.query(
                    "UPDATE transferencias SET estado = 'recepcion_parcial' WHERE id = ?",
                    [id]
                );
            } else {
                await conn.query(
                    "UPDATE transferencias SET estado = 'recibida', receptor_id = ?, recibido_por = ?, fecha_recepcion = NOW() WHERE id = ?",
                    [receptorId, receptorId, id]
                );
            }

            // Recepción de ítems personalizados de solicitudes mixtas (acumula; sin stock).
            await _recibirCustomItems(conn, id, itemsCustom);

            await conn.commit();
            return { id, estado: tipo === 'parcial' ? 'recepcion_parcial' : 'recibida', recepcion_id: recepcionId };
        } catch (err) {
            await conn.rollback();
            // Sin la mig 130 la recepción con diferencia no puede registrarla: error claro, sin
            // insertar la discrepancia sin la columna (quedaría NULL = «regla antigua» y /rehacer
            // ajustaría el stock dos veces).
            if (_esFaltaColumna(err, /diferencia_aplicada/)) throw _migracionPendiente(130, 'diferencia_aplicada');
            throw err;
        } finally {
            conn.release();
        }
    },

    /**
     * Devuelve el historial de eventos de recepción de una TRF con items embebidos.
     * Usado por el frontend para renderizar la sección "Historial de recepciones"
     * en TransferenciaDetail.
     */
    async getRecepciones(transferenciaId) {
        const [recepciones] = await db.query(
            `SELECT r.id, r.transferencia_id, r.receptor_id, r.fecha_recepcion, r.tipo, r.observacion, r.foto_url,
                    u.nombre AS receptor_nombre
             FROM transferencia_recepciones r
             LEFT JOIN usuarios u ON u.id = r.receptor_id
             WHERE r.transferencia_id = ?
             ORDER BY r.fecha_recepcion ASC, r.id ASC`,
            [transferenciaId]
        );
        if (recepciones.length === 0) return [];

        const ids = recepciones.map(r => r.id);
        const [itemRows] = await db.query(
            `SELECT ri.id, ri.recepcion_id, ri.transferencia_item_id, ri.cantidad_recibida, ri.observacion,
                    ti.item_id, i.descripcion AS item_descripcion, i.unidad
             FROM transferencia_recepcion_items ri
             INNER JOIN transferencia_items ti ON ti.id = ri.transferencia_item_id
             LEFT JOIN items_inventario i ON i.id = ti.item_id
             WHERE ri.recepcion_id IN (?)
             ORDER BY ri.id ASC`,
            [ids]
        );
        const itemsByRecepcion = {};
        itemRows.forEach(r => {
            if (!itemsByRecepcion[r.recepcion_id]) itemsByRecepcion[r.recepcion_id] = [];
            itemsByRecepcion[r.recepcion_id].push({
                id: r.id,
                transferencia_item_id: r.transferencia_item_id,
                item_id: r.item_id,
                item_descripcion: r.item_descripcion,
                unidad: r.unidad,
                cantidad_recibida: Number(r.cantidad_recibida) || 0,
                observacion: r.observacion,
            });
        });

        return recepciones.map(r => ({
            id: r.id,
            transferencia_id: r.transferencia_id,
            receptor_id: r.receptor_id,
            receptor_nombre: r.receptor_nombre,
            fecha_recepcion: r.fecha_recepcion,
            tipo: r.tipo,
            observacion: r.observacion,
            foto_url: r.foto_url,
            items: itemsByRecepcion[r.id] || [],
        }));
    },

    /**
     * Adjunta una foto OPCIONAL a una recepción ya creada (POST-then-attach).
     * Valida que la recepción pertenezca a la transferencia. La foto nunca
     * bloquea el flujo de recepción: esto es un paso aparte y opcional.
     */
    async setFotoRecepcion(transferenciaId, recepcionId, fotoUrl, userBodegaId = null) {
        const [rows] = await db.query(
            `SELECT r.id, t.destino_bodega_id
               FROM transferencia_recepciones r
               JOIN transferencias t ON t.id = r.transferencia_id
              WHERE r.id = ? AND r.transferencia_id = ?`,
            [recepcionId, transferenciaId]
        );
        if (rows.length === 0) {
            const err = new Error('Recepción no encontrada para esta transferencia');
            err.statusCode = 404;
            throw err;
        }
        // Bodeguero (usuarios.bodega_id): solo su bodega — igual que recibir()/rechazar().
        if (userBodegaId != null && rows[0].destino_bodega_id !== userBodegaId) {
            throw Object.assign(new Error('Solo puedes adjuntar fotos a recepciones de transferencias destinadas a tu bodega.'), { statusCode: 403 });
        }
        await db.query('UPDATE transferencia_recepciones SET foto_url = ? WHERE id = ?', [fotoUrl, recepcionId]);
        return { recepcion_id: Number(recepcionId), foto_url: fotoUrl };
    },

    /** Adjunta una foto OPCIONAL a una discrepancia. */
    async setFotoDiscrepancia(discrepanciaId, fotoUrl) {
        const [rows] = await db.query('SELECT id FROM transferencia_discrepancias WHERE id = ?', [discrepanciaId]);
        if (rows.length === 0) {
            const err = new Error('Discrepancia no encontrada');
            err.statusCode = 404;
            throw err;
        }
        await db.query('UPDATE transferencia_discrepancias SET foto_url = ? WHERE id = ?', [fotoUrl, discrepanciaId]);
        return { discrepancia_id: Number(discrepanciaId), foto_url: fotoUrl };
    },

    /**
     * Rechazar: permitido en pendiente, aprobada o en_transito.
     * Si estaba aprobada/en_transito bajo régimen legacy → reversar stock al origen.
     * Bajo régimen nuevo no hay reversa (stock aún no se había movido).
     *
     * Semánticamente cubre dos casos distintos con la misma operación:
     *   · rechazo del aprobador (desde pendiente/aprobada) — flujo de aprobación
     *   · rechazo de recepción (desde en_transito) — el receptor rechaza físicamente
     * Ambos terminan en estado 'rechazada'. La ruta
     * PUT /:id/rechazar-recepcion invoca este mismo método con permiso distinto.
     */
    async rechazar(id, aprobadorId, motivo, userBodegaId = null) {
        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();

            const trf = await this._selectForStatusChange(
                conn,
                'SELECT estado, origen_obra_id, origen_bodega_id, destino_bodega_id, {reconcil} FROM transferencias WHERE id = ? FOR UPDATE',
                [id]
            );
            if (!trf) throw new Error('Transferencia no encontrada');
            if (!['pendiente', 'aprobada', 'en_transito'].includes(trf.estado)) {
                throw new Error('Solo se pueden rechazar transferencias pendientes, aprobadas o en tránsito');
            }

            // Bodeguero (usuarios.bodega_id): en rechazo de RECEPCIÓN solo puede actuar
            // sobre transferencias destinadas a su bodega (la ruta del aprobador no pasa
            // userBodegaId → sin cambio para ese flujo).
            if (userBodegaId != null && trf.destino_bodega_id !== userBodegaId) {
                throw Object.assign(new Error('Solo puedes rechazar la recepción de transferencias destinadas a tu bodega.'), { statusCode: 403 });
            }

            // Legacy (stock_reconciliado=FALSE) + aprobada|en_transito → revertir stock.
            // Régimen nuevo → no hay nada que revertir (stock aún no se movió).
            const esLegacy = trf.stock_reconciliado === 0 || trf.stock_reconciliado === false;
            if (['aprobada', 'en_transito'].includes(trf.estado) && esLegacy) {
                await this._reversarStockAprobada(conn, id, trf);
            }

            await conn.query(
                "UPDATE transferencias SET estado = 'rechazada', aprobador_id = ?, rechazado_por = ?, observaciones_rechazo = ?, fecha_aprobacion = NOW() WHERE id = ?",
                [aprobadorId, aprobadorId, motivo || null, id]
            );

            await conn.commit();
            return { id, estado: 'rechazada' };
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }
    },

    /**
     * Cancelar: permitido en pendiente, aprobada o en_transito.
     * Si estaba aprobada/en_transito bajo régimen legacy → reversar stock al origen.
     * Bajo régimen nuevo no hay reversa (stock aún no se había movido).
     *
     * Soporta cancelación post-despacho (estado='en_transito'): el solicitante
     * o el aprobador aborta la transferencia aunque ya está físicamente viajando.
     */
    async cancelar(id, userId, userPermisos) {
        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();

            const trf = await this._selectForStatusChange(
                conn,
                'SELECT estado, solicitante_id, origen_obra_id, origen_bodega_id, {reconcil} FROM transferencias WHERE id = ? FOR UPDATE',
                [id]
            );
            if (!trf) throw new Error('Transferencia no encontrada');
            if (!['pendiente', 'aprobada', 'en_transito'].includes(trf.estado)) {
                throw new Error('Solo se pueden cancelar transferencias pendientes, aprobadas o en tránsito');
            }

            // Punto 34: una transferencia YA DESPACHADA (en_transito) tiene stock
            // físicamente viajando al destino. No se cancela en el flujo normal —
            // si llega con problema, el receptor usa "Rechazar Recepción". Solo un
            // rol con permiso especial (o sod_bypass) puede cancelarla post-despacho.
            if (trf.estado === 'en_transito'
                && !_hasPerm(userPermisos, 'inventario.transferencias.cancelar_en_transito')
                && !_hasBypass(userPermisos)) {
                throw _sodError('No puedes cancelar una transferencia ya despachada. Si llegó con problemas, recházala al recibir. Requiere permiso especial "Cancelar en Tránsito".');
            }

            // Legacy (stock_reconciliado=FALSE) + aprobada|en_transito → revertir stock.
            // Régimen nuevo → no hay nada que revertir.
            const esLegacy = trf.stock_reconciliado === 0 || trf.stock_reconciliado === false;
            if (['aprobada', 'en_transito'].includes(trf.estado) && esLegacy) {
                await this._reversarStockAprobada(conn, id, trf);
            }

            await conn.query("UPDATE transferencias SET estado = 'cancelada', cancelado_por = ? WHERE id = ?", [userId, id]);

            await conn.commit();
            return { id, estado: 'cancelada' };
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }
    },

    /**
     * Hard delete de una transferencia — la borra de forma PERMANENTE junto a,
     * por FK ON DELETE CASCADE, sus items, items_custom, splits (item_origenes),
     * discrepancias y recepciones. Pensado para purgar datos de prueba que
     * ensucian el historial. Gateado por `inventario.transferencias.eliminar`.
     *
     * DECISIÓN (usuario): NO revierte stock — el kardex (stock_movimientos) no
     * tiene FK a transferencias y se conserva. El inventario NO se ajusta al borrar.
     *
     * Diferencias (revisión 2026-10-21): la CASCADE no puede llevarse en silencio una diferencia que movió stock
     * (al aprobarse o al rehacerse: el ajuste quedaría sin su registro) ni una pendiente de la regla anterior
     * (su diferencia ya está en el stock) → 409 claro, mismos códigos que eliminarDiscrepancia. Un choque con otra
     * transacción (deadlock 1213 / lock wait 1205) → 409 REINTENTAR.
     */
    async eliminar(id, userId) {
        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();
            const [rows] = await conn.query('SELECT id, codigo, estado FROM transferencias WHERE id = ? FOR UPDATE', [id]);
            if (!rows.length) { const e = new Error('Transferencia no encontrada'); e.statusCode = 404; throw e; }
            const t = rows[0];
            const codigo = t.codigo || `TRF #${id}`;
            const difs = await _selectDiscrepancias(conn, 'id', 'WHERE transferencia_id = ? FOR UPDATE', [id]);
            const conAjuste = difs.filter(d => _ajusteMovioStock(_parseAjusteStock(d.ajuste_stock)));
            if (conAjuste.length) {
                throw _httpError(
                    `${codigo} tiene ${conAjuste.length === 1 ? 'una diferencia que ya ajustó' : `${conAjuste.length} diferencias que ya ajustaron`} el stock: no se puede eliminar (el ajuste quedaría sin su registro).`,
                    409, { code: 'CON_AJUSTE' }
                );
            }
            const antiguas = difs.filter(_pendienteReglaAnterior);
            if (antiguas.length) {
                // Aprobarla la cierra sin mover stock (ya está aplicada) y entonces sí se puede borrar la TRF.
                const msg = antiguas.length === 1
                    ? `${codigo} tiene una diferencia pendiente de la regla anterior (ya está en el stock): primero apruébala (se cierra sin mover stock) o pide que la rehagan.`
                    : `${codigo} tiene ${antiguas.length} diferencias pendientes de la regla anterior (ya están en el stock): primero apruébalas (se cierran sin mover stock) o pide que las rehagan.`;
                throw _httpError(msg, 409, { code: 'REGLA_ANTIGUA' });
            }
            await conn.query('DELETE FROM transferencias WHERE id = ?', [id]); // CASCADE limpia hijos
            await conn.commit();
            logger.warn('[Transferencia] hard delete', { id: Number(id), codigo: t.codigo, estado: t.estado, userId });
            return { id: Number(id), codigo: t.codigo };
        } catch (err) {
            await conn.rollback();
            if (_esBloqueoConcurrente(err)) throw _reintentar();
            throw err;
        } finally {
            conn.release();
        }
    },

    /**
     * Hard delete de UNA fila de discrepancia (diferencia) — la saca del
     * historial sin tocar la transferencia ni el stock. Gateado por
     * `inventario.transferencias.eliminar`.
     */
    async eliminarDiscrepancia(id, userId) {
        // Una transacción: la fila se bloquea (FOR UPDATE) y las guardas se evalúan sobre esa lectura, así nadie
        // la aprueba o la rehace entre la guarda y el DELETE (revisión 2026-10-21). Columnas de las mig 129/130
        // con fallback: sin ellas el borrado sigue funcionando. Deadlock / lock wait → 409 REINTENTAR.
        const conn = await db.getConnection();
        let fila;
        try {
            await conn.beginTransaction();
            const rows = await _selectDiscrepancias(conn, 'id, transferencia_id', 'WHERE id = ? FOR UPDATE', [id]);
            if (!rows.length) throw _httpError('Diferencia no encontrada', 404);
            fila = rows[0];
            // Una diferencia que movió stock (al aprobarse o al rehacerse) no se borra: el stock y el kardex
            // quedarían cambiados sin el registro de por qué.
            if (_ajusteMovioStock(_parseAjusteStock(fila.ajuste_stock))) {
                throw _httpError('Esta diferencia ya ajustó el stock: no se puede eliminar (quedaría el ajuste sin su registro).', 409, { code: 'CON_AJUSTE' });
            }
            // Pendiente de la regla anterior: su diferencia YA está en el stock (recibir() la aplicó); borrarla
            // escondería ese stock sin decidir. Primero se aprueba (se cierra sin mover stock) o se rehace (Super
            // Admin) y se aprueba o rechaza con la regla nueva.
            if (_pendienteReglaAnterior(fila)) {
                throw _httpError(
                    'Esta diferencia es de la regla anterior y ya está en el stock: primero apruébala (se cierra sin mover stock) o pide que la rehagan.',
                    409, { code: 'REGLA_ANTIGUA' }
                );
            }
            await conn.query('DELETE FROM transferencia_discrepancias WHERE id = ?', [id]);
            await conn.commit();
        } catch (err) {
            await conn.rollback();
            if (_esBloqueoConcurrente(err)) throw _reintentar();
            throw err;
        } finally {
            conn.release();
        }
        logger.warn('[Transferencia] hard delete discrepancia', { id: Number(id), transferencia_id: fila.transferencia_id, userId });
        return { id: Number(id) };
    },

    /**
     * Otorga 10 días más de plazo a una solicitud PENDIENTE estancada.
     * Resetea el "reloj" de estancamiento: prorroga_hasta = hoy + 10 días.
     * Solo aplica a transferencias en estado 'pendiente'.
     * Punto 55 del checklist: alerta accionable de solicitudes estancadas.
     */
    async prorrogar(id, userId) {
        const [rows] = await db.query('SELECT estado FROM transferencias WHERE id = ? AND activo = 1', [id]);
        if (!rows.length) throw new Error('Transferencia no encontrada');
        if (rows[0].estado !== 'pendiente') {
            throw new Error('Solo se pueden prorrogar transferencias pendientes');
        }
        await db.query(
            'UPDATE transferencias SET prorroga_hasta = DATE_ADD(CURDATE(), INTERVAL 10 DAY) WHERE id = ?',
            [id]
        );
        const [updated] = await db.query('SELECT prorroga_hasta FROM transferencias WHERE id = ?', [id]);
        return { id, prorroga_hasta: updated[0]?.prorroga_hasta || null };
    },

    /**
     * Push directo: bodega → obra SIN paso de aprobación. Material ya está listo
     * para salir; el bodeguero solo registra el movimiento. Queda en 'en_transito'
     * hasta que el receptor confirma en la obra.
     *
     * payload: {
     *   origen_bodega_id, destino_obra_id,
     *   items: [{ item_id, cantidad }],  // cantidad = enviada = solicitada
     *   observaciones?, motivo?
     * }
     */
    async pushDirecto(data, userId) {
        const { origen_bodega_id, destino_obra_id, items, observaciones, motivo } = data;
        if (!origen_bodega_id) throw new Error('Debe especificar bodega origen');
        if (!destino_obra_id) throw new Error('Debe especificar obra destino');
        if (!items || !items.length) throw new Error('Debe incluir al menos un ítem');

        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();

            // Validar stock en bodega origen por cada ítem
            for (const item of items) {
                const cantidad = parseFloat(item.cantidad) || 0;
                if (cantidad <= 0) throw new Error(`Cantidad inválida para ítem ${item.item_id}`);
                const [stock] = await conn.query(
                    'SELECT cantidad FROM ubicaciones_stock WHERE item_id = ? AND obra_id IS NULL AND bodega_id = ?',
                    [item.item_id, origen_bodega_id]
                );
                const disponible = stock.length ? Number(stock[0].cantidad) || 0 : 0;
                if (cantidad > disponible) {
                    throw new Error(`Stock insuficiente para ítem ${item.item_id} en bodega. Disponible: ${disponible}, requerido: ${cantidad}`);
                }
            }

            const codigo = await this._generarCodigo();
            const [result] = await conn.query(
                `INSERT INTO transferencias
                 (codigo, origen_bodega_id, destino_obra_id, solicitante_id, aprobador_id,
                  observaciones, tipo_flujo, motivo, estado,
                  fecha_aprobacion, fecha_despacho,
                  creado_por, aprobado_por, despachado_por)
                 VALUES (?, ?, ?, ?, ?, ?, 'push_directo', ?, 'en_transito', NOW(), NOW(), ?, ?, ?)`,
                [codigo, origen_bodega_id, destino_obra_id, userId, userId, observaciones || null, motivo || null, userId, userId, userId]
            );
            const trfId = result.insertId;

            // Persistir items + splits (único origen = bodega)
            for (const item of items) {
                const cantidad = parseFloat(item.cantidad) || 0;
                const [itemRes] = await conn.query(
                    `INSERT INTO transferencia_items
                     (transferencia_id, item_id, cantidad_solicitada, cantidad_enviada, origen_bodega_id)
                     VALUES (?, ?, ?, ?, ?)`,
                    [trfId, item.item_id, cantidad, cantidad, origen_bodega_id]
                );
                await conn.query(
                    `INSERT INTO transferencia_item_origenes
                     (transferencia_item_id, origen_obra_id, origen_bodega_id, cantidad_enviada)
                     VALUES (?, NULL, ?, ?)`,
                    [itemRes.insertId, origen_bodega_id, cantidad]
                );
            }

            await conn.commit();
            return { id: trfId, codigo, estado: 'en_transito' };
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }
    },

    /**
     * Intra-bodega: bodega → bodega CON aprobación.
     *
     * Decisión jefatura (mayo 2026): antes era instantáneo (nacía 'recibida' y
     * movía stock en la misma tx). Ahora pasa por el flujo normal
     * pendiente → aprobada → en_transito → recibida, igual que intra_obra y
     * devolucion. El stock se mueve recién en la recepción. El bodeguero no
     * mueve stock sin visto bueno de Leonardo (o su reemplazo).
     *
     * Delega en crear() con tipo_flujo='intra_bodega'. aprobar() y recibir()
     * ya soportan splits/destinos de bodega vía _normalizeUbicacion.
     *
     * payload: {
     *   origen_bodega_id, destino_bodega_id,
     *   items: [{ item_id, cantidad }],
     *   observaciones?, motivo?
     * }
     */
    async intraBodega(data, userId) {
        return this.crear({ ...data, tipo_flujo: 'intra_bodega' }, userId);
    },

    /**
     * Devolución: obra → bodega (cierre de obra, sobrante). Requiere aprobación
     * del dueño de bodega antes de movilizar. Modelo: solicitud con el flujo
     * estándar (pendiente → aprobada → en_transito → recibida) pero con
     * dirección invertida.
     *
     * payload: {
     *   origen_obra_id, destino_bodega_id,
     *   items: [{ item_id, cantidad }],
     *   observaciones?, motivo?, requiere_pionetas?, cantidad_pionetas?
     * }
     */
    async devolucion(data, userId) {
        return this.crear({ ...data, tipo_flujo: 'devolucion' }, userId);
    },

    /**
     * Intra-obra: obra → obra con aprobación. Distintas obras pueden tener
     * distintos jefes, por lo que el flujo es el mismo que 'solicitud'
     * (pendiente → aprobada → en_transito → recibida). Stock se valida por obra.
     *
     * Delega en crear() con tipo_flujo='intra_obra'.
     *
     * payload: {
     *   origen_obra_id, destino_obra_id,
     *   items: [{ item_id, cantidad }],
     *   observaciones?, motivo?, requiere_pionetas?, cantidad_pionetas?
     * }
     */
    async intraObra(data, userId) {
        return this.crear({ ...data, tipo_flujo: 'intra_obra' }, userId);
    },

    /**
     * Orden de gerencia: flujo excepcional. El PM/dueño emite una orden
     * directa que bypasa 'pendiente' Y 'aprobada' — nace en 'en_transito'
     * (como push_directo) pero permite cualquier combinación origen/destino
     * y exige 'motivo' obligatorio para trazabilidad.
     *
     * Permiso: inventario.transferencias.orden_gerencia (no lo usa un bodeguero normal).
     *
     * payload: {
     *   origen_obra_id?, origen_bodega_id?,   // uno de los dos requerido
     *   destino_obra_id?, destino_bodega_id?, // uno de los dos requerido
     *   items: [{ item_id, cantidad }],
     *   motivo (OBLIGATORIO),
     *   observaciones?
     * }
     */
    async ordenGerencia(data, userId) {
        const {
            origen_obra_id, origen_bodega_id,
            destino_obra_id, destino_bodega_id,
            items, motivo, observaciones,
        } = data;

        if (!motivo || !String(motivo).trim()) {
            throw new Error('Orden de gerencia requiere motivo');
        }
        if (!origen_obra_id && !origen_bodega_id) {
            throw new Error('Debe especificar un origen (obra o bodega)');
        }
        if (origen_obra_id && origen_bodega_id) {
            throw new Error('Origen debe ser UNA obra O UNA bodega, no ambos');
        }
        if (!destino_obra_id && !destino_bodega_id) {
            throw new Error('Debe especificar un destino (obra o bodega)');
        }
        if (destino_obra_id && destino_bodega_id) {
            throw new Error('Destino debe ser UNA obra O UNA bodega, no ambos');
        }
        if (origen_obra_id && origen_obra_id === destino_obra_id) {
            throw new Error('Origen y destino no pueden ser la misma obra');
        }
        if (origen_bodega_id && origen_bodega_id === destino_bodega_id) {
            throw new Error('Origen y destino no pueden ser la misma bodega');
        }
        if (!items || !items.length) throw new Error('Debe incluir al menos un ítem');

        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();

            // Validar stock en el origen (obra o bodega).
            for (const item of items) {
                const cantidad = parseFloat(item.cantidad) || 0;
                if (cantidad <= 0) throw new Error(`Cantidad inválida para ítem ${item.item_id}`);
                let disponible = 0;
                if (origen_obra_id) {
                    const [stock] = await conn.query(
                        `SELECT cantidad FROM ubicaciones_stock
                         WHERE item_id = ? AND obra_id = ? AND bodega_id IS NULL`,
                        [item.item_id, origen_obra_id]
                    );
                    disponible = stock.length ? Number(stock[0].cantidad) || 0 : 0;
                } else {
                    const [stock] = await conn.query(
                        `SELECT cantidad FROM ubicaciones_stock
                         WHERE item_id = ? AND obra_id IS NULL AND bodega_id = ?`,
                        [item.item_id, origen_bodega_id]
                    );
                    disponible = stock.length ? Number(stock[0].cantidad) || 0 : 0;
                }
                if (cantidad > disponible) {
                    throw new Error(`Stock insuficiente para ítem ${item.item_id} en el origen. Disponible: ${disponible}, requerido: ${cantidad}`);
                }
            }

            const codigo = await this._generarCodigo();
            const [result] = await conn.query(
                `INSERT INTO transferencias
                 (codigo, origen_obra_id, origen_bodega_id, destino_obra_id, destino_bodega_id,
                  solicitante_id, aprobador_id,
                  observaciones, tipo_flujo, motivo, estado,
                  fecha_aprobacion, fecha_despacho,
                  creado_por, aprobado_por, despachado_por)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'orden_gerencia', ?, 'en_transito', NOW(), NOW(), ?, ?, ?)`,
                [
                    codigo,
                    origen_obra_id || null,
                    origen_bodega_id || null,
                    destino_obra_id || null,
                    destino_bodega_id || null,
                    userId, userId,
                    observaciones || null,
                    String(motivo).trim(),
                    userId, userId, userId,
                ]
            );
            const trfId = result.insertId;

            // Persistir items + splits (único origen)
            for (const item of items) {
                const cantidad = parseFloat(item.cantidad) || 0;
                const [itemRes] = await conn.query(
                    `INSERT INTO transferencia_items
                     (transferencia_id, item_id, cantidad_solicitada, cantidad_enviada, origen_obra_id, origen_bodega_id)
                     VALUES (?, ?, ?, ?, ?, ?)`,
                    [
                        trfId, item.item_id, cantidad, cantidad,
                        origen_obra_id || null, origen_bodega_id || null,
                    ]
                );
                await conn.query(
                    `INSERT INTO transferencia_item_origenes
                     (transferencia_item_id, origen_obra_id, origen_bodega_id, cantidad_enviada)
                     VALUES (?, ?, ?, ?)`,
                    [itemRes.insertId, origen_obra_id || null, origen_bodega_id || null, cantidad]
                );
            }

            await conn.commit();
            return { id: trfId, codigo, estado: 'en_transito' };
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }
    },

    async getAll(query = {}, solicitanteId = null, destinoBodegaId = null) {
        // Cuando solicitanteId viene seteado, scopear el listado a las solicitudes
        // del usuario (caller decide; típicamente cuando NO tiene
        // `inventario.transferencias.ver_todas`). null = sin filtro = ver todas.
        // destinoBodegaId (usuarios.bodega_id, mig 097): un bodeguero además ve las
        // transferencias DESTINADAS a su bodega aunque no las haya creado él.
        const { estado, fecha_desde, fecha_hasta, solicitante_id, q, incluir_finalizadas } = query;
        const { page, limit, offset } = normalizePagination(query);
        // Histórico: incluye TRFs de obras finalizadas; la exclusión de prueba se mantiene SIEMPRE.
        const exclusion = String(incluir_finalizadas) === 'true' ? EXCLUIR_SOLO_PRUEBA : EXCLUIR_OBRAS_PRUEBA;
        let where = 'WHERE t.activo = 1' + exclusion;
        const params = [];

        if (solicitanteId != null) {
            if (destinoBodegaId != null) {
                where += ' AND (t.solicitante_id = ? OR t.destino_bodega_id = ?)';
                params.push(solicitanteId, destinoBodegaId);
            } else {
                where += ' AND t.solicitante_id = ?';
                params.push(solicitanteId);
            }
        }
        if (estado) { where += ' AND t.estado = ?'; params.push(estado); }
        // Filtros de búsqueda del panel: rango por fecha de solicitud + solicitante.
        // (solicitante_id de query solo afina cuando el caller ve todas; si ya está
        // scopeado por el posicional, este AND es redundante pero inofensivo.)
        if (fecha_desde) { where += ' AND t.fecha_solicitud >= ?'; params.push(fecha_desde); }
        if (fecha_hasta) { where += ' AND t.fecha_solicitud < DATE_ADD(?, INTERVAL 1 DAY)'; params.push(fecha_hasta); }
        if (solicitante_id) { where += ' AND t.solicitante_id = ?'; params.push(solicitante_id); }
        // Búsqueda por código (histórico): server-side, parametrizada.
        const qTrim = typeof q === 'string' ? q.trim() : '';
        if (qTrim) { where += ' AND t.codigo LIKE ?'; params.push(`%${qTrim}%`); }

        const [rows] = await db.query(`
            SELECT t.*,
                   oo.nombre as origen_obra_nombre, ob.nombre as origen_bodega_nombre,
                   ob.responsable_nombre as origen_bodega_responsable_nombre,
                   do2.nombre as destino_obra_nombre, db2.nombre as destino_bodega_nombre,
                   db2.responsable_nombre as destino_bodega_responsable_nombre,
                   us.nombre as solicitante_nombre, ua.nombre as aprobador_nombre
            FROM transferencias t
            LEFT JOIN obras oo ON t.origen_obra_id = oo.id
            LEFT JOIN bodegas ob ON t.origen_bodega_id = ob.id
            LEFT JOIN obras do2 ON t.destino_obra_id = do2.id
            LEFT JOIN bodegas db2 ON t.destino_bodega_id = db2.id
            LEFT JOIN usuarios us ON t.solicitante_id = us.id
            LEFT JOIN usuarios ua ON t.aprobador_id = ua.id
            ${where}
            ORDER BY t.fecha_solicitud DESC
            LIMIT ? OFFSET ?
        `, [...params, limit, offset]);

        const [countRows] = await db.query(`SELECT COUNT(*) as total FROM transferencias t ${where}`, params);

        return { data: rows, total: countRows[0].total, page, limit };
    },

    /** Solicitantes DISTINCT que han creado transferencias (para el filtro del panel). */
    async getSolicitantes() {
        const [rows] = await db.query(`
            SELECT DISTINCT u.id, u.nombre
            FROM transferencias t
            JOIN usuarios u ON t.solicitante_id = u.id
            WHERE t.activo = 1
            ORDER BY u.nombre ASC
        `);
        return rows;
    },

    async getById(id) {
        const [rows] = await db.query(`
            SELECT t.*,
                   oo.nombre as origen_obra_nombre, ob.nombre as origen_bodega_nombre,
                   ob.responsable_nombre as origen_bodega_responsable_nombre,
                   do2.nombre as destino_obra_nombre, db2.nombre as destino_bodega_nombre,
                   db2.responsable_nombre as destino_bodega_responsable_nombre,
                   us.nombre as solicitante_nombre, ua.nombre as aprobador_nombre,
                   ut.nombre as transportista_nombre, ur.nombre as receptor_nombre,
                   urj.nombre as rechazado_por_nombre, uca.nombre as cancelado_por_nombre
            FROM transferencias t
            LEFT JOIN obras oo ON t.origen_obra_id = oo.id
            LEFT JOIN bodegas ob ON t.origen_bodega_id = ob.id
            LEFT JOIN obras do2 ON t.destino_obra_id = do2.id
            LEFT JOIN bodegas db2 ON t.destino_bodega_id = db2.id
            LEFT JOIN usuarios us ON t.solicitante_id = us.id
            LEFT JOIN usuarios ua ON t.aprobador_id = ua.id
            LEFT JOIN usuarios ut ON t.transportista_id = ut.id
            LEFT JOIN usuarios ur ON t.receptor_id = ur.id
            LEFT JOIN usuarios urj ON t.rechazado_por = urj.id
            LEFT JOIN usuarios uca ON t.cancelado_por = uca.id
            WHERE t.id = ?
        `, [id]);
        if (!rows.length) throw new Error('Transferencia no encontrada');

        const [items] = await db.query(`
            SELECT ti.*, i.descripcion as item_descripcion, i.unidad,
                   oi.nombre as origen_obra_nombre, bi.nombre as origen_bodega_nombre
            FROM transferencia_items ti
            JOIN items_inventario i ON ti.item_id = i.id
            LEFT JOIN obras oi ON ti.origen_obra_id = oi.id
            LEFT JOIN bodegas bi ON ti.origen_bodega_id = bi.id
            WHERE ti.transferencia_id = ?
        `, [id]);

        // Normalizar DECIMAL → Number (mysql2 devuelve DECIMAL como string).
        items.forEach(i => {
            i.cantidad_solicitada = Number(i.cantidad_solicitada) || 0;
            i.cantidad_enviada = i.cantidad_enviada != null ? Number(i.cantidad_enviada) : null;
            i.cantidad_recibida = i.cantidad_recibida != null ? Number(i.cantidad_recibida) : null;
        });

        // Adjuntar splits (múltiples orígenes por ítem) si existen.
        // Un ítem aprobado normalmente tiene 1 split; si fue aprobado con
        // multi-origen tendrá N. Ítems pendientes (no aprobados aún) no tienen
        // splits — el frontend debe manejar array vacío.
        if (items.length > 0) {
            const itemIds = items.map(i => i.id);
            const [splits] = await db.query(`
                SELECT tio.transferencia_item_id, tio.origen_obra_id, tio.origen_bodega_id,
                       tio.cantidad_enviada,
                       oi.nombre as origen_obra_nombre, bi.nombre as origen_bodega_nombre
                FROM transferencia_item_origenes tio
                LEFT JOIN obras oi ON tio.origen_obra_id = oi.id
                LEFT JOIN bodegas bi ON tio.origen_bodega_id = bi.id
                WHERE tio.transferencia_item_id IN (${itemIds.map(() => '?').join(',')})
            `, itemIds);

            const splitsByItem = {};
            splits.forEach(s => {
                s.cantidad_enviada = Number(s.cantidad_enviada) || 0;
                if (!splitsByItem[s.transferencia_item_id]) splitsByItem[s.transferencia_item_id] = [];
                splitsByItem[s.transferencia_item_id].push(s);
            });
            items.forEach(i => { i.splits = splitsByItem[i.id] || []; });
        }

        // Items personalizados (fuera de catálogo). Pueden estar vacíos.
        const [itemsCustom] = await db.query(
            `SELECT tic.id, tic.descripcion, tic.cantidad, tic.unidad, tic.observacion,
                    tic.cantidad_aprobada, tic.cantidad_recibida, tic.aprobado, tic.nota_aprobador, tic.agregado_por_aprobador,
                    tic.fuente, tic.origen_obra_id, o.nombre AS origen_obra_nombre,
                    tic.compra_realizada, tic.notas_compra, tic.fecha_compra
             FROM transferencia_items_custom tic
             LEFT JOIN obras o ON o.id = tic.origen_obra_id
             WHERE tic.transferencia_id = ?
             ORDER BY tic.id ASC`,
            [id]
        );

        // Normalizar DECIMAL → Number y TINYINT → boolean en items personalizados
        itemsCustom.forEach(i => {
            i.cantidad = Number(i.cantidad) || 0;
            i.cantidad_aprobada = i.cantidad_aprobada != null ? Number(i.cantidad_aprobada) : null;
            i.cantidad_recibida = Number(i.cantidad_recibida) || 0;
            i.aprobado = !!i.aprobado;
            i.agregado_por_aprobador = !!i.agregado_por_aprobador;
        });

        return { ...rows[0], items, items_custom: itemsCustom };
    },

    async getPendientes() {
        return this.getAll({ estado: 'pendiente', limit: 50 });
    },

    /**
     * Tarjeta «Inventario» del Inicio (dueño 2026-10-20): lo que le toca a ESTE usuario según su perfil.
     * Cada cifra es null cuando el perfil no puede actuar sobre ella (la tarjeta no la muestra):
     *   - por_aprobar   (transferencias.aprobar): pendientes de aprobación, todas — igual que GET /pendientes.
     *   - discrepancias (transferencias.aprobar): transferencias con diferencias pendientes de resolver,
     *                   igual que la pestaña «Diferencias» (que gatea con el mismo permiso).
     *   - por_despachar (transferencias.despachar) y por_recibir (transferencias.recibir): con el mismo
     *                   alcance que el listado (sin ver_todas: las propias + las destinadas a su bodega).
     *   - mis_solicitudes: las propias que siguen en curso (pendiente, aprobada o en tránsito).
     * `dias` = antigüedad de la más vieja de cada grupo (desde solicitud, aprobación o despacho).
     */
    async resumenInicio(user = {}) {
        const p = Array.isArray(user.p) ? user.p : [];
        const tiene = (k) => p.includes(k);
        const verTodas = tiene('inventario.transferencias.ver_todas');
        let alcance = '';
        const alcanceParams = [];
        if (!verTodas) {
            alcance = user.bodega_id
                ? ' AND (t.solicitante_id = ? OR t.destino_bodega_id = ?)'
                : ' AND t.solicitante_id = ?';
            alcanceParams.push(user.id);
            if (user.bodega_id) alcanceParams.push(user.bodega_id);
        }
        const base = 'FROM transferencias t WHERE t.activo = 1' + EXCLUIR_OBRAS_PRUEBA;
        const grupo = (n, dias) => ({ total: Number(n) || 0, dias: dias == null ? null : Number(dias) });

        const consultas = {
            por_aprobar: tiene('inventario.transferencias.aprobar')
                ? db.query(`SELECT COUNT(*) AS n, MAX(DATEDIFF(CURDATE(), t.fecha_solicitud)) AS dias ${base} AND t.estado = 'pendiente'`)
                : null,
            discrepancias: tiene('inventario.transferencias.aprobar')
                ? db.query(`SELECT COUNT(DISTINCT t.id) AS n, MAX(DATEDIFF(CURDATE(), t.fecha_recepcion)) AS dias
                            FROM transferencias t JOIN transferencia_discrepancias d ON d.transferencia_id = t.id
                            WHERE t.activo = 1${EXCLUIR_OBRAS_PRUEBA} AND d.estado = 'pendiente' AND d.diferencia <> 0`)
                : null,
            por_despachar: tiene('inventario.transferencias.despachar')
                ? db.query(`SELECT COUNT(*) AS n, MAX(DATEDIFF(CURDATE(), t.fecha_aprobacion)) AS dias ${base} AND t.estado = 'aprobada'${alcance}`, alcanceParams)
                : null,
            por_recibir: tiene('inventario.transferencias.recibir')
                ? db.query(`SELECT COUNT(*) AS n, MAX(DATEDIFF(CURDATE(), t.fecha_despacho)) AS dias ${base} AND t.estado IN ('en_transito', 'recepcion_parcial')${alcance}`, alcanceParams)
                : null,
            mis_solicitudes: user.id
                ? db.query(`SELECT COUNT(*) AS n, MAX(DATEDIFF(CURDATE(), t.fecha_solicitud)) AS dias ${base} AND t.estado IN ('pendiente', 'aprobada', 'en_transito', 'recepcion_parcial') AND t.solicitante_id = ?`, [user.id])
                : null,
        };
        const claves = Object.keys(consultas);
        const resultados = await Promise.all(claves.map(k => consultas[k]));
        const out = {};
        claves.forEach((k, i) => {
            const r = resultados[i];
            out[k] = r ? grupo(r[0]?.[0]?.n, r[0]?.[0]?.dias) : null;
        });
        return out;
    },

    async getMisSolicitudes(userId, query = {}) {
        const { limit, offset } = normalizePagination(query);
        const [rows] = await db.query(`
            SELECT t.*, do2.nombre as destino_obra_nombre, db2.nombre as destino_bodega_nombre,
                   db2.responsable_nombre as destino_bodega_responsable_nombre
            FROM transferencias t
            LEFT JOIN obras do2 ON t.destino_obra_id = do2.id
            LEFT JOIN bodegas db2 ON t.destino_bodega_id = db2.id
            WHERE t.solicitante_id = ? AND t.activo = 1 ${EXCLUIR_OBRAS_PRUEBA}
            ORDER BY t.fecha_solicitud DESC
            LIMIT ? OFFSET ?
        `, [userId, limit, offset]);
        return { data: rows };
    },

    /**
     * Listado de discrepancias con toda la información necesaria para auditar.
     * Agrupado por transferencia: cada entrada trae los datos de la transferencia
     * (solicitante, aprobador, receptor, origen, destino, fechas) y sus items con diferencia.
     */
    async getDiscrepancias(query = {}) {
        // Auditoría 3.6: validar/clamp page+limit antes de armar SQL (default 50).
        const { estado } = query;
        const { page, limit, offset } = normalizePagination(query, 50);

        const params = [];
        // Defensa en profundidad: nunca listar filas con diferencia 0 (semánticamente
        // imposibles; datos fantasma de versiones previas). El fix de raíz vive en recibir().
        let where = 'WHERE t.activo = 1' + EXCLUIR_OBRAS_PRUEBA + ' AND d.diferencia <> 0';
        if (estado) { where += ' AND d.estado = ?'; params.push(estado); }

        // 1. Traer transferencias distintas que tienen al menos una discrepancia
        const [trfRows] = await db.query(`
            SELECT DISTINCT t.id, t.codigo, t.fecha_solicitud, t.fecha_aprobacion,
                   t.fecha_despacho, t.fecha_recepcion,
                   t.origen_obra_id, t.origen_bodega_id, t.destino_obra_id, t.destino_bodega_id,
                   CASE WHEN t.stock_reconciliado = 0
                          OR NOT EXISTS (SELECT 1 FROM transferencia_recepciones tr WHERE tr.transferencia_id = t.id)
                        THEN 0 ELSE 1 END AS stock_reconciliado,
                   oo.nombre as origen_obra_nombre, ob.nombre as origen_bodega_nombre,
                   ob.responsable_nombre as origen_bodega_responsable_nombre,
                   do2.nombre as destino_obra_nombre, db2.nombre as destino_bodega_nombre,
                   db2.responsable_nombre as destino_bodega_responsable_nombre,
                   us.nombre as solicitante_nombre, us.id as solicitante_id,
                   ua.nombre as aprobador_nombre, ua.id as aprobador_id,
                   ut.nombre as transportista_nombre, ut.id as transportista_id,
                   ur.nombre as receptor_nombre, ur.id as receptor_id
            FROM transferencias t
            INNER JOIN transferencia_discrepancias d ON d.transferencia_id = t.id
            LEFT JOIN obras oo ON t.origen_obra_id = oo.id
            LEFT JOIN bodegas ob ON t.origen_bodega_id = ob.id
            LEFT JOIN obras do2 ON t.destino_obra_id = do2.id
            LEFT JOIN bodegas db2 ON t.destino_bodega_id = db2.id
            LEFT JOIN usuarios us ON t.solicitante_id = us.id
            LEFT JOIN usuarios ua ON t.aprobador_id = ua.id
            LEFT JOIN usuarios ut ON t.transportista_id = ut.id
            LEFT JOIN usuarios ur ON t.receptor_id = ur.id
            ${where}
            ORDER BY t.fecha_recepcion DESC, t.id DESC
            LIMIT ? OFFSET ?
        `, [...params, limit, offset]);

        if (!trfRows.length) return { data: [], total: 0, page, limit };

        // 2. Traer todas las discrepancias de esas transferencias
        const trfIds = trfRows.map(r => r.id);
        const [discRows] = await db.query(`
            SELECT d.*, i.descripcion as item_descripcion, i.nro_item, i.unidad,
                   ru.nombre as resuelto_por_nombre,
                   rp.nombre as reportado_por_nombre
            FROM transferencia_discrepancias d
            JOIN items_inventario i ON d.item_id = i.id
            LEFT JOIN usuarios ru ON d.resuelto_por = ru.id
            LEFT JOIN usuarios rp ON d.reportado_por = rp.id
            WHERE d.transferencia_id IN (?) AND d.diferencia <> 0
            ORDER BY d.transferencia_id, d.id
        `, [trfIds]);

        // 3. Agrupar discrepancias por transferencia
        const byTrf = {};
        discRows.forEach(d => {
            if (!byTrf[d.transferencia_id]) byTrf[d.transferencia_id] = [];
            byTrf[d.transferencia_id].push(d);
        });

        // 4. Total (cuenta distinct transferencias con discrepancias)
        const [countRows] = await db.query(`
            SELECT COUNT(DISTINCT t.id) as total
            FROM transferencias t
            INNER JOIN transferencia_discrepancias d ON d.transferencia_id = t.id
            ${where}
        `, params);

        // 5. Stock ACTUAL en el origen primario y el destino de cada diferencia, para que la pantalla arme
        // el mensaje de aprobar/rechazar y advierta si no alcanza. Origen primario = última fila de
        // transferencia_items por ítem (mismo criterio que recibir()), sin JOIN plano (duplicaría filas).
        const ubicDe = await this._ubicacionesDiscrepancias(trfRows, discRows);

        const data = trfRows.map(t => {
            const discrepancias = byTrf[t.id] || [];
            // Normalizar DECIMAL → Number (mysql2 devuelve DECIMAL como string)
            discrepancias.forEach(d => {
                d.cantidad_enviada = Number(d.cantidad_enviada) || 0;
                d.cantidad_recibida = Number(d.cantidad_recibida) || 0;
                d.diferencia = Number(d.diferencia) || 0;
                // Lo que el sistema movió al aprobar/rehacer (JSON { ajustes, aviso, rehecha? }); null si nada.
                d.ajuste_stock = _parseAjusteStock(d.ajuste_stock);
                // Mig 130: true = regla antigua (la diferencia ya está en el stock: hay que rehacerla antes de
                // rechazarla); false = regla nueva (pendiente, el stock tiene lo enviado). null SOLO sin la columna
                // (d.* no la trae); la columna en NULL es regla antigua, igual que en el service (_esReglaNueva).
                d.diferencia_aplicada = d.diferencia_aplicada === undefined ? null : !_esReglaNueva(d.diferencia_aplicada);
                Object.assign(d, ubicDe(t, d));
            });
            const total_unidades_perdidas = discrepancias.reduce((s, d) => s + d.diferencia, 0);
            return {
                ...t,
                discrepancias,
                total_unidades_perdidas,
                total_items_afectados: discrepancias.length,
            };
        });

        return { data, total: countRows[0].total, page, limit };
    },

    /**
     * Aprueba ('resuelta') o rechaza ('descartada') una diferencia (discrepancia) de transferencia. Solo 'pendiente'.
     *
     * Regla del dueño 2026-10-21: la recepción movió SOLO lo enviado; lo que el receptor declaró de más o de
     * menos queda pendiente acá, y quien maneja el inventario decide (el receptor no puede corregir después).
     *   dif = cantidad_recibida (lo declarado) − cantidad_enviada. OJO: la columna generada `diferencia` tiene
     *   el signo OPUESTO (enviada − recibida, positivo = faltante) y la UI la lee así → acá no se usa.
     *   · RESOLVER = APROBAR lo declarado (regla nueva, diferencia_aplicada = 0):
     *       sobrante (dif > 0): destino +dif y origen primario −dif. Si el origen tiene menos, queda en 0 (no
     *                           negativo) y el aviso dice cuántas quedaron sin respaldo.
     *       faltante (dif < 0, f = −dif): destino −f; si el destino ya no las tiene → 409 DESTINO_SIN_STOCK sin
     *                           escribir nada. Al origen vuelve lo que de verdad salió de más: min(f, max(0,
     *                           salido − recibida)), con `salido` del kardex (_salidoDelOrigen): recibir() sube
     *                           cantidad_decrementada aunque el GREATEST recorte, así que no se puede devolver f a
     *                           ciegas. Va primero a los splits en orden INVERSO, hasta lo que cada uno descontó
     *                           (baja cantidad_decrementada); el resto, al origen primario. Si vuelve menos que f,
     *                           el aviso lo explica («el origen no tenía esas unidades al despachar»).
     *       Kardex tipo 'discrepancia', referencia 'transferencia' = id de la TRF, motivo «Diferencia aprobada …».
     *   · RESOLVER sobre una pendiente de la REGLA ANTERIOR (diferencia_aplicada = 1 o NULL): lo declarado ya está
     *     en el stock → se cierra SIN mover stock (ajustes []) con el aviso AVISO_REGLA_ANTERIOR y
     *     `cerrada_regla_anterior: true` en la respuesta (la UI lo muestra como información).
     *   · DESCARTAR = RECHAZAR lo declarado: no mueve stock (ya tiene lo enviado). Para cuando quien recibió se
     *     equivocó al digitar o al contar. Sobre la regla anterior → 409 REGLA_ANTIGUA: primero hay que rehacerla
     *     (rehacerDiscrepancia, solo Super Admin), porque lo declarado sí está en el stock.
     *   `resolucion` es opcional: vacía → texto generado («Aprobada: llegaron N de M enviados» /
     *   «Rechazada: queda lo enviado (M)»). La `causa` del modelo anterior (mig 129) ya no se usa ni se escribe.
     *
     * UNA transacción: FOR UPDATE de la discrepancia (guard 'pendiente') → transferencia → splits → filas de
     * ubicaciones_stock (orden estable). Todo se calcula ANTES de la primera escritura; rollback ante error.
     * Sin la mig 130 (errno 1054 de diferencia_aplicada) → 409 MIGRACION_PENDIENTE. Deadlock (1213) o lock wait
     * (1205) con otra transacción → 409 REINTENTAR.
     *
     * `opciones.simular`: corre la misma lógica (mismos bloqueos y validaciones) sin escribir nada (ni stock, ni
     * kardex, ni splits, ni la fila) y hace rollback. Lo que en real sería un 409 vuelve como `bloqueo`
     * ({ code, message }) en una respuesta normal; 400/404 y el 409 REINTENTAR (pasajero) siguen siendo error.
     *
     * @returns {{ id, estado, resolucion, ajustes: Array<{ubicacion_nombre, obra_id, bodega_id, antes, despues,
     *             cantidad}>, aviso: string|null, transferencia_id, transferencia_codigo, item, simulado,
     *             cerrada_regla_anterior?: true, bloqueo?: null|{code, message} }}
     *          (cerrada_regla_anterior solo al aprobar una de la regla anterior; bloqueo solo al simular)
     */
    async resolverDiscrepancia(id, userId, estado, resolucion, opciones = {}) {
        if (!['resuelta', 'descartada'].includes(estado)) {
            throw _httpError('Estado inválido (debe ser "resuelta" o "descartada")', 400);
        }
        const simular = !!(opciones && typeof opciones === 'object' && opciones.simular);
        const nota = typeof resolucion === 'string' ? resolucion.trim().slice(0, 1000) : '';
        let d = null;
        let trf = null;

        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();

            const [discRows] = await conn.query(
                `SELECT id, transferencia_id, item_id, cantidad_enviada, cantidad_recibida, estado, diferencia_aplicada, ajuste_stock
                 FROM transferencia_discrepancias WHERE id = ? FOR UPDATE`,
                [id]
            );
            if (!discRows.length) throw _httpError('Discrepancia no encontrada', 404);
            d = discRows[0];
            if (d.estado !== 'pendiente') {
                throw _httpError(`La discrepancia ya está ${d.estado}: no se puede volver a resolver`, 409, { code: 'NO_PENDIENTE' });
            }
            const reglaAnterior = !_esReglaNueva(d.diferencia_aplicada);
            if (reglaAnterior && estado === 'descartada') {
                throw _httpError('Esta diferencia es de la regla anterior (ya está en el stock): para rechazarla primero hay que rehacerla', 409, { code: 'REGLA_ANTIGUA' });
            }

            trf = await this._trfDeDiscrepancia(conn, d.transferencia_id);
            const enviada = _r4(d.cantidad_enviada);
            const recibida = _r4(d.cantidad_recibida);
            const dif = _r4(recibida - enviada);
            const previo = _parseAjusteStock(d.ajuste_stock);

            let ajustes = [];
            let aviso = null;
            if (estado === 'resuelta' && reglaAnterior) {
                aviso = AVISO_REGLA_ANTERIOR;
            } else if (estado === 'resuelta' && dif !== 0) {
                const rehecha = !!(previo && previo.rehecha);
                const r = await this._aprobarDiferencia(conn, {
                    d, trf, enviada, recibida, dif, nota, userId, simular,
                    regimenRehecha: rehecha ? (previo.rehecha.regimen ?? null) : null,
                    // Una fila rehecha viene de una recepción con la regla anterior: esa recepción llevó al destino
                    // lo RECIBIDO (no lo enviado). _salidoDelOrigen lo necesita para cuadrar el kardex parcial.
                    recepcionReglaAnterior: rehecha,
                });
                ajustes = r.ajustes;
                aviso = r.aviso;
            }

            const texto = nota || (estado === 'resuelta'
                ? `Aprobada: llegaron ${_fmtCant(recibida)} de ${_fmtCant(enviada)} enviados`
                : `Rechazada: queda lo enviado (${_fmtCant(enviada)})`);
            const item = await this._itemInfo(conn, d.item_id);
            const resultado = {
                id: Number(id), estado, resolucion: texto, ajustes, aviso,
                transferencia_id: trf.id, transferencia_codigo: trf.codigo ?? null, item,
                simulado: simular,
                // Aprobar una de la regla anterior la cierra sin mover stock: la UI lo muestra como información
                // (no como «se aplicó la diferencia»). Solo viene cuando es true.
                ...(estado === 'resuelta' && reglaAnterior ? { cerrada_regla_anterior: true } : {}),
            };

            if (simular) {
                await conn.rollback();
                return { ...resultado, bloqueo: null };
            }

            // Si la fila se rehízo antes (rehacerDiscrepancia), ese registro se conserva anidado: no se pisa.
            const ajusteStock = { ajustes, aviso, ...(previo && previo.rehecha ? { rehecha: previo.rehecha } : {}) };
            const [upd] = await conn.query(
                `UPDATE transferencia_discrepancias
                 SET estado = ?, resolucion = ?, ajuste_stock = ?, resuelto_por = ?, fecha_resolucion = NOW()
                 WHERE id = ? AND estado = 'pendiente'`,
                [estado, texto, JSON.stringify(ajusteStock), userId, id]
            );
            if (!upd || upd.affectedRows === 0) {
                throw _httpError('La discrepancia ya no está pendiente', 409, { code: 'NO_PENDIENTE' });
            }

            await conn.commit();
            return resultado;
        } catch (err) {
            await conn.rollback();
            let e = err;
            if (_esFaltaColumna(err, /diferencia_aplicada/)) e = _migracionPendiente(130, 'diferencia_aplicada');
            else if (_esFaltaColumna(err, /ajuste_stock/)) e = _migracionPendiente(129, 'ajuste_stock');
            else if (_esBloqueoConcurrente(err)) e = _reintentar();
            // Simulando, lo que en real sería un 409 se devuelve como `bloqueo` (la pantalla lo muestra antes de pedir
            // confirmación). 400/404 y los errores reales siguen saliendo como error. REINTENTAR tampoco es un bloqueo:
            // es pasajero (otra transacción tenía las filas) y bloquear «Confirmar» por eso no corresponde.
            if (simular && e && e.statusCode === 409 && e.code !== 'REINTENTAR') {
                return {
                    id: Number(id), estado, resolucion: null, ajustes: [], aviso: null,
                    transferencia_id: d ? d.transferencia_id : null, transferencia_codigo: trf ? (trf.codigo ?? null) : null,
                    item: null, simulado: true,
                    bloqueo: { code: e.code ?? null, message: e.message },
                };
            }
            throw e;
        } finally {
            conn.release();
        }
    },

    /**
     * APRUEBA lo declarado (dentro de la transacción de resolverDiscrepancia; la discrepancia y la transferencia
     * ya están bloqueadas). Devuelve { ajustes, aviso } del motor _aplicarPlanStock (simular → sin escribir).
     */
    async _aprobarDiferencia(conn, { d, trf, enviada, recibida, dif, nota, userId, simular = false, regimenRehecha = null, recepcionReglaAnterior = false }) {
        const itemId = d.item_id;
        const itemRow = await this._itemRowDe(conn, trf.id, itemId);
        const origen = _origenPrimario(itemRow, trf);
        const destino = _normalizeUbicacion(trf.destino_obra_id, trf.destino_bodega_id);
        const plan = [];          // { ubic, delta, estricto?, esDestino? } en orden lógico (origen → destino)
        const splitUpdates = [];  // { id, take } — take negativo = devolver al split
        const avisos = [];

        if (dif > 0) {
            // Sobrante aprobado: llegó de más → sale del origen primario (sin bajar de 0) y entra al destino.
            plan.push({ ubic: origen, delta: -dif });
            plan.push({ ubic: destino, delta: dif, esDestino: true });
        } else {
            // Faltante aprobado: esas unidades nunca llegaron → salen del destino y vuelven al origen, pero SOLO lo
            // que de verdad salió de él de más (revisión 2026-10-21): recibir() sube cantidad_decrementada aunque el
            // GREATEST recorte cuando el origen no tenía stock, así que devolver f a ciegas crearía stock.
            const f = -dif;
            const { salido, porUbic } = await this._salidoDelOrigen(conn, {
                trf, itemId, enviada, recibida, destino, regimenRehecha,
                recepcionReglaAnterior: recepcionReglaAnterior || !_esReglaNueva(d.diferencia_aplicada),
            });
            const vuelve = _r4(Math.min(f, Math.max(0, salido - recibida)));
            // Con kardex, a cada ubicación vuelve como máximo lo que salió de ella (un split que no tenía stock no
            // gana unidades que nunca perdió). Sin kardex completo (legacy / anterior al kardex / un viaje sin kardex)
            // no hay tope por ubicación.
            const cupo = (u) => (porUbic ? Math.max(0, porUbic.get(_ubicKey(u)) || 0) : Infinity);
            const usar = (u, n) => { if (porUbic) porUbic.set(_ubicKey(u), _r4((porUbic.get(_ubicKey(u)) || 0) - n)); };
            let resto = vuelve;
            if (itemRow && resto > 0) {
                const splits = await this._splitsDe(conn, itemRow.id);
                // Orden INVERSO al FIFO de recibir(): el último split que se consumió es el primero en recibir.
                for (const s of [...splits].reverse()) {
                    if (resto <= 0) break;
                    const ubicSplit = _normalizeUbicacion(s.origen_obra_id, s.origen_bodega_id);
                    const give = _r4(Math.min(resto, _r4(s.cantidad_decrementada), cupo(ubicSplit)));
                    if (give <= 0) continue;
                    plan.push({ ubic: ubicSplit, delta: give });
                    splitUpdates.push({ id: s.id, take: -give });
                    usar(ubicSplit, give);
                    resto = _r4(resto - give);
                }
            }
            // El resto, al origen primario (recibir() descuenta ahí lo que los splits no cubren).
            if (resto > 0) plan.push({ ubic: origen, delta: resto });
            plan.push({ ubic: destino, delta: -f, estricto: true, esDestino: true });
            if (vuelve < f) {
                const salieron = `${Number(salido) === 1 ? 'salió' : 'salieron'} ${_fmtCant(salido)} ${_deLas(enviada)} ${Number(enviada) === 1 ? 'enviada' : 'enviadas'}`;
                avisos.push(vuelve > 0
                    ? `Al origen ${Number(vuelve) === 1 ? 'vuelve' : 'vuelven'} solo ${_fmtCant(vuelve)} ${_deLas(f)} ${Number(f) === 1 ? 'unidad' : 'unidades'}: el origen no tenía esas unidades al despachar (${salieron}).`
                    : `Al origen no vuelve ${Number(f) === 1 ? 'la unidad' : `ninguna de las ${_unid(f)}`}: el origen no tenía esas unidades al despachar (${salieron}).`);
            }
        }

        const codigo = trf.codigo || `TRF #${trf.id}`;
        const lado = dif > 0 ? `sobrante ${_fmtCant(dif)}` : `faltante ${_fmtCant(-dif)}`;
        const motivo = `Diferencia aprobada ${codigo}: llegaron ${_fmtCant(recibida)} de ${_fmtCant(enviada)} enviados (${lado})`
            + (nota ? ` · ${nota}` : '');
        const r = await this._aplicarPlanStock(conn, { itemId, itemRow, trf, plan, splitUpdates, motivo, userId, simular });
        const avisoStock = _avisoSinStock(r.sinStock);
        if (avisoStock) avisos.push(avisoStock);
        return { ajustes: r.ajustes, aviso: avisos.length ? avisos.join(' ') : null };
    },

    /**
     * Rehace con la regla nueva una diferencia de la regla ANTERIOR (diferencia_aplicada = 1: recibir() aplicó lo
     * declarado al stock). Deja el stock como si la recepción hubiera traído lo ENVIADO y reabre la fila
     * (estado 'pendiente', diferencia_aplicada = 0, sin resolución) para aprobarla o rechazarla con la regla nueva.
     * La decisión anterior se conserva en `observacion` y el plan aplicado en ajuste_stock.rehecha.
     * Solo Super Administrador (lo exige la ruta). `simular` = calcula el plan con los mismos bloqueos y validaciones
     * y hace rollback: no escribe nada.
     *
     *   dif = recibida − enviada.
     *   · Régimen NUEVO (stock_reconciliado TRUE y con eventos en transferencia_recepciones): recibir() sacó del
     *     origen lo RECIBIDO (FIFO por splits; lo de más, del origen primario sin bajar de 0) y sumó lo recibido al
     *     destino.
     *       sobrante: destino −dif (si no alcanza, baja hasta 0 y el aviso dice cuántas no se pudieron quitar —
     *                 revisión 2026-10-21: antes era 409; el Super Admin lo ve antes en la simulación); al origen
     *                 primario vuelve lo que recibir() le sacó por sobre lo enviado, POR UBICACIÓN: min(dif, max(0,
     *                 salidas del kardex en el origen primario − Σ cantidad_decrementada de los splits de esa
     *                 ubicación − lo que los splits no cubren de la enviada)). Si parte de la recepción no tiene kardex
     *                 (_descontadoDelOrigen: lo recibido sin 'transferencia_entrada' se asume descontado completo),
     *                 regla global: min(dif, max(0, salidas − enviada)).
     *       faltante: origen −f (saldos de los splits FIFO subiendo cantidad_decrementada; el resto del origen
     *                 primario; sin bajar de 0, con aviso) y destino +f.
     *   · Régimen ANTERIOR (stock_reconciliado FALSE o recibida sin eventos de recepción): el origen descontó lo
     *     ENVIADO (al aprobar o al recibir) y el destino sumó lo recibido → sobrante: destino −dif; faltante:
     *     destino +f. El origen no se toca.
     *   Kardex tipo 'discrepancia', motivo «Rehecha con la regla nueva (21-oct): …».
     *   No se rehace (409) una fila que ya es de la regla nueva (YA_REGLA_NUEVA) ni una resuelta con el modelo de
     *   causas (mig 129) que ya ajustó el stock (CON_AJUSTE): el kardex de la recepción no ve ese ajuste y se
     *   ajustaría dos veces.
     *   Aviso (también simulando) si después de la recepción alguien ajustó el ítem a mano en el origen o el destino
     *   (kardex 'ajuste_manual' o 'discrepancia' que no viene de una transferencia): puede que ya esté corregido
     *   (_ajustesPosteriores). Deadlock / lock wait con otra transacción → 409 REINTENTAR (también simulando).
     *
     * @returns {{ id, transferencia_id, transferencia_codigo, item, enviada, recibida, dif, regimen: 'nuevo'|'anterior',
     *             ajustes: Array<{ubicacion_nombre, obra_id, bodega_id, antes, despues, cantidad}>, aviso,
     *             estado_anterior, simulado }}
     */
    async rehacerDiscrepancia(id, userId, { simular = false } = {}) {
        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();

            const [discRows] = await conn.query(
                `SELECT id, transferencia_id, item_id, cantidad_enviada, cantidad_recibida, estado, resolucion, observacion,
                        diferencia_aplicada, causa, ajuste_stock
                 FROM transferencia_discrepancias WHERE id = ? FOR UPDATE`,
                [id]
            );
            if (!discRows.length) throw _httpError('Discrepancia no encontrada', 404);
            const d = discRows[0];
            if (_esReglaNueva(d.diferencia_aplicada)) {
                throw _httpError('Esta diferencia ya está con la regla nueva: no hay nada que rehacer', 409, { code: 'YA_REGLA_NUEVA' });
            }
            if ((d.causa != null && d.causa !== '') || _ajusteMovioStock(_parseAjusteStock(d.ajuste_stock))) {
                throw _httpError(
                    'Esta diferencia ya se resolvió eligiendo una causa y eso ajustó el stock: no se puede rehacer sola. Ajústala a mano.',
                    409, { code: 'CON_AJUSTE' }
                );
            }

            const trf = await this._trfDeDiscrepancia(conn, d.transferencia_id);
            // Régimen anterior (revisión 2026-10-21): FALSE explícito (aprobadas antes de Ola 2) o recibida SIN eventos
            // de recepción. La mig 036 dejó TRUE por defecto a las que ya estaban 'recibida', pero a esas el origen les
            // descontó lo ENVIADO; la tabla transferencia_recepciones (mig 048, sin backfill) lo delata.
            let anterior = trf.stock_reconciliado === 0 || trf.stock_reconciliado === false;
            if (!anterior) anterior = !(await this._tieneEventosRecepcion(conn, trf.id));
            const regimen = anterior ? 'anterior' : 'nuevo';

            const itemId = d.item_id;
            const itemRow = await this._itemRowDe(conn, trf.id, itemId);
            const enviada = _r4(d.cantidad_enviada);
            const recibida = _r4(d.cantidad_recibida);
            const dif = _r4(recibida - enviada);
            const destino = _normalizeUbicacion(trf.destino_obra_id, trf.destino_bodega_id);
            // Solo para listar dónde revisar ajustes posteriores; el plan usa _origenPrimario (400 si no hay origen).
            const origenConocido = _ubicSegura(itemRow?.origen_obra_id ?? trf.origen_obra_id, itemRow?.origen_bodega_id ?? trf.origen_bodega_id);
            const splits = itemRow ? await this._splitsDe(conn, itemRow.id) : [];
            const plan = [];
            const splitUpdates = [];
            const avisos = [];

            if (dif > 0) {
                if (!anterior) {
                    const k = await this._descontadoDelOrigen(conn, trf.id, itemId, recibida);
                    let extraTomado;
                    if (k.sinKardex > 0 || !origenConocido) {
                        // Parte de la recepción es anterior al kardex (no se sabe de qué ubicación salió): regla global.
                        extraTomado = _r4(Math.min(dif, Math.max(0, k.descontado - enviada)));
                    } else {
                        // Por ubicación (revisión 2026-10-21): recibir() sacó lo enviado FIFO de los splits y lo de más
                        // del origen primario. Lo de más que de verdad salió = salidas del kardex en el origen primario −
                        // lo que descontaron los splits de esa misma ubicación (y, si los splits no cubren la enviada,
                        // ese resto, que recibir() también sacó de ahí). Así un split corto en OTRA ubicación no se come
                        // lo que sí salió del origen primario.
                        const keyOrigen = _ubicKey(origenConocido);
                        let decEnOrigen = 0;
                        let decTotal = 0;
                        for (const s of splits) {
                            const dS = _r4(s.cantidad_decrementada);
                            decTotal = _r4(decTotal + dS);
                            const u = _ubicSegura(s.origen_obra_id, s.origen_bodega_id);
                            if (u && _ubicKey(u) === keyOrigen) decEnOrigen = _r4(decEnOrigen + dS);
                        }
                        const base = _r4(decEnOrigen + Math.max(0, enviada - decTotal));
                        extraTomado = _r4(Math.min(dif, Math.max(0, (k.salidaPorUbic.get(keyOrigen) || 0) - base)));
                    }
                    if (extraTomado > 0) plan.push({ ubic: _origenPrimario(itemRow, trf), delta: extraTomado });
                    // Lo enviado que no salió (el origen no lo tenía): todo lo salido menos lo de más.
                    const sinRespaldo = _r4(enviada - (k.descontado - extraTomado));
                    if (sinRespaldo > 0) {
                        avisos.push(`Al recibir, el origen no tenía todo lo enviado: ${_unid(sinRespaldo)} ${Number(sinRespaldo) === 1 ? 'salió' : 'salieron'} sin respaldo (quedó en 0). Revisa su stock.`);
                    }
                    if (k.sinKardex > 0) avisos.push('Recepción anterior al kardex: se asumió que el origen descontó todo lo recibido.');
                }
                // Sin `estricto` (revisión 2026-10-21): si el destino ya no tiene esas unidades baja hasta 0 y el aviso
                // dice cuántas no se pudieron quitar. Solo lo hace un Super Admin, que lo ve antes en la simulación.
                plan.push({ ubic: destino, delta: -dif, esDestino: true });
            } else if (dif < 0) {
                const f = -dif;
                if (!anterior) {
                    let resto = f;
                    for (const s of splits) {
                        if (resto <= 0) break;
                        const saldo = _r4((Number(s.cantidad_enviada) || 0) - (Number(s.cantidad_decrementada) || 0));
                        if (saldo <= 0) continue;
                        const take = _r4(Math.min(resto, saldo));
                        plan.push({ ubic: _normalizeUbicacion(s.origen_obra_id, s.origen_bodega_id), delta: -take });
                        splitUpdates.push({ id: s.id, take });
                        resto = _r4(resto - take);
                    }
                    // Sin splits (TRF anteriores a la mig 032) o saldos que no alcanzan → origen primario, como recibir().
                    if (resto > 0) plan.push({ ubic: _origenPrimario(itemRow, trf), delta: -resto });
                }
                plan.push({ ubic: destino, delta: f, esDestino: true });
            }

            const codigo = trf.codigo || `TRF #${trf.id}`;
            const motivo = `Rehecha con la regla nueva (21-oct): ${codigo}, llegaron ${_fmtCant(recibida)} de ${_fmtCant(enviada)} enviados; el stock queda con lo enviado`;
            const r = await this._aplicarPlanStock(conn, { itemId, itemRow, trf, plan, splitUpdates, motivo, userId, simular });
            const avisoStock = _avisoSinStock(r.sinStock);
            if (avisoStock) avisos.push(avisoStock);
            // ¿Alguien ajustó el ítem a mano en el origen o el destino después de la recepción? Puede que ya lo corrigiera.
            const avisoPosterior = await this._ajustesPosteriores(conn, {
                trf, itemId,
                ubics: [origenConocido, ...splits.map(s => _ubicSegura(s.origen_obra_id, s.origen_bodega_id)), destino].filter(Boolean),
            });
            if (avisoPosterior) avisos.push(avisoPosterior);
            const aviso = avisos.length ? avisos.join(' ') : null;

            const resultado = {
                id: Number(id),
                transferencia_id: trf.id,
                transferencia_codigo: trf.codigo ?? null,
                item: await this._itemInfo(conn, itemId),
                enviada, recibida, dif, regimen,
                ajustes: r.ajustes,
                aviso,
                estado_anterior: d.estado,
                simulado: !!simular,
            };

            if (simular) {
                await conn.rollback();
                return resultado;
            }

            const notaAnterior = d.estado !== 'pendiente'
                ? `Resolución anterior (regla antigua): ${d.estado} · ${d.resolucion || 'sin nota'}`
                : null;
            const observacion = [d.observacion, notaAnterior].filter(Boolean).join('\n') || null;
            const ajusteStock = {
                ajustes: [], aviso: null,
                rehecha: {
                    fecha: new Date().toISOString(), usuario_id: userId, regimen,
                    estado_anterior: d.estado, resolucion_anterior: d.resolucion ?? null,
                    ajustes: r.ajustes, aviso,
                },
            };
            const [upd] = await conn.query(
                `UPDATE transferencia_discrepancias
                 SET estado = 'pendiente', diferencia_aplicada = 0, resolucion = NULL, resuelto_por = NULL,
                     fecha_resolucion = NULL, observacion = ?, ajuste_stock = ?
                 WHERE id = ? AND NOT (diferencia_aplicada <=> 0)`,
                [observacion, JSON.stringify(ajusteStock), id]
            );
            if (!upd || upd.affectedRows === 0) {
                throw _httpError('Esta diferencia ya está con la regla nueva: no hay nada que rehacer', 409, { code: 'YA_REGLA_NUEVA' });
            }

            await conn.commit();
            return resultado;
        } catch (err) {
            await conn.rollback();
            if (_esFaltaColumna(err, /diferencia_aplicada/)) throw _migracionPendiente(130, 'diferencia_aplicada');
            if (_esFaltaColumna(err, /causa|ajuste_stock/)) throw _migracionPendiente(129, 'ajuste_stock');
            // Simulando o no: es pasajero, se reintenta (no es un plan imposible).
            if (_esBloqueoConcurrente(err)) throw _reintentar();
            throw err;
        } finally {
            conn.release();
        }
    },

    /** Transferencia de una discrepancia, bloqueada (FOR UPDATE). 404 si no existe. */
    async _trfDeDiscrepancia(conn, trfId) {
        const [rows] = await conn.query(
            `SELECT id, codigo, stock_reconciliado, origen_obra_id, origen_bodega_id, destino_obra_id, destino_bodega_id, fecha_recepcion
             FROM transferencias WHERE id = ? FOR UPDATE`,
            [trfId]
        );
        if (!rows || !rows.length) throw _httpError('Transferencia de la discrepancia no encontrada', 404);
        return rows[0];
    },

    /** Fila de transferencia_items del ítem (DESC: recibir() arma su mapa por item_id y se queda con la ÚLTIMA). */
    async _itemRowDe(conn, trfId, itemId) {
        const [rows] = await conn.query(
            `SELECT id, origen_obra_id, origen_bodega_id FROM transferencia_items
             WHERE transferencia_id = ? AND item_id = ? ORDER BY id DESC LIMIT 1`,
            [trfId, itemId]
        );
        return (rows && rows[0]) || null;
    },

    /** Splits (transferencia_item_origenes) del ítem, en orden FIFO, bloqueados (FOR UPDATE). */
    async _splitsDe(conn, trfItemId) {
        const [rows] = await conn.query(
            `SELECT id, origen_obra_id, origen_bodega_id, cantidad_enviada, cantidad_decrementada
             FROM transferencia_item_origenes
             WHERE transferencia_item_id = ?
             ORDER BY id ASC FOR UPDATE`,
            [trfItemId]
        );
        return Array.isArray(rows) ? rows : [];
    },

    /** { id, descripcion, nro_item, unidad } del ítem para las respuestas y el log ({ id } si no está). */
    async _itemInfo(conn, itemId) {
        const [rows] = await conn.query('SELECT id, descripcion, nro_item, unidad FROM items_inventario WHERE id = ?', [itemId]);
        const it = (rows && rows[0]) || null;
        return it
            ? { id: it.id, descripcion: it.descripcion ?? null, nro_item: it.nro_item ?? null, unidad: it.unidad ?? null }
            : { id: itemId };
    },

    /**
     * Filas del kardex de (transferencia, ítem): las 'transferencia_salida'/'transferencia_entrada' de recibir() y las
     * 'discrepancia' de aprobar/rehacer sus diferencias. Base de _salidoDelOrigen y _descontadoDelOrigen.
     */
    async _kardexDeTrfItem(conn, trfId, itemId) {
        const [rows] = await conn.query(
            `SELECT tipo, obra_id, bodega_id, cantidad_anterior, cantidad_nueva
             FROM stock_movimientos
             WHERE referencia_tipo = 'transferencia' AND referencia_id = ? AND item_id = ?`,
            [trfId, itemId]
        );
        return Array.isArray(rows) ? rows : [];
    },

    /**
     * Cuánto salió DE VERDAD del origen por (transferencia, ítem), para aprobar un faltante (revisión 2026-10-21):
     * Σ(cantidad_anterior − cantidad_nueva) del kardex con referencia esta TRF y este ítem, en ubicaciones distintas
     * del destino — 'transferencia_salida' de recibir() y 'discrepancia' de rehacer en el origen (devolver resta).
     *   · Legacy (stock_reconciliado FALSE) o fila rehecha en régimen 'anterior': el origen descontó lo ENVIADO fuera
     *     del kardex por viaje (al aprobar, o al recibir antes de los eventos de recepción) → enviada + lo demás.
     *   · Kardex PARCIAL (un viaje anterior al kardex, 2026-05-26, y otro después), igual que _descontadoDelOrigen:
     *     lo que recibir() llevó al destino sin 'transferencia_entrada' se asume salido completo del origen:
     *       sinKardex = max(0, movidoAlDestino − Σ entradas), con movidoAlDestino = enviada (regla nueva: recibir()
     *       mueve lo enviado) o recibida si la recepción fue de la regla anterior (fila rehecha o sin rehacer: esa
     *       regla movía lo declarado).
     *     Sin ningún kardex de la recepción, sinKardex = todo lo movido (enviada, o recibida si se rehízo en régimen
     *     nuevo, como antes). Con entrada completa y sin salida, el origen estaba en 0 al despachar: salió 0.
     * @param {object} p
     * @param {boolean} [p.recepcionReglaAnterior] la recepción fue de la regla anterior (movió lo recibido)
     * @returns {{ salido: number, porUbic: Map<string, number>|null, sinKardex: number }} porUbic = lo salido por
     *          ubicación (clave _ubicKey), solo si todo lo salido está en el kardex; null si parte es supuesto
     *          (legacy / sin kardex / kardex parcial: no se sabe de qué ubicación salió esa parte).
     */
    async _salidoDelOrigen(conn, { trf, itemId, enviada, recibida, destino, regimenRehecha = null, recepcionReglaAnterior = false }) {
        const rows = await this._kardexDeTrfItem(conn, trf.id, itemId);
        const destKey = _ubicKey(destino);
        const porUbic = new Map();
        let salida = 0;
        let entrada = 0;
        let otros = 0;
        for (const m of rows) {
            const key = _ubicKey(_ubicDeFila(m));
            if (key === destKey) {
                if (m.tipo === 'transferencia_entrada') entrada = _r4(entrada + Number(m.cantidad_nueva) - Number(m.cantidad_anterior));
                continue;
            }
            const sale = _r4(Number(m.cantidad_anterior) - Number(m.cantidad_nueva));
            porUbic.set(key, _r4((porUbic.get(key) || 0) + sale));
            if (m.tipo === 'transferencia_salida') salida = _r4(salida + sale); else otros = _r4(otros + sale);
        }
        const legacy = trf.stock_reconciliado === 0 || trf.stock_reconciliado === false;
        if (legacy || regimenRehecha === 'anterior') return { salido: _r4(enviada + otros), porUbic: null, sinKardex: 0 };
        const movidoAlDestino = recepcionReglaAnterior ? recibida : enviada;
        const sinKardex = _r4(Math.max(0, movidoAlDestino - entrada));
        return { salido: _r4(salida + sinKardex + otros), porUbic: sinKardex > 0 ? null : porUbic, sinKardex };
    },

    /**
     * Rehacer (revisión 2026-10-21): ¿alguien ajustó el ítem a mano en estas ubicaciones después de la recepción?
     * Kardex 'ajuste_manual' o 'discrepancia' desde transferencias.fecha_recepcion, que NO venga de una transferencia
     * (referencia_tipo 'transferencia'): ni de esta TRF ni de OTRAS — aprobar o rehacer la diferencia de otra TRF en la
     * misma ubicación mueve el stock, pero no corrige esta, y el aviso dice «puede que ya esté corregido». Sí cuentan
     * los ajustes a mano y las 'discrepancia' de otros orígenes (p. ej. referencia 'discrepancia' de un conteo).
     * Devuelve el aviso «Hubo ajustes manuales después: <fecha> <ubicación> a→b (<usuario>); …» o null (máx. 5 en
     * el texto).
     */
    async _ajustesPosteriores(conn, { trf, itemId, ubics }) {
        if (!trf.fecha_recepcion || !Array.isArray(ubics) || !ubics.length) return null;
        const unicas = [...new Map(ubics.map(u => [_ubicKey(u), u])).values()];
        const [rows] = await conn.query(
            `SELECT m.created_at, m.obra_id, m.bodega_id, m.cantidad_anterior, m.cantidad_nueva, u.nombre AS usuario_nombre
             FROM stock_movimientos m
             LEFT JOIN usuarios u ON u.id = m.usuario_id
             WHERE m.item_id = ? AND m.tipo IN ('ajuste_manual', 'discrepancia')
               AND m.created_at >= ?
               AND NOT (m.referencia_tipo <=> 'transferencia')
               AND (${unicas.map(() => '(m.obra_id <=> ? AND m.bodega_id <=> ?)').join(' OR ')})
             ORDER BY m.created_at, m.id
             LIMIT 50`,
            [itemId, trf.fecha_recepcion, ...unicas.flatMap(u => [u.obra, u.bodega])]
        );
        const lista = Array.isArray(rows) ? rows : [];
        if (!lista.length) return null;
        const nombre = await this._nombresUbicaciones(conn, lista.map(_ubicDeFila));
        const partes = lista.slice(0, 5).map(m =>
            `${_fmtFecha(m.created_at)} ${nombre(_ubicDeFila(m)) || 'ubicación'} ${_fmtCant(m.cantidad_anterior)}→${_fmtCant(m.cantidad_nueva)}`
            + (m.usuario_nombre ? ` (${m.usuario_nombre})` : '')
        );
        const mas = lista.length > 5 ? ` y ${lista.length - 5} más` : '';
        return `Hubo ajustes manuales después: ${partes.join('; ')}${mas}. Puede que ya esté corregido: revísalo antes de rehacer.`;
    },

    /**
     * Motor de ajuste de stock de una diferencia (aprobar / rehacer), dentro de la transacción del llamador.
     *   plan: [{ ubic, delta, estricto?, esDestino? }] — se fusiona por ubicación.
     *   · Bloquea las filas de ubicaciones_stock tocadas con FOR UPDATE en orden estable (evita deadlocks).
     *   · Valida TODO antes de escribir: un delta negativo que la fila no cubre es 409 DESTINO_SIN_STOCK si es
     *     `estricto` («<ubicación> ya no tiene esas f unidades (hoy tiene M): ajústalo a mano»), o se recorta a lo
     *     que hay (queda en 0) y se informa en `sinStock`.
     *   · simular → no escribe nada (ni stock, ni kardex, ni splits).
     *   · Escribe: UPDATE GREATEST / INSERT … ON DUPLICATE (fila nueva del destino copia el valor_arriendo_override
     *     del origen, como recibir()), kardex tipo 'discrepancia' (referencia 'transferencia' = id de la TRF) y los
     *     cantidad_decrementada de los splits (take negativo = devolver).
     * @returns {{ ajustes: Array<{ubicacion_nombre, obra_id, bodega_id, antes, despues, cantidad}>,
     *             sinStock: Array<{ nombre, faltan, pedido }> }}
     */
    async _aplicarPlanStock(conn, { itemId, itemRow, trf, plan, splitUpdates = [], motivo, userId, simular = false }) {
        // Una operación por ubicación (el origen primario suele coincidir con un split).
        const ops = [];
        const porUbic = new Map();
        for (const p of plan) {
            const key = _ubicKey(p.ubic);
            let op = porUbic.get(key);
            if (!op) { op = { ubic: p.ubic, delta: 0, estricto: false, esDestino: false }; porUbic.set(key, op); ops.push(op); }
            op.delta = _r4(op.delta + p.delta);
            op.estricto = op.estricto || !!p.estricto;
            op.esDestino = op.esDestino || !!p.esDestino;
        }
        const activos = ops.filter(o => o.delta !== 0);

        // Bloquear y leer las filas de stock en orden estable.
        const aBloquear = [...activos].sort((a, b) => _ubicKey(a.ubic).localeCompare(_ubicKey(b.ubic)));
        for (const op of aBloquear) {
            const [rows] = await conn.query(
                `SELECT cantidad FROM ubicaciones_stock
                 WHERE item_id = ? AND obra_id <=> ? AND bodega_id <=> ? FOR UPDATE`,
                [itemId, op.ubic.obra, op.ubic.bodega]
            );
            op.existe = Array.isArray(rows) && rows.length > 0;
            op.prev = op.existe ? _r4(rows[0].cantidad) : 0;
        }

        // Nombres ANTES de validar: el 409 nombra la ubicación.
        const nombre = activos.length ? await this._nombresUbicaciones(conn, activos.map(o => o.ubic)) : () => null;
        activos.forEach(o => { o.nombre = nombre(o.ubic); });

        // Validar y decidir TODO antes de escribir (el 409 no deja nada a medias).
        const sinStock = [];
        for (const op of activos) {
            op.aplicado = op.delta;
            if (op.delta < 0 && op.prev < -op.delta) {
                if (op.estricto) {
                    throw _httpError(
                        `${op.nombre || (op.esDestino ? 'El destino' : 'La ubicación')} ya no tiene esas ${_fmtCant(-op.delta)} unidades (hoy tiene ${_fmtCant(op.prev)}): ajústalo a mano`,
                        409, { code: 'DESTINO_SIN_STOCK' }
                    );
                }
                sinStock.push({ nombre: op.nombre, faltan: _r4(-op.delta - op.prev), pedido: _r4(-op.delta), esDestino: op.esDestino });
                op.aplicado = _r4(-op.prev);
            }
            op.nueva = _r4(op.prev + op.aplicado);
        }
        const aplicados = activos.filter(o => o.aplicado !== 0);

        if (!simular) {
            const motivo255 = String(motivo || '').slice(0, 255);
            for (const op of aplicados) {
                if (op.aplicado < 0) {
                    await conn.query(
                        `UPDATE ubicaciones_stock SET cantidad = GREATEST(cantidad - ?, 0)
                         WHERE item_id = ? AND obra_id <=> ? AND bodega_id <=> ?`,
                        [-op.aplicado, itemId, op.ubic.obra, op.ubic.bodega]
                    );
                } else {
                    let override = null;
                    if (op.esDestino && !op.existe) override = await this._overrideOrigen(conn, itemId, itemRow, trf);
                    await conn.query(
                        `INSERT INTO ubicaciones_stock (item_id, obra_id, bodega_id, cantidad, valor_arriendo_override)
                         VALUES (?, ?, ?, ?, ?)
                         ON DUPLICATE KEY UPDATE cantidad = cantidad + VALUES(cantidad)`,
                        [itemId, op.ubic.obra, op.ubic.bodega, op.aplicado, override]
                    );
                }
                await registrarMovimiento(conn, {
                    item_id: itemId, obra_id: op.ubic.obra, bodega_id: op.ubic.bodega,
                    tipo: 'discrepancia', cantidad_anterior: op.prev, cantidad_nueva: op.nueva,
                    referencia_tipo: 'transferencia', referencia_id: trf.id,
                    motivo: motivo255, usuario_id: userId,
                });
            }
            // El saldo de los splits queda contabilizado aunque el origen no alcanzara (igual que recibir()).
            for (const s of splitUpdates) {
                await conn.query(
                    'UPDATE transferencia_item_origenes SET cantidad_decrementada = cantidad_decrementada + ? WHERE id = ?',
                    [s.take, s.id]
                );
            }
        }

        const ajustes = aplicados.map(o => ({
            ubicacion_nombre: o.nombre, obra_id: o.ubic.obra, bodega_id: o.ubic.bodega,
            antes: o.prev, despues: o.nueva, cantidad: o.aplicado,
        }));
        return { ajustes, sinStock };
    },

    /** ¿La transferencia tiene eventos de recepción (régimen nuevo, mig 048)? Sin la tabla: no. */
    async _tieneEventosRecepcion(conn, trfId) {
        try {
            const [rows] = await conn.query('SELECT 1 FROM transferencia_recepciones WHERE transferencia_id = ? LIMIT 1', [trfId]);
            return Array.isArray(rows) && rows.length > 0;
        } catch (err) {
            if (err && err.errno === 1146) return false;
            throw err;
        }
    },

    /**
     * Cuánto descontó recibir() (regla anterior) del origen para (transferencia, ítem), según el kardex: suma de
     * (anterior − nueva) de sus 'transferencia_salida'. Lo recibido sin 'transferencia_entrada' en el kardex
     * (recepciones anteriores al kardex, 2026-05-26) se asume descontado completo — la regla anterior descontaba
     * lo recibido —, y se informa en `sinKardex`. Detectar por la entrada (no por la salida) evita confundir «sin
     * kardex» con «el origen estaba en 0» (registrarMovimiento no registra deltas 0).
     * `salidaPorUbic` = las salidas del kardex por ubicación (clave _ubicKey), para el sobrante de rehacer.
     * @returns {{ descontado: number, sinKardex: number, salidaPorUbic: Map<string, number> }}
     */
    async _descontadoDelOrigen(conn, trfId, itemId, recibida) {
        const rows = await this._kardexDeTrfItem(conn, trfId, itemId);
        let salida = 0;
        let entrada = 0;
        const salidaPorUbic = new Map();
        for (const m of rows) {
            if (m.tipo === 'transferencia_salida') {
                const sale = _r4(Number(m.cantidad_anterior) - Number(m.cantidad_nueva));
                const key = _ubicKey(_ubicDeFila(m));
                salidaPorUbic.set(key, _r4((salidaPorUbic.get(key) || 0) + sale));
                salida = _r4(salida + sale);
            } else if (m.tipo === 'transferencia_entrada') {
                entrada = _r4(entrada + Number(m.cantidad_nueva) - Number(m.cantidad_anterior));
            }
        }
        const sinKardex = _r4(Math.max(0, recibida - entrada));
        return { descontado: _r4(salida + sinKardex), sinKardex, salidaPorUbic };
    },

    /** valor_arriendo_override del origen primario del ítem (null si no hay origen o no tiene). */
    async _overrideOrigen(conn, itemId, itemRow, trf) {
        let origen;
        try { origen = _origenPrimario(itemRow, trf); } catch (_) { return null; }
        const [rows] = await conn.query(
            `SELECT valor_arriendo_override FROM ubicaciones_stock
             WHERE item_id = ? AND obra_id <=> ? AND bodega_id <=> ?`,
            [itemId, origen.obra, origen.bodega]
        );
        return (rows && rows[0] && rows[0].valor_arriendo_override) ?? null;
    },

    /**
     * Para GET /discrepancias: por diferencia, nombre y stock ACTUAL del origen primario (última fila de
     * transferencia_items del ítem ?? cabecera) y del destino. Dos queries para toda la página + nombres.
     * Devuelve (t, d) → { origen_nombre, destino_nombre, origen_stock_actual, destino_stock_actual }
     * (stock sin fila = 0; ubicación indeterminable = null).
     */
    async _ubicacionesDiscrepancias(trfRows, discRows) {
        const vacio = { origen_nombre: null, destino_nombre: null, origen_stock_actual: null, destino_stock_actual: null };
        if (!discRows.length) return () => ({ ...vacio });
        const trfIds = trfRows.map(t => t.id);
        const itemIds = [...new Set(discRows.map(d => d.item_id).filter(x => x != null))];

        const [tiRows] = await db.query(
            `SELECT ti.transferencia_id, ti.item_id, ti.origen_obra_id, ti.origen_bodega_id
             FROM transferencia_items ti
             JOIN (SELECT MAX(id) AS id FROM transferencia_items WHERE transferencia_id IN (?)
                   GROUP BY transferencia_id, item_id) ult ON ult.id = ti.id`,
            [trfIds]
        );
        const itemRowDe = new Map();
        (Array.isArray(tiRows) ? tiRows : []).forEach(r => itemRowDe.set(`${r.transferencia_id}|${r.item_id}`, r));

        const [stockRows] = itemIds.length
            ? await db.query('SELECT item_id, obra_id, bodega_id, cantidad FROM ubicaciones_stock WHERE item_id IN (?)', [itemIds])
            : [[]];
        const stock = new Map();
        (Array.isArray(stockRows) ? stockRows : []).forEach(r => {
            const u = { obra: r.obra_id != null ? Number(r.obra_id) : null, bodega: r.bodega_id != null ? Number(r.bodega_id) : null };
            stock.set(`${r.item_id}#${_ubicKey(u)}`, _r4(r.cantidad));
        });

        const trfById = new Map(trfRows.map(t => [t.id, t]));
        const ubicDeDisc = new Map();
        const ubics = [];
        const seguro = (fn) => { try { return fn(); } catch (_) { return null; } };
        for (const d of discRows) {
            const t = trfById.get(d.transferencia_id);
            if (!t) continue;
            const o = seguro(() => _origenPrimario(itemRowDe.get(`${d.transferencia_id}|${d.item_id}`), t));
            const de = seguro(() => _normalizeUbicacion(t.destino_obra_id, t.destino_bodega_id));
            ubicDeDisc.set(d, { o, de });
            if (o) ubics.push(o);
            if (de) ubics.push(de);
        }
        const nombre = ubics.length ? await this._nombresUbicaciones(db, ubics) : () => null;

        return (t, d) => {
            const x = ubicDeDisc.get(d);
            if (!x) return { ...vacio };
            const cant = (u) => (u ? (stock.get(`${d.item_id}#${_ubicKey(u)}`) ?? 0) : null);
            return {
                origen_nombre: x.o ? nombre(x.o) : null,
                destino_nombre: x.de ? nombre(x.de) : null,
                origen_stock_actual: cant(x.o),
                destino_stock_actual: cant(x.de),
            };
        };
    },

    /**
     * Resuelve nombres de obra/bodega para `ajustes[].ubicacion_nombre`, avisos y origen/destino_nombre. Devuelve
     * ubic → nombre|null. Bodega con responsable: «nombre (responsable)», igual que formatBodegaNombreResponsable
     * del frontend (utils/formatBodega.ts).
     */
    async _nombresUbicaciones(conn, ubics) {
        const obraIds = [...new Set(ubics.map(u => u.obra).filter(Boolean))];
        const bodegaIds = [...new Set(ubics.map(u => u.bodega).filter(Boolean))];
        const obras = new Map();
        const bodegas = new Map();
        if (obraIds.length) {
            const [rows] = await conn.query('SELECT id, nombre FROM obras WHERE id IN (?)', [obraIds]);
            (Array.isArray(rows) ? rows : []).forEach(r => obras.set(Number(r.id), r.nombre));
        }
        if (bodegaIds.length) {
            const [rows] = await conn.query('SELECT id, nombre, responsable_nombre FROM bodegas WHERE id IN (?)', [bodegaIds]);
            (Array.isArray(rows) ? rows : []).forEach(r => {
                const resp = typeof r.responsable_nombre === 'string' ? r.responsable_nombre.trim() : '';
                bodegas.set(Number(r.id), r.nombre ? (resp ? `${r.nombre} (${resp})` : r.nombre) : null);
            });
        }
        return (u) => (u.obra ? obras.get(u.obra) : bodegas.get(u.bodega)) ?? null;
    }
};

module.exports = transferenciaService;
