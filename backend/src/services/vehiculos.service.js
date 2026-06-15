const db = require('../config/db');

// Cache de columnas por tabla — evita consultar INFORMATION_SCHEMA en cada request.
const _colCache = {};
async function existingCols(table) {
    if (_colCache[table]) return _colCache[table];
    const [rows] = await db.query(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
        [table]
    );
    _colCache[table] = new Set(rows.map(r => r.COLUMN_NAME));
    return _colCache[table];
}

// Construye {fields, params} para un UPDATE filtrando solo columnas que existen.
async function buildUpdate(table, data, allowed) {
    const cols = await existingCols(table);
    const fields = [], params = [];
    allowed.forEach(f => {
        if (data[f] !== undefined && cols.has(f)) {
            fields.push(`${f} = ?`);
            params.push(data[f] ?? null);
        }
    });
    return { fields, params };
}

// Igual para INSERT: filtra columnas que no existen aún.
async function buildInsert(table, obj) {
    const cols = await existingCols(table);
    const keys = Object.keys(obj).filter(k => cols.has(k));
    const vals = keys.map(k => obj[k]);
    return { keys, vals };
}

const vehiculosService = {

    // ── Vehículos ──────────────────────────────────────────────────────

    async getAll(query = {}) {
        const { q, activo = 'true', tipo } = query;
        const where = [];
        const params = [];

        if (activo !== 'all') {
            where.push('v.activo = ?');
            params.push(activo === 'false' || activo === false ? 0 : 1);
        }
        if (tipo) { where.push('v.tipo = ?'); params.push(tipo); }
        if (q) {
            where.push('(v.patente LIKE ? OR v.marca LIKE ? OR v.modelo LIKE ?)');
            params.push(`%${q}%`, `%${q}%`, `%${q}%`);
        }

        const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

        const [rows] = await db.query(`
            SELECT v.*,
                c.nombre AS conductor_nombre,
                -- Último seguro activo y su vencimiento
                (SELECT tipo FROM vehiculo_seguros WHERE vehiculo_id = v.id AND activo = 1
                    ORDER BY fecha_vencimiento DESC LIMIT 1) AS seguro_tipo,
                (SELECT fecha_vencimiento FROM vehiculo_seguros WHERE vehiculo_id = v.id AND activo = 1
                    ORDER BY fecha_vencimiento DESC LIMIT 1) AS seguro_vencimiento,
                -- Última revisión técnica activa
                (SELECT fecha_vencimiento FROM vehiculo_revisiones
                    WHERE vehiculo_id = v.id AND tipo = 'tecnica' AND activo = 1
                    ORDER BY fecha_vencimiento DESC LIMIT 1) AS revision_tecnica_vencimiento,
                -- Última revisión de gases
                (SELECT fecha_vencimiento FROM vehiculo_revisiones
                    WHERE vehiculo_id = v.id AND tipo = 'gases' AND activo = 1
                    ORDER BY fecha_vencimiento DESC LIMIT 1) AS revision_gases_vencimiento
            FROM vehiculos v
            LEFT JOIN conductores c ON c.id = v.conductor_id
            ${whereClause}
            ORDER BY v.patente ASC
        `, params);

        return rows;
    },

    async getById(id) {
        const [rows] = await db.query(
            `SELECT v.*, c.nombre AS conductor_nombre
             FROM vehiculos v
             LEFT JOIN conductores c ON c.id = v.conductor_id
             WHERE v.id = ? AND v.activo = 1`, [id]
        );
        if (!rows.length) throw Object.assign(new Error('Vehículo no encontrado'), { statusCode: 404 });
        return rows[0];
    },

    /**
     * Resuelve el nombre de un conductor a su id en el catálogo: si ya existe
     * (case-insensitive) devuelve su id; si es un nombre nuevo, lo crea y devuelve
     * el id. Nombre vacío/nulo → null (sin conductor). Permite que el formulario de
     * vehículo "agregue" conductores al catálogo escribiendo el nombre.
     */
    async resolveConductorId(nombre) {
        const n = (nombre || '').trim();
        if (!n) return null;
        const [found] = await db.query(
            'SELECT id FROM conductores WHERE LOWER(nombre) = LOWER(?) AND activo = 1 LIMIT 1', [n]
        );
        if (found.length) return found[0].id;
        const [r] = await db.query('INSERT INTO conductores (nombre) VALUES (?)', [n]);
        return r.insertId;
    },

    async create(data) {
        const { patente, marca, modelo, anio, tipo = 'camioneta', kilometraje_actual = 0, color, observaciones, empresa, conductor_id } = data;
        if (!patente || !marca || !modelo || !anio) {
            throw Object.assign(new Error('patente, marca, modelo y anio son obligatorios'), { statusCode: 400 });
        }
        // El form manda conductor_nombre (texto): se resuelve/crea en el catálogo.
        const resolvedConductorId = data.conductor_nombre !== undefined
            ? await this.resolveConductorId(data.conductor_nombre)
            : (conductor_id || null);
        const [result] = await db.query(
            `INSERT INTO vehiculos (patente, marca, modelo, anio, tipo, kilometraje_actual, color, observaciones, empresa, conductor_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [patente.toUpperCase().trim(), marca, modelo, anio, tipo, kilometraje_actual, color || null, observaciones || null, empresa || null, resolvedConductorId]
        );
        return this.getById(result.insertId);
    },

    async update(id, data) {
        // El form manda conductor_nombre (texto): se resuelve/crea en el catálogo
        // y se vuelca a conductor_id para que el whitelist de abajo lo persista.
        if (data.conductor_nombre !== undefined) {
            data.conductor_id = await this.resolveConductorId(data.conductor_nombre);
        }
        const allowed = ['patente', 'marca', 'modelo', 'anio', 'tipo', 'kilometraje_actual', 'color', 'observaciones', 'activo', 'empresa', 'conductor_id'];
        const fields = [];
        const params = [];
        allowed.forEach(f => {
            if (data[f] !== undefined) {
                fields.push(`${f} = ?`);
                params.push(f === 'patente' ? data[f].toUpperCase().trim() : data[f]);
            }
        });
        if (!fields.length) throw Object.assign(new Error('Sin campos para actualizar'), { statusCode: 400 });
        params.push(id);
        await db.query(`UPDATE vehiculos SET ${fields.join(', ')} WHERE id = ?`, params);
        return this.getById(id);
    },

    async remove(id) {
        await db.query('UPDATE vehiculos SET activo = 0 WHERE id = ?', [id]);
        return { id, activo: false };
    },

    // ── Seguros ────────────────────────────────────────────────────────

    async getSeguros(vehiculoId) {
        const [rows] = await db.query(
            `SELECT * FROM vehiculo_seguros WHERE vehiculo_id = ? AND activo = 1
             ORDER BY fecha_vencimiento DESC`, [vehiculoId]
        );
        return rows;
    },

    async createSeguro(vehiculoId, data) {
        if (!data.fecha_inicio || !data.fecha_vencimiento) {
            throw Object.assign(new Error('fecha_inicio y fecha_vencimiento son obligatorias'), { statusCode: 400 });
        }
        const obj = { vehiculo_id: vehiculoId, tipo: data.tipo || 'SOAP', compania: data.compania || null,
            numero_poliza: data.numero_poliza || null, fecha_inicio: data.fecha_inicio,
            fecha_vencimiento: data.fecha_vencimiento, monto: data.monto || null,
            observaciones: data.observaciones || null,
            dias_alerta: data.dias_alerta ?? null, email_alerta: data.email_alerta || null, tel_alerta: data.tel_alerta || null };
        const { keys, vals } = await buildInsert('vehiculo_seguros', obj);
        const [r] = await db.query(`INSERT INTO vehiculo_seguros (${keys.join(',')}) VALUES (${keys.map(()=>'?').join(',')})`, vals);
        const [rows] = await db.query('SELECT * FROM vehiculo_seguros WHERE id = ?', [r.insertId]);
        return rows[0];
    },

    async updateSeguro(seguroId, data) {
        const allowed = ['tipo','compania','numero_poliza','fecha_inicio','fecha_vencimiento','monto','observaciones','dias_alerta','email_alerta','tel_alerta'];
        const { fields, params } = await buildUpdate('vehiculo_seguros', data, allowed);
        if (!fields.length) throw Object.assign(new Error('Sin campos para actualizar'), { statusCode: 400 });
        params.push(seguroId);
        await db.query(`UPDATE vehiculo_seguros SET ${fields.join(', ')} WHERE id = ?`, params);
        const [rows] = await db.query('SELECT * FROM vehiculo_seguros WHERE id = ?', [seguroId]);
        return rows[0];
    },

    async removeSeguro(vehiculoId, seguroId) {
        await db.query('UPDATE vehiculo_seguros SET activo = 0 WHERE id = ? AND vehiculo_id = ?', [seguroId, vehiculoId]);
        return { id: seguroId, activo: false };
    },

    // ── Revisiones ────────────────────────────────────────────────────

    async getRevisiones(vehiculoId) {
        const [rows] = await db.query(
            `SELECT * FROM vehiculo_revisiones WHERE vehiculo_id = ? AND activo = 1
             ORDER BY fecha_vencimiento DESC`, [vehiculoId]
        );
        return rows;
    },

    async createRevision(vehiculoId, data) {
        if (!data.tipo || !data.fecha || !data.fecha_vencimiento) {
            throw Object.assign(new Error('tipo, fecha y fecha_vencimiento son obligatorios'), { statusCode: 400 });
        }
        const obj = { vehiculo_id: vehiculoId, tipo: data.tipo, fecha: data.fecha,
            fecha_vencimiento: data.fecha_vencimiento, resultado: data.resultado || 'aprobado',
            planta: data.planta || null, direccion: data.direccion || null, observaciones: data.observaciones || null,
            periodicidad_anios: data.periodicidad_anios ?? null,
            dias_alerta: data.dias_alerta ?? null, email_alerta: data.email_alerta || null, tel_alerta: data.tel_alerta || null };
        const { keys, vals } = await buildInsert('vehiculo_revisiones', obj);
        const [r] = await db.query(`INSERT INTO vehiculo_revisiones (${keys.join(',')}) VALUES (${keys.map(()=>'?').join(',')})`, vals);
        const [rows] = await db.query('SELECT * FROM vehiculo_revisiones WHERE id = ?', [r.insertId]);
        return rows[0];
    },

    async updateRevision(revisionId, data) {
        const allowed = ['tipo','fecha','fecha_vencimiento','resultado','planta','direccion','observaciones','periodicidad_anios','dias_alerta','email_alerta','tel_alerta'];
        const { fields, params } = await buildUpdate('vehiculo_revisiones', data, allowed);
        if (!fields.length) throw Object.assign(new Error('Sin campos para actualizar'), { statusCode: 400 });
        params.push(revisionId);
        await db.query(`UPDATE vehiculo_revisiones SET ${fields.join(', ')} WHERE id = ?`, params);
        const [rows] = await db.query('SELECT * FROM vehiculo_revisiones WHERE id = ?', [revisionId]);
        return rows[0];
    },

    async removeRevision(vehiculoId, revisionId) {
        await db.query('UPDATE vehiculo_revisiones SET activo = 0 WHERE id = ? AND vehiculo_id = ?', [revisionId, vehiculoId]);
        return { id: revisionId, activo: false };
    },

    // ── Mantenciones ──────────────────────────────────────────────────

    async getMantenciones(vehiculoId) {
        const [rows] = await db.query(
            `SELECT * FROM vehiculo_mantenciones WHERE vehiculo_id = ? AND activo = 1
             ORDER BY fecha DESC`, [vehiculoId]
        );
        return rows;
    },

    async createMantencion(vehiculoId, data) {
        if (!data.fecha || !data.tipo || data.km_al_realizar === undefined) {
            throw Object.assign(new Error('fecha, tipo y km_al_realizar son obligatorios'), { statusCode: 400 });
        }
        const obj = { vehiculo_id: vehiculoId, fecha: data.fecha, tipo: data.tipo,
            km_al_realizar: data.km_al_realizar, descripcion: data.descripcion || null,
            costo: data.costo || null, taller: data.taller || null,
            fecha_proxima: data.fecha_proxima || null,
            dias_alerta: data.dias_alerta ?? null, email_alerta: data.email_alerta || null, tel_alerta: data.tel_alerta || null };
        const { keys, vals } = await buildInsert('vehiculo_mantenciones', obj);
        const [r] = await db.query(`INSERT INTO vehiculo_mantenciones (${keys.join(',')}) VALUES (${keys.map(()=>'?').join(',')})`, vals);
        const [rows] = await db.query('SELECT * FROM vehiculo_mantenciones WHERE id = ?', [r.insertId]);
        return rows[0];
    },

    async updateMantencion(mantencionId, data) {
        const allowed = ['fecha','tipo','km_al_realizar','descripcion','costo','taller','fecha_proxima','dias_alerta','email_alerta','tel_alerta'];
        const { fields, params } = await buildUpdate('vehiculo_mantenciones', data, allowed);
        if (!fields.length) throw Object.assign(new Error('Sin campos para actualizar'), { statusCode: 400 });
        params.push(mantencionId);
        await db.query(`UPDATE vehiculo_mantenciones SET ${fields.join(', ')} WHERE id = ?`, params);
        const [rows] = await db.query('SELECT * FROM vehiculo_mantenciones WHERE id = ?', [mantencionId]);
        return rows[0];
    },

    async removeMantencion(vehiculoId, mantencionId) {
        await db.query('UPDATE vehiculo_mantenciones SET activo = 0 WHERE id = ? AND vehiculo_id = ?', [mantencionId, vehiculoId]);
        return { id: mantencionId, activo: false };
    },

    // ── Permisos de Circulación ───────────────────────────────────────────

    async getPermisos(vehiculoId) {
        const [rows] = await db.query(
            `SELECT * FROM vehiculo_permisos WHERE vehiculo_id = ? AND activo = 1
             ORDER BY fecha_vencimiento DESC`, [vehiculoId]
        );
        return rows;
    },

    async createPermiso(vehiculoId, data) {
        if (!data.fecha_vencimiento) {
            throw Object.assign(new Error('fecha_vencimiento es obligatoria'), { statusCode: 400 });
        }
        const obj = { vehiculo_id: vehiculoId, numero_permiso: data.numero_permiso || null,
            fecha_emision: data.fecha_emision || null, fecha_vencimiento: data.fecha_vencimiento,
            monto: data.monto || null, municipalidad: data.municipalidad || null,
            observaciones: data.observaciones || null,
            dias_alerta: data.dias_alerta ?? null, email_alerta: data.email_alerta || null, tel_alerta: data.tel_alerta || null };
        const { keys, vals } = await buildInsert('vehiculo_permisos', obj);
        const [r] = await db.query(`INSERT INTO vehiculo_permisos (${keys.join(',')}) VALUES (${keys.map(()=>'?').join(',')})`, vals);
        const [rows] = await db.query('SELECT * FROM vehiculo_permisos WHERE id = ?', [r.insertId]);
        return rows[0];
    },

    async updatePermiso(permisoId, data) {
        const allowed = ['numero_permiso','fecha_emision','fecha_vencimiento','monto','municipalidad','observaciones','dias_alerta','email_alerta','tel_alerta'];
        const { fields, params } = await buildUpdate('vehiculo_permisos', data, allowed);
        if (!fields.length) throw Object.assign(new Error('Sin campos para actualizar'), { statusCode: 400 });
        params.push(permisoId);
        await db.query(`UPDATE vehiculo_permisos SET ${fields.join(', ')} WHERE id = ?`, params);
        const [rows] = await db.query('SELECT * FROM vehiculo_permisos WHERE id = ?', [permisoId]);
        return rows[0];
    },

    async removePermiso(vehiculoId, permisoId) {
        await db.query('UPDATE vehiculo_permisos SET activo = 0 WHERE id = ? AND vehiculo_id = ?', [permisoId, vehiculoId]);
        return { id: permisoId, activo: false };
    },

    // ── Alertas de vencimiento ────────────────────────────────────────

    /**
     * Retorna seguros, revisiones y licencias que vencen en los próximos
     * `dias` días (default 30). Usado tanto para el badge en la app como
     * para el envío de emails automáticos.
     */
    async getAlertas(dias = 30) {
        const [seguros] = await db.query(`
            SELECT v.patente, v.marca, v.modelo,
                   s.tipo AS elemento, s.fecha_vencimiento,
                   DATEDIFF(s.fecha_vencimiento, CURDATE()) AS dias_restantes,
                   'seguro' AS categoria
            FROM vehiculo_seguros s
            JOIN vehiculos v ON v.id = s.vehiculo_id
            WHERE s.activo = 1 AND v.activo = 1
              AND s.fecha_vencimiento BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL ? DAY)
            ORDER BY s.fecha_vencimiento ASC
        `, [dias]);

        const [revisiones] = await db.query(`
            SELECT v.patente, v.marca, v.modelo,
                   r.tipo AS elemento, r.fecha_vencimiento,
                   DATEDIFF(r.fecha_vencimiento, CURDATE()) AS dias_restantes,
                   'revision' AS categoria
            FROM vehiculo_revisiones r
            JOIN vehiculos v ON v.id = r.vehiculo_id
            WHERE r.activo = 1 AND v.activo = 1
              AND r.fecha_vencimiento BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL ? DAY)
            ORDER BY r.fecha_vencimiento ASC
        `, [dias]);

        const [licencias] = await db.query(`
            SELECT CONCAT(t.nombres, ' ', t.apellido_paterno) AS nombre,
                   t.rut, t.licencia_conducir, t.licencia_vencimiento AS fecha_vencimiento,
                   DATEDIFF(t.licencia_vencimiento, CURDATE()) AS dias_restantes,
                   'licencia' AS categoria
            FROM trabajadores t
            WHERE t.activo = 1 AND t.licencia_vencimiento IS NOT NULL
              AND t.licencia_vencimiento BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL ? DAY)
            ORDER BY t.licencia_vencimiento ASC
        `, [dias]);

        return {
            seguros,
            revisiones,
            licencias,
            total: seguros.length + revisiones.length + licencias.length,
        };
    },

    // Alertas vencidas (fecha_vencimiento < hoy)
    async getVencidas() {
        const [seguros] = await db.query(`
            SELECT v.patente, v.marca, v.modelo, s.tipo AS elemento,
                   s.fecha_vencimiento, DATEDIFF(CURDATE(), s.fecha_vencimiento) AS dias_vencida,
                   'seguro' AS categoria
            FROM vehiculo_seguros s JOIN vehiculos v ON v.id = s.vehiculo_id
            WHERE s.activo = 1 AND v.activo = 1 AND s.fecha_vencimiento < CURDATE()
        `);
        const [revisiones] = await db.query(`
            SELECT v.patente, v.marca, v.modelo, r.tipo AS elemento,
                   r.fecha_vencimiento, DATEDIFF(CURDATE(), r.fecha_vencimiento) AS dias_vencida,
                   'revision' AS categoria
            FROM vehiculo_revisiones r JOIN vehiculos v ON v.id = r.vehiculo_id
            WHERE r.activo = 1 AND v.activo = 1 AND r.fecha_vencimiento < CURDATE()
        `);
        const [licencias] = await db.query(`
            SELECT CONCAT(t.nombres, ' ', t.apellido_paterno) AS nombre,
                   t.rut, t.licencia_conducir, t.licencia_vencimiento AS fecha_vencimiento,
                   DATEDIFF(CURDATE(), t.licencia_vencimiento) AS dias_vencida,
                   'licencia' AS categoria
            FROM trabajadores t
            WHERE t.activo = 1 AND t.licencia_vencimiento IS NOT NULL
              AND t.licencia_vencimiento < CURDATE()
        `);
        return { seguros, revisiones, licencias, total: seguros.length + revisiones.length + licencias.length };
    },
};

module.exports = vehiculosService;
