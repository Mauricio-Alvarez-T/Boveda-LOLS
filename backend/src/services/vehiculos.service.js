const db = require('../config/db');

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
            ${whereClause}
            ORDER BY v.patente ASC
        `, params);

        return rows;
    },

    async getById(id) {
        const [rows] = await db.query(
            'SELECT * FROM vehiculos WHERE id = ? AND activo = 1', [id]
        );
        if (!rows.length) throw Object.assign(new Error('Vehículo no encontrado'), { statusCode: 404 });
        return rows[0];
    },

    async create(data) {
        const { patente, marca, modelo, anio, tipo = 'camioneta', kilometraje_actual = 0, color, observaciones } = data;
        if (!patente || !marca || !modelo || !anio) {
            throw Object.assign(new Error('patente, marca, modelo y anio son obligatorios'), { statusCode: 400 });
        }
        const [result] = await db.query(
            `INSERT INTO vehiculos (patente, marca, modelo, anio, tipo, kilometraje_actual, color, observaciones)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [patente.toUpperCase().trim(), marca, modelo, anio, tipo, kilometraje_actual, color || null, observaciones || null]
        );
        return this.getById(result.insertId);
    },

    async update(id, data) {
        const allowed = ['patente', 'marca', 'modelo', 'anio', 'tipo', 'kilometraje_actual', 'color', 'observaciones', 'activo'];
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
        const { tipo = 'SOAP', compania, numero_poliza, fecha_inicio, fecha_vencimiento, monto, observaciones } = data;
        if (!fecha_inicio || !fecha_vencimiento) {
            throw Object.assign(new Error('fecha_inicio y fecha_vencimiento son obligatorias'), { statusCode: 400 });
        }
        const [r] = await db.query(
            `INSERT INTO vehiculo_seguros (vehiculo_id, tipo, compania, numero_poliza, fecha_inicio, fecha_vencimiento, monto, observaciones)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [vehiculoId, tipo, compania || null, numero_poliza || null, fecha_inicio, fecha_vencimiento, monto || null, observaciones || null]
        );
        const [rows] = await db.query('SELECT * FROM vehiculo_seguros WHERE id = ?', [r.insertId]);
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
        const { tipo, fecha, fecha_vencimiento, resultado = 'aprobado', planta, observaciones } = data;
        if (!tipo || !fecha || !fecha_vencimiento) {
            throw Object.assign(new Error('tipo, fecha y fecha_vencimiento son obligatorios'), { statusCode: 400 });
        }
        const [r] = await db.query(
            `INSERT INTO vehiculo_revisiones (vehiculo_id, tipo, fecha, fecha_vencimiento, resultado, planta, observaciones)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [vehiculoId, tipo, fecha, fecha_vencimiento, resultado, planta || null, observaciones || null]
        );
        const [rows] = await db.query('SELECT * FROM vehiculo_revisiones WHERE id = ?', [r.insertId]);
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
        const { fecha, tipo, km_al_realizar, descripcion, costo, taller } = data;
        if (!fecha || !tipo || km_al_realizar === undefined) {
            throw Object.assign(new Error('fecha, tipo y km_al_realizar son obligatorios'), { statusCode: 400 });
        }
        const [r] = await db.query(
            `INSERT INTO vehiculo_mantenciones (vehiculo_id, fecha, tipo, km_al_realizar, descripcion, costo, taller)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [vehiculoId, fecha, tipo, km_al_realizar, descripcion || null, costo || null, taller || null]
        );
        const [rows] = await db.query('SELECT * FROM vehiculo_mantenciones WHERE id = ?', [r.insertId]);
        return rows[0];
    },

    async removeMantencion(vehiculoId, mantencionId) {
        await db.query('UPDATE vehiculo_mantenciones SET activo = 0 WHERE id = ? AND vehiculo_id = ?', [mantencionId, vehiculoId]);
        return { id: mantencionId, activo: false };
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
