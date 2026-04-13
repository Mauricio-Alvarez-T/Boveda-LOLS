const db = require('../config/db');

const bombaHormigonService = {
    async registrar(data, userId) {
        const { obra_id, fecha, tipo_bomba, es_externa, proveedor, costo, observaciones } = data;
        const [result] = await db.query(
            `INSERT INTO registro_bombas_hormigon (obra_id, fecha, tipo_bomba, es_externa, proveedor, costo, observaciones, registrado_por)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [obra_id, fecha, tipo_bomba, es_externa || false, proveedor || null, costo || null, observaciones || null, userId]
        );
        return { id: result.insertId };
    },

    async update(id, data) {
        const fields = ['obra_id', 'fecha', 'tipo_bomba', 'es_externa', 'proveedor', 'costo', 'observaciones']
            .filter(f => data[f] !== undefined);
        if (!fields.length) throw new Error('Nada que actualizar');

        const setClauses = fields.map(f => `${f} = ?`).join(', ');
        const values = fields.map(f => data[f]);
        await db.query(`UPDATE registro_bombas_hormigon SET ${setClauses} WHERE id = ?`, [...values, id]);
        return { id };
    },

    async remove(id) {
        await db.query('UPDATE registro_bombas_hormigon SET activo = 0 WHERE id = ?', [id]);
        return { id };
    },

    async getAll(query = {}) {
        const { obra_id, fecha_desde, fecha_hasta, page = 1, limit = 50 } = query;
        let where = 'WHERE r.activo = 1';
        const params = [];
        if (obra_id) { where += ' AND r.obra_id = ?'; params.push(obra_id); }
        if (fecha_desde) { where += ' AND r.fecha >= ?'; params.push(fecha_desde); }
        if (fecha_hasta) { where += ' AND r.fecha <= ?'; params.push(fecha_hasta); }

        const offset = (page - 1) * limit;
        const [rows] = await db.query(`
            SELECT r.*, o.nombre as obra_nombre, u.nombre as registrado_por_nombre
            FROM registro_bombas_hormigon r
            JOIN obras o ON r.obra_id = o.id
            LEFT JOIN usuarios u ON r.registrado_por = u.id
            ${where}
            ORDER BY r.fecha DESC, r.id DESC
            LIMIT ? OFFSET ?
        `, [...params, limit, offset]);

        return { data: rows };
    },

    async getResumenPorObra(obraId, mes, anio) {
        const startDate = `${anio}-${String(mes).padStart(2, '0')}-01`;
        const lastDay = new Date(anio, mes, 0).getDate();
        const endDate = `${anio}-${String(mes).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

        const [rows] = await db.query(`
            SELECT r.*, o.nombre as obra_nombre
            FROM registro_bombas_hormigon r
            JOIN obras o ON r.obra_id = o.id
            WHERE r.obra_id = ? AND r.fecha BETWEEN ? AND ? AND r.activo = 1
            ORDER BY r.fecha ASC
        `, [obraId, startDate, endDate]);

        const totalExternas = rows.filter(r => r.es_externa).length;
        const totalPropias = rows.filter(r => !r.es_externa).length;
        const costoTotal = rows.reduce((sum, r) => sum + (parseFloat(r.costo) || 0), 0);

        return { registros: rows, totalExternas, totalPropias, costoTotal };
    }
};

module.exports = bombaHormigonService;
