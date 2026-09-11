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
 *    nunca la borra. `fecha_ingreso` del trabajador NO se toca al reactivar.
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
    };
    if (modo === 'completa') return { ...resumen, detalle: r.detalle ?? null };
    return resumen;
}

const desvinculacionService = {
    modoSegunPermisos,

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
            const [rows] = await conn.query(
                `${SELECT_HIST} WHERE d.trabajador_id = ? ORDER BY d.desvinculado_en DESC, d.id DESC LIMIT 1`,
                [trabajadorId]
            );
            return proyectar(rows[0], modo);
        } catch (err) {
            if (esErrorEsquema(err)) return null;
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
            const r = await conn.query(`${SELECT_HIST} WHERE d.rut_normalized = ? ORDER BY d.desvinculado_en DESC, d.id DESC LIMIT 1`, [rutNormalizado]);
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
            const [rows] = await db.query(
                `${SELECT_HIST} WHERE d.trabajador_id = ? ORDER BY d.desvinculado_en DESC, d.id DESC`,
                [trabajadorId]
            );
            return rows.map(r => proyectar(r, 'completa'));
        } catch (err) {
            if (esErrorEsquema(err)) return [];
            throw err;
        }
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
                'SELECT id, nombres, apellido_paterno, apellido_materno, activo, fecha_ingreso, rut_normalized FROM trabajadores WHERE id = ? FOR UPDATE',
                [id]
            );
            if (!rows.length) throw httpError('Trabajador no encontrado', 404);
            trabajador = rows[0];
            if (!toBool(trabajador.activo)) throw httpError('El trabajador ya está desvinculado', 409, { code: 'YA_DESVINCULADO' });
            const ingreso = toYmd(trabajador.fecha_ingreso);
            if (ingreso && fecha < ingreso) {
                throw httpError(`La fecha de desvinculación no puede ser anterior al ingreso (${ingreso})`, 400);
            }

            // Mig 113: rut_normalized + nombre_snapshot para que el antecedente sobreviva a la depuración.
            // Si la 113 aún no corrió (1054), se inserta sin esas columnas.
            const baseParams = [id, fecha, ingreso, causal.codigo, detalle, noRecontratar ? 1 : 0, userId ?? null];
            let ins;
            try {
                [ins] = await conn.query(
                    `INSERT INTO trabajador_desvinculaciones
                        (trabajador_id, fecha_desvinculacion, fecha_ingreso_periodo, causal_codigo, detalle, no_recontratar, desvinculado_por, rut_normalized, nombre_snapshot)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [...baseParams, trabajador.rut_normalized ?? null, nombreCompleto(trabajador)]
                );
            } catch (err) {
                if (!esErrorEsquema(err)) throw err;
                [ins] = await conn.query(
                    `INSERT INTO trabajador_desvinculaciones
                        (trabajador_id, fecha_desvinculacion, fecha_ingreso_periodo, causal_codigo, detalle, no_recontratar, desvinculado_por)
                     VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    baseParams
                );
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
     * PUT /:id/reactivar — transacción: 409 si ya está activo; reabre al trabajador SIN tocar
     * fecha_ingreso; cierra la fila abierta del historial; la marca se conserva salvo pedido.
     * Nunca bloquea por `no_recontratar` (solo advierte en la UI).
     */
    async reactivar(trabajadorId, body = {}, userId, req = null) {
        const id = Number(trabajadorId);
        if (!Number.isInteger(id) || id <= 0) throw httpError('Trabajador inválido', 400);
        const quitarMarca = toBool(body.quitar_marca_no_recontratar);

        const conn = await db.getConnection();
        let trabajador, teniaMarca = false, filaCerrada = false;
        try {
            await conn.beginTransaction();
            const [rows] = await conn.query(
                'SELECT id, nombres, apellido_paterno, apellido_materno, activo, no_recontratar FROM trabajadores WHERE id = ? FOR UPDATE',
                [id]
            ).catch(err => {
                // Sin la columna no_recontratar (mig 112 pendiente): leer sin ella.
                if (!esErrorEsquema(err)) throw err;
                return conn.query('SELECT id, nombres, apellido_paterno, apellido_materno, activo FROM trabajadores WHERE id = ? FOR UPDATE', [id]);
            });
            if (!rows.length) throw httpError('Trabajador no encontrado', 404);
            trabajador = rows[0];
            if (toBool(trabajador.activo)) throw httpError('El trabajador ya está activo', 409, { code: 'YA_ACTIVO' });
            teniaMarca = toBool(trabajador.no_recontratar);

            const conservaMarca = teniaMarca && !quitarMarca;
            try {
                await conn.query(
                    `UPDATE trabajadores
                        SET activo = 1, fecha_desvinculacion = NULL, causal_desvinculacion = NULL, no_recontratar = ?
                      WHERE id = ?`,
                    [conservaMarca ? 1 : 0, id]
                );
            } catch (err) {
                if (!esErrorEsquema(err)) throw err;
                await conn.query('UPDATE trabajadores SET activo = 1, fecha_desvinculacion = NULL WHERE id = ?', [id]);
            }

            try {
                const [upd] = await conn.query(
                    `UPDATE trabajador_desvinculaciones
                        SET reactivado_por = ?, reactivado_en = NOW()
                      WHERE trabajador_id = ? AND reactivado_en IS NULL
                      ORDER BY desvinculado_en DESC, id DESC
                      LIMIT 1`,
                    [userId ?? null, id]
                );
                filaCerrada = (upd.affectedRows || 0) > 0;
            } catch (err) {
                if (!esErrorEsquema(err)) throw err;
            }

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
                JSON.stringify({ evento: 'trabajador_reactivado', tenia_marca_no_recontratar: teniaMarca, quitar_marca_no_recontratar: quitarMarca }),
                req, { entidad_tipo: 'trabajador', entidad_label: nombreCompleto(trabajador) }
            );
        } catch (e) {
            logger.warn('No se pudo registrar el log de reactivación', { err: e.message });
        }

        return { trabajador_id: id, tenia_marca: teniaMarca, marca_conservada: teniaMarca && !quitarMarca, historial_cerrado: filaCerrada };
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
