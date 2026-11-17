/**
 * Desvinculación / reactivación de trabajadores con causal e historial (plan Gestiones B4, mig 112).
 *
 * Reglas (docs/reglas/rrhh-trabajadores.md § Desvinculación con causal):
 *  - Desvincular y reactivar son TRANSACCIONALES (FOR UPDATE sobre el trabajador). Reemplazan al
 *    PUT genérico {activo, fecha_desvinculacion}, que index.js ya no acepta.
 *  - Causal obligatoria del catálogo cerrado (config/causalesDesvinculacion.js); las del art. 160,
 *    NO_PRESENTACION, RENDIMIENTO y OTRO exigen `detalle`.
 *  - Fecha: ≥ fecha_ingreso y ≤ hoy + 30 días.
 *  - Historial `trabajador_desvinculaciones`: una fila por baja; reactivar la CIERRA (reactivado_por/en),
 *    nunca la borra. Cada fila cerrada es un PERÍODO LABORAL anterior [fecha_ingreso_periodo,
 *    fecha_desvinculacion] con foto empresa/obra/cargo (mig 152).
 *  - Reactivar = REINGRESO (2026-11-17): pide fecha de ingreso nueva, posterior al último egreso;
 *    `trabajadores.fecha_ingreso` es siempre el inicio del período ACTUAL.
 *  - Marca `no_recontratar`: SOLO ADVIERTE (decisión del dueño 2026-09-10). Se conserva al reactivar
 *    salvo `quitar_marca_no_recontratar: true`.
 *  - `detalle` solo sale con `modo: 'completa'` (rutas gateadas por trabajadores.eliminar/.reactivar);
 *    `resumen` (oficina, trabajadores.ver) lleva nombre de causal; `terreno` (check-rut de solicitudes)
 *    solo fecha, artículo y marca.
 *  - Degradación (regla D-I): sin la mig 112 (errno 1146/1054) las lecturas devuelven null/[] y el
 *    guard de depurar no bloquea.
 *  - Logs: el logger global excluye estas rutas; acá se registra un log manual SIN `detalle`.
 */
const db = require('../config/db');
const { logManualActivity } = require('../middleware/logger');
const logger = require('../utils/logger-structured');
const { getCausal, seleccionables, labelCausal } = require('../config/causalesDesvinculacion');
const { hasCols } = require('../utils/schema');

const httpError = (msg, statusCode, extra = {}) => Object.assign(new Error(msg), { statusCode, ...extra });
const ERR_SIN_TABLA = new Set([1146, 1054]);
const esErrorEsquema = err => err && ERR_SIN_TABLA.has(err.errno);

const strOrNull = v => (v === undefined || v === null || String(v).trim() === '' ? null : String(v).trim());
const toBool = v => v === true || v === 1 || v === '1' || v === 'true';
/** Fecha (Date | 'YYYY-MM-DD…') → 'YYYY-MM-DD' en hora local (evita el corrimiento UTC de toISOString). */
function toYmd(v) {
    if (!v) return null;
    if (v instanceof Date) {
        const p = n => String(n).padStart(2, '0');
        return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`;
    }
    return String(v).slice(0, 10);
}
function hoyYmd() { return toYmd(new Date()); }
function sumarDias(ymd, dias) {
    const [y, m, d] = ymd.split('-').map(Number);
    const dt = new Date(y, m - 1, d + dias);
    return toYmd(dt);
}
const nombreCompleto = t => [t.apellido_paterno, t.apellido_materno, t.nombres].filter(Boolean).join(' ');

const SELECT_HIST = `
    SELECT d.id, d.trabajador_id, d.rut_normalized, d.nombre_snapshot, d.fecha_desvinculacion, d.fecha_ingreso_periodo, d.causal_codigo, d.detalle,
           d.no_recontratar, d.desvinculado_por, u1.nombre AS desvinculado_por_nombre, d.desvinculado_en,
           d.finiquito_documento_id, d.reactivado_por, u2.nombre AS reactivado_por_nombre, d.reactivado_en
      FROM trabajador_desvinculaciones d
      LEFT JOIN usuarios u1 ON u1.id = d.desvinculado_por
      LEFT JOIN usuarios u2 ON u2.id = d.reactivado_por`;
// Mig 152: + empresa del período (con quién tenía contrato al darlo de baja). El aviso del Art. 159 N°4
// cuenta por empleador, así que el reingreso y la revisión de la solicitud la muestran explícita.
const SELECT_HIST_FOTO = SELECT_HIST
    .replace(/d\.reactivado_en(\r?\n)/, 'd.reactivado_en, d.empresa_id, e.razon_social AS empresa_nombre$1')
    .replace('LEFT JOIN usuarios u2 ON u2.id = d.reactivado_por', 'LEFT JOIN usuarios u2 ON u2.id = d.reactivado_por LEFT JOIN empresas e ON e.id = d.empresa_id');

/** SELECT del historial con la empresa del período; sin la mig 152 (1054) repite sin ella. */
async function queryHist(conn, resto, params) {
    try {
        return await conn.query(`${SELECT_HIST_FOTO} ${resto}`, params);
    } catch (err) {
        if (!err || err.errno !== 1054) throw err;
        return conn.query(`${SELECT_HIST} ${resto}`, params);
    }
}

/**
 * Modo de proyección según los permisos del usuario (JWT `p`). Regla D-F del plan Gestiones:
 *   · eliminar/reactivar (oficina que desvincula) → 'completa' (incluye el `detalle` interno);
 *   · trabajadores.ver → 'resumen' (nombre de causal, sin detalle);
 *   · resto (terreno) → 'terreno' (fecha, artículo y marca).
 * Decisión del dueño 2026-09-11: el detalle también se muestra en los avisos de check-rut, pero solo a oficina.
 * @param {{minimo?: 'terreno'|'resumen'}} [opts] piso: el check-rut de oficina (gate trabajadores.crear) nunca baja de 'resumen'.
 */
function modoSegunPermisos(perms, { minimo = 'terreno' } = {}) {
    const p = Array.isArray(perms) ? perms : [];
    if (p.includes('trabajadores.eliminar') || p.includes('trabajadores.reactivar')) return 'completa';
    if (p.includes('trabajadores.ver') || minimo === 'resumen') return 'resumen';
    return 'terreno';
}

/** Proyección según quién mira. */
function proyectar(r, modo) {
    if (!r) return null;
    const c = getCausal(r.causal_codigo);
    const base = {
        fecha: toYmd(r.fecha_desvinculacion),
        articulo: c?.articulo ?? null,
        no_recontratar: toBool(r.no_recontratar),
        // Mig 113: la ficha pudo haberse depurado; el aviso muestra el nombre guardado al momento de la baja.
        trabajador_depurado: r.trabajador_id == null,
        nombre: r.nombre_snapshot ?? null,
    };
    if (modo === 'terreno') return base;
    const resumen = {
        ...base,
        id: r.id,
        causal_codigo: r.causal_codigo,
        causal_nombre: labelCausal(r.causal_codigo),
        articulo_texto: c?.articulo_texto ?? null,
        fecha_ingreso_periodo: toYmd(r.fecha_ingreso_periodo),
        desvinculado_por_nombre: r.desvinculado_por_nombre ?? null,
        desvinculado_en: r.desvinculado_en ?? null,
        reactivado_en: r.reactivado_en ?? null,
        reactivado_por_nombre: r.reactivado_por_nombre ?? null,
        finiquito_documento_id: r.finiquito_documento_id ?? null,
        // Mig 152: empresa con la que tenía contrato en ese período (Art. 159 N°4 cuenta por empleador).
        empresa_id: r.empresa_id ?? null,
        empresa_nombre: r.empresa_nombre ?? null,
    };
    if (modo === 'completa') return { ...resumen, detalle: r.detalle ?? null };
    return resumen;
}

const desvinculacionService = {
    modoSegunPermisos,
    esErrorEsquema,

    /** Catálogo público de causales seleccionables (para el <Select> del modal). */
    catalogo() {
        return seleccionables().map(({ codigo, articulo, inciso, articulo_texto, nombre, grupo, sugiere_no_recontratar, requiere_detalle }) =>
            ({ codigo, articulo, inciso, articulo_texto, nombre, grupo, sugiere_no_recontratar, requiere_detalle }));
    },

    /**
     * Última baja registrada del trabajador (abierta o cerrada), o null.
     * @param {'terreno'|'resumen'|'completa'} [opts.modo='resumen']
     */
    async ultimaDesvinculacion(trabajadorId, { modo = 'resumen', conn = db } = {}) {
        try {
            const [rows] = await queryHist(conn,
                'WHERE d.trabajador_id = ? ORDER BY d.desvinculado_en DESC, d.id DESC LIMIT 1',
                [trabajadorId]
            );
            return proyectar(rows[0], modo);
        } catch (err) {
            if (esErrorEsquema(err)) return null;
            throw err;
        }
    },

    /**
     * Baja VIGENTE del trabajador (fila con reactivado_en IS NULL), o null. A diferencia de
     * ultimaDesvinculacion, NUNCA devuelve una baja ya cerrada por una reactivación: el finiquito (B5)
     * se cuelga de esta fila. Trae la causal del catálogo completa (con artículo) para la plantilla.
     * Sin la mig 112 (errno 1146/1054) → null; con `estricta` el error de esquema se propaga para que el
     * caller lo distinga de "sin baja" (el finiquito responde 409 MIGRACION_PENDIENTE, no "desvincula primero").
     */
    async desvinculacionAbierta(trabajadorId, { conn = db, estricta = false } = {}) {
        try {
            const [rows] = await queryHist(conn,
                'WHERE d.trabajador_id = ? AND d.reactivado_en IS NULL ORDER BY d.desvinculado_en DESC, d.id DESC LIMIT 1',
                [trabajadorId]
            );
            const r = rows[0];
            if (!r) return null;
            const c = getCausal(r.causal_codigo);
            return {
                id: r.id,
                trabajador_id: r.trabajador_id,
                fecha_desvinculacion: toYmd(r.fecha_desvinculacion),
                fecha_ingreso_periodo: toYmd(r.fecha_ingreso_periodo),
                causal_codigo: r.causal_codigo,
                causal: c ? { codigo: c.codigo, nombre: c.nombre, articulo: c.articulo, inciso: c.inciso, articulo_texto: c.articulo_texto } : null,
                no_recontratar: toBool(r.no_recontratar),
                finiquito_documento_id: r.finiquito_documento_id ?? null,
            };
        } catch (err) {
            if (esErrorEsquema(err) && !estricta) return null;
            throw err;
        }
    },

    /**
     * Estampa el finiquito emitido en su fila del historial (B5). El ÚLTIMO emitido es el vigente: una
     * reemisión reemplaza el enlace (el documento anterior sigue en la ficha). false = fila inexistente
     * o mig 112 pendiente; el caller decide (el documento ya está escrito: se avisa, no se falla).
     */
    async vincularFiniquito(desvinculacionId, documentoId, { conn = db } = {}) {
        try {
            // `reactivado_en IS NULL`: si otro usuario reactivó al trabajador entre la lectura y este UPDATE, la
            // fila ya está cerrada y el finiquito NO se cuelga de ella (affectedRows 0 → enlazado:false).
            const [upd] = await conn.query(
                'UPDATE trabajador_desvinculaciones SET finiquito_documento_id = ? WHERE id = ? AND reactivado_en IS NULL',
                [documentoId, desvinculacionId]
            );
            return (upd.affectedRows || 0) > 0;
        } catch (err) {
            if (esErrorEsquema(err)) return false;
            throw err;
        }
    },

    /**
     * Antecedente por RUT (mig 113): última baja registrada con ese RUT aunque la ficha ya no exista
     * (trabajador depurado → trabajador_id NULL). Alimenta el aviso de ambos check-rut. Defensivo:
     * cualquier error se degrada a null (es solo un aviso; nunca debe romper la creación).
     */
    async antecedentePorRut(rutNormalizado, { modo = 'resumen', conn = db } = {}) {
        if (!rutNormalizado) return null;
        try {
            const r = await queryHist(conn, 'WHERE d.rut_normalized = ? ORDER BY d.desvinculado_en DESC, d.id DESC LIMIT 1', [rutNormalizado]);
            const rows = Array.isArray(r) ? r[0] : [];
            return proyectar(rows && rows[0], modo);
        } catch (err) {
            if (!esErrorEsquema(err)) logger.warn('antecedentePorRut falló (se omite el aviso)', { err: err.message });
            return null;
        }
    },
    /** Historial completo (con detalle). Gate en la ruta: trabajadores.eliminar OR .reactivar. */
    async listar(trabajadorId) {
        try {
            const [rows] = await queryHist(db,
                'WHERE d.trabajador_id = ? ORDER BY d.desvinculado_en DESC, d.id DESC',
                [trabajadorId]
            );
            return rows.map(r => proyectar(r, 'completa'));
        } catch (err) {
            if (esErrorEsquema(err)) return [];
            throw err;
        }
    },

    /**
     * Períodos laborales CERRADOS (el trabajador volvió después de esa baja) de varios trabajadores en
     * UNA query → Map<trabajador_id, [{desde, hasta, empresa_id, cargo_id, empresa_nombre, cargo_nombre,
     * causal_codigo, causal_nombre}]> en orden cronológico. Sin `detalle` (lo ve cualquiera con
     * trabajadores.ver). Sin la mig 112 → Map vacío; sin la 152 → sin empresa/cargo.
     */
    async periodosCerrados(ids, { conn = db } = {}) {
        const lista = [...new Set((ids || []).map(Number).filter(n => Number.isInteger(n) && n > 0))];
        const mapa = new Map();
        if (!lista.length) return mapa;
        const sql = conFoto => `
            SELECT d.trabajador_id, d.fecha_ingreso_periodo, d.fecha_desvinculacion, d.causal_codigo
                   ${conFoto ? ', d.empresa_id, d.cargo_id, e.razon_social AS empresa_nombre, c.nombre AS cargo_nombre' : ''}
              FROM trabajador_desvinculaciones d
              ${conFoto ? 'LEFT JOIN empresas e ON e.id = d.empresa_id LEFT JOIN cargos c ON c.id = d.cargo_id' : ''}
             WHERE d.trabajador_id IN (?) AND d.reactivado_en IS NOT NULL
             ORDER BY d.fecha_desvinculacion ASC, d.id ASC`;
        let rows;
        try {
            [rows] = await conn.query(sql(true), [lista]);
        } catch (err) {
            if (!esErrorEsquema(err)) throw err;
            try {
                [rows] = await conn.query(sql(false), [lista]);
            } catch (err2) {
                if (esErrorEsquema(err2)) return mapa;
                throw err2;
            }
        }
        for (const r of rows || []) {
            const p = {
                desde: toYmd(r.fecha_ingreso_periodo),
                hasta: toYmd(r.fecha_desvinculacion),
                empresa_id: r.empresa_id ?? null,
                cargo_id: r.cargo_id ?? null,
                empresa_nombre: r.empresa_nombre ?? null,
                cargo_nombre: r.cargo_nombre ?? null,
                causal_codigo: r.causal_codigo,
                causal_nombre: labelCausal(r.causal_codigo),
            };
            if (!mapa.has(r.trabajador_id)) mapa.set(r.trabajador_id, []);
            mapa.get(r.trabajador_id).push(p);
        }
        return mapa;
    },

    /**
     * PUT /:id/desvincular — transacción: lock, guards, fila de historial, UPDATE trabajadores,
     * conteo de asistencias posteriores (aviso, no bloquea). Log manual sin detalle.
     */
    async desvincular(trabajadorId, body = {}, userId, req = null) {
        const id = Number(trabajadorId);
        if (!Number.isInteger(id) || id <= 0) throw httpError('Trabajador inválido', 400);

        const causal = getCausal(body.causal_codigo);
        if (!causal || !causal.seleccionable) throw httpError('Causal de desvinculación inválida', 400);
        const detalle = strOrNull(body.detalle);
        if (causal.requiere_detalle && !detalle) {
            throw httpError(`La causal "${causal.nombre}" requiere detallar el antecedente`, 400);
        }
        const fecha = toYmd(body.fecha_desvinculacion);
        if (!fecha) throw httpError('Fecha de desvinculación requerida', 400);
        const hoy = hoyYmd();
        if (fecha > sumarDias(hoy, 30)) throw httpError('La fecha de desvinculación no puede superar 30 días desde hoy', 400);
        const noRecontratar = body.no_recontratar === undefined ? causal.sugiere_no_recontratar : toBool(body.no_recontratar);

        const conn = await db.getConnection();
        let trabajador, desvinculacionId, asistenciasPosteriores = 0;
        try {
            await conn.beginTransaction();
            const [rows] = await conn.query(
                'SELECT id, nombres, apellido_paterno, apellido_materno, activo, fecha_ingreso, rut_normalized, empresa_id, obra_id, cargo_id FROM trabajadores WHERE id = ? FOR UPDATE',
                [id]
            );
            if (!rows.length) throw httpError('Trabajador no encontrado', 404);
            trabajador = rows[0];
            if (!toBool(trabajador.activo)) throw httpError('El trabajador ya está desvinculado', 409, { code: 'YA_DESVINCULADO' });
            const ingreso = toYmd(trabajador.fecha_ingreso);
            if (ingreso && fecha < ingreso) {
                throw httpError(`La fecha de desvinculación no puede ser anterior al ingreso (${ingreso})`, 400);
            }

            // Columnas opcionales por migración, de la más nueva a la base (1054 → se prueba la siguiente):
            //   mig 152: foto empresa/obra/cargo del período · mig 113: rut_normalized + nombre_snapshot
            //   (el antecedente sobrevive a la depuración).
            const base = {
                trabajador_id: id, fecha_desvinculacion: fecha, fecha_ingreso_periodo: ingreso, causal_codigo: causal.codigo,
                detalle, no_recontratar: noRecontratar ? 1 : 0, desvinculado_por: userId ?? null,
            };
            const con113 = { ...base, rut_normalized: trabajador.rut_normalized ?? null, nombre_snapshot: nombreCompleto(trabajador) };
            const con152 = { ...con113, empresa_id: trabajador.empresa_id ?? null, obra_id: trabajador.obra_id ?? null, cargo_id: trabajador.cargo_id ?? null };
            let ins;
            for (const [i, fila] of [con152, con113, base].entries()) {
                const cols = Object.keys(fila);
                try {
                    [ins] = await conn.query(
                        `INSERT INTO trabajador_desvinculaciones (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
                        cols.map(c => fila[c])
                    );
                    break;
                } catch (err) {
                    if (!esErrorEsquema(err) || i === 2) throw err;
                }
            }
            desvinculacionId = ins.insertId;

            await conn.query(
                `UPDATE trabajadores
                    SET activo = 0, fecha_desvinculacion = ?, causal_desvinculacion = ?, no_recontratar = ?
                  WHERE id = ?`,
                [fecha, causal.codigo, noRecontratar ? 1 : 0, id]
            );

            // Asistencias ya registradas DESPUÉS de la fecha: se informan, no se tocan (decisión pendiente §10.4).
            const [cnt] = await conn.query('SELECT COUNT(*) AS n FROM asistencias WHERE trabajador_id = ? AND fecha > ?', [id, fecha]);
            asistenciasPosteriores = Number(cnt[0]?.n || 0);

            await conn.commit();
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }

        try {
            await logManualActivity(
                userId, 'trabajadores', 'UPDATE', id,
                JSON.stringify({ evento: 'trabajador_desvinculado', fecha_desvinculacion: fecha, causal_codigo: causal.codigo, causal: causal.nombre, no_recontratar: noRecontratar }),
                req, { entidad_tipo: 'trabajador', entidad_label: nombreCompleto(trabajador) }
            );
        } catch (e) {
            logger.warn('No se pudo registrar el log de desvinculación', { err: e.message });
        }

        return {
            trabajador_id: id,
            desvinculacion_id: desvinculacionId,
            fecha_desvinculacion: fecha,
            causal: { codigo: causal.codigo, nombre: causal.nombre, articulo_texto: causal.articulo_texto },
            no_recontratar: noRecontratar,
            asistencias_posteriores: asistenciasPosteriores,
        };
    },

    /**
     * REINGRESO dentro de la transacción del caller (PUT /:id/reactivar y, fase 2, la aprobación de una
     * solicitud de reingreso). Abre un período nuevo: `fecha_ingreso` pasa a ser la del reingreso
     * (docs/reglas/rrhh-trabajadores.md § Reingreso y períodos laborales — revierte la regla vieja
     * «reactivar conserva fecha_ingreso»). Cierra la fila abierta del historial y le completa la foto
     * empresa/obra/cargo si venía vacía (bajas anteriores a la mig 152).
     *   · 409 YA_ACTIVO si está activo. 400 si la fecha no es posterior al último egreso, supera hoy+30,
     *     el término es anterior al ingreso o la obra no existe / está finalizada.
     *   · Empresa/obra/cargo/categoría: solo si vienen (nunca se pisan con null). Término: el del body o
     *     NULL (= indefinido) — el viejo ya venció y marcaría «contrato vencido» en el Inicio.
     *   · `no_recontratar`: se conserva salvo `quitar_marca_no_recontratar` (solo advierte, dueño 10-sep).
     */
    async _reingresarEnConn(conn, trabajadorId, datos = {}, userId) {
        const id = Number(trabajadorId);
        if (!Number.isInteger(id) || id <= 0) throw httpError('Trabajador inválido', 400);
        const fechaIngreso = toYmd(datos.fecha_ingreso);
        if (!fechaIngreso || !/^\d{4}-\d{2}-\d{2}$/.test(fechaIngreso)) throw httpError('Fecha de reingreso requerida', 400);
        if (fechaIngreso > sumarDias(hoyYmd(), 30)) throw httpError('La fecha de reingreso no puede superar 30 días desde hoy', 400);
        const termino = toYmd(datos.fecha_termino_contrato);
        if (termino && termino < fechaIngreso) throw httpError('El término del contrato no puede ser anterior a la fecha de reingreso', 400);
        const quitarMarca = toBool(datos.quitar_marca_no_recontratar);

        const sel = cols => conn.query(`SELECT ${cols} FROM trabajadores WHERE id = ? FOR UPDATE`, [id]);
        const BASE = 'id, nombres, apellido_paterno, apellido_materno, activo, fecha_ingreso, fecha_desvinculacion, empresa_id, obra_id, cargo_id';
        // Sin la columna no_recontratar (mig 112 pendiente): leer sin ella.
        const [rows] = await sel(`${BASE}, no_recontratar`).catch(err => {
            if (!esErrorEsquema(err)) throw err;
            return sel(BASE);
        });
        if (!rows.length) throw httpError('Trabajador no encontrado', 404);
        const trabajador = rows[0];
        if (toBool(trabajador.activo)) throw httpError('El trabajador ya está activo', 409, { code: 'YA_ACTIVO' });
        const teniaMarca = toBool(trabajador.no_recontratar);

        const abierta = await this.desvinculacionAbierta(id, { conn });
        const ultimoEgreso = abierta?.fecha_desvinculacion || toYmd(trabajador.fecha_desvinculacion);
        if (ultimoEgreso && fechaIngreso <= ultimoEgreso) {
            throw httpError(`La fecha de reingreso debe ser posterior al último egreso (${ultimoEgreso})`, 400, { code: 'REINGRESO_SOLAPADO' });
        }

        if (datos.obra_id != null) {
            const [obra] = await conn.query('SELECT id, finalizada FROM obras WHERE id = ?', [datos.obra_id]).catch(err => {
                if (!esErrorEsquema(err)) throw err;
                return conn.query('SELECT id FROM obras WHERE id = ?', [datos.obra_id]);
            });
            if (!obra.length) throw httpError('La obra elegida no existe', 400);
            if (toBool(obra[0].finalizada)) throw httpError('La obra elegida está finalizada', 400, { code: 'OBRA_FINALIZADA' });
        }

        const conservaMarca = teniaMarca && !quitarMarca;
        const opcionales = {};
        for (const k of ['empresa_id', 'obra_id', 'cargo_id', 'categoria_reporte']) {
            if (datos[k] !== undefined && datos[k] !== null && datos[k] !== '') opcionales[k] = datos[k];
        }
        const update = async campos => {
            const cols = Object.keys(campos);
            await conn.query(
                `UPDATE trabajadores SET activo = 1, fecha_desvinculacion = NULL, ${cols.map(c => `${c} = ?`).join(', ')} WHERE id = ?`,
                [...cols.map(c => campos[c]), id]
            );
        };
        try {
            await update({ fecha_ingreso: fechaIngreso, fecha_termino_contrato: termino, causal_desvinculacion: null, no_recontratar: conservaMarca ? 1 : 0, ...opcionales });
        } catch (err) {
            // Sin mig 112/138 (causal, marca, término): lo mínimo para abrir el período.
            if (!esErrorEsquema(err)) throw err;
            await update({ fecha_ingreso: fechaIngreso, ...opcionales });
        }

        let filaCerrada = false;
        const cerrar = async conFoto => {
            const [upd] = await conn.query(
                `UPDATE trabajador_desvinculaciones
                    SET reactivado_por = ?, reactivado_en = NOW()
                        ${conFoto ? ', empresa_id = COALESCE(empresa_id, ?), obra_id = COALESCE(obra_id, ?), cargo_id = COALESCE(cargo_id, ?)' : ''}
                  WHERE trabajador_id = ? AND reactivado_en IS NULL
                  ORDER BY desvinculado_en DESC, id DESC
                  LIMIT 1`,
                conFoto
                    ? [userId ?? null, trabajador.empresa_id ?? null, trabajador.obra_id ?? null, trabajador.cargo_id ?? null, id]
                    : [userId ?? null, id]
            );
            filaCerrada = (upd.affectedRows || 0) > 0;
        };
        try {
            await cerrar(true);
        } catch (err) {
            if (!esErrorEsquema(err)) throw err;
            try { await cerrar(false); } catch (err2) { if (!esErrorEsquema(err2)) throw err2; }
        }

        return {
            trabajador,
            teniaMarca,
            quitarMarca,
            filaCerrada,
            ingresoAnterior: toYmd(trabajador.fecha_ingreso),
            fechaIngreso,
            fechaTermino: termino,
        };
    },

    /** Log manual del reingreso (sin detalle). Nunca falla. */
    async _logReingreso(userId, r, req) {
        try {
            await logManualActivity(
                userId, 'trabajadores', 'UPDATE', r.trabajador.id,
                JSON.stringify({
                    evento: 'trabajador_reingresado',
                    fecha_ingreso: r.fechaIngreso,
                    fecha_ingreso_anterior: r.ingresoAnterior,
                    tenia_marca_no_recontratar: r.teniaMarca,
                    quitar_marca_no_recontratar: r.quitarMarca,
                }),
                req, { entidad_tipo: 'trabajador', entidad_label: nombreCompleto(r.trabajador) }
            );
        } catch (e) {
            logger.warn('No se pudo registrar el log de reingreso', { err: e.message });
        }
    },

    /** PUT /:id/reactivar — REINGRESO en su propia transacción (ver _reingresarEnConn). */
    async reactivar(trabajadorId, body = {}, userId, req = null) {
        const conn = await db.getConnection();
        let r;
        try {
            await conn.beginTransaction();
            r = await this._reingresarEnConn(conn, trabajadorId, body, userId);
            await conn.commit();
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }
        await this._logReingreso(userId, r, req);
        return {
            trabajador_id: r.trabajador.id,
            fecha_ingreso: r.fechaIngreso,
            fecha_ingreso_anterior: r.ingresoAnterior,
            fecha_termino_contrato: r.fechaTermino,
            tenia_marca: r.teniaMarca,
            marca_conservada: r.teniaMarca && !r.quitarMarca,
            historial_cerrado: r.filaCerrada,
        };
    },

    /**
     * Guard para DELETE /:id/depurar (hard-delete): 409 si el trabajador tiene finiquito emitido
     * o documentos generados por Bóveda (evidencia). Corre DENTRO de la transacción del caller.
     */
    async guardDepurar(conn, trabajadorId) {
        try {
            const [f] = await conn.query(
                'SELECT COUNT(*) AS n FROM trabajador_desvinculaciones WHERE trabajador_id = ? AND finiquito_documento_id IS NOT NULL',
                [trabajadorId]
            );
            if (Number(f[0]?.n || 0) > 0) {
                throw httpError('No se puede depurar: el trabajador tiene un finiquito emitido en la bóveda', 409, { code: 'TIENE_FINIQUITO' });
            }
        } catch (err) {
            if (!esErrorEsquema(err)) throw err;
        }
        if (await hasCols('documentos', 'origen')) {
            const [g] = await conn.query(
                "SELECT COUNT(*) AS n FROM documentos WHERE trabajador_id = ? AND origen = 'generado'",
                [trabajadorId]
            );
            if (Number(g[0]?.n || 0) > 0) {
                throw httpError('No se puede depurar: el trabajador tiene documentos generados por Bóveda (contrato, anexos, cartas)', 409, { code: 'TIENE_DOCUMENTOS_GENERADOS' });
            }
        }
    },
};

module.exports = desvinculacionService;
module.exports._interno = { toYmd, sumarDias, proyectar };
