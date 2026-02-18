const db = require('../config/db');

/**
 * Genera un servicio CRUD genérico para cualquier tabla.
 * @param {string} tableName - Nombre de la tabla en la BD
 * @param {object} options - Opciones de configuración
 * @param {string[]} options.searchFields - Campos para búsqueda (?q=)
 * @param {string} options.joins - JOINs adicionales para el listado
 * @param {string} options.selectFields - Campos a seleccionar (default: tableName.*)
 */
const createCrudService = (tableName, options = {}) => {
    const { searchFields = [], joins = '', selectFields = `${tableName}.*`, activeColumn = 'activo' } = options;

    return {
        async getAll(query = {}) {
            const { page = 1, limit = 50, q, activo } = query;
            const offset = (page - 1) * limit;
            let where = [];
            let params = [];

            // Filter by active status
            if (activo !== undefined) {
                where.push(`${tableName}.${activeColumn} = ?`);
                params.push(activo === 'true' || activo === true ? 1 : 0);
            }

            // Search
            if (q && searchFields.length > 0) {
                const searchConditions = searchFields.map(f => `${tableName}.${f} LIKE ?`).join(' OR ');
                where.push(`(${searchConditions})`);
                searchFields.forEach(() => params.push(`%${q}%`));
            }

            const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

            const [rows] = await db.query(
                `SELECT ${selectFields} FROM ${tableName} ${joins} ${whereClause} ORDER BY ${tableName}.id DESC LIMIT ? OFFSET ?`,
                [...params, Number(limit), Number(offset)]
            );

            const [countResult] = await db.query(
                `SELECT COUNT(*) as total FROM ${tableName} ${whereClause}`,
                params
            );

            return {
                data: rows,
                pagination: {
                    page: Number(page),
                    limit: Number(limit),
                    total: countResult[0].total,
                    pages: Math.ceil(countResult[0].total / limit)
                }
            };
        },

        async getById(id) {
            const [rows] = await db.query(
                `SELECT ${selectFields} FROM ${tableName} ${joins} WHERE ${tableName}.id = ?`,
                [id]
            );
            if (rows.length === 0) {
                throw Object.assign(new Error('Registro no encontrado'), { statusCode: 404 });
            }
            return rows[0];
        },

        async create(data) {
            const fields = Object.keys(data);
            const placeholders = fields.map(() => '?').join(', ');
            const values = Object.values(data);

            const [result] = await db.query(
                `INSERT INTO ${tableName} (${fields.join(', ')}) VALUES (${placeholders})`,
                values
            );
            return { id: result.insertId, ...data };
        },

        async update(id, data) {
            const fields = Object.keys(data).map(f => `${f} = ?`).join(', ');
            const values = [...Object.values(data), id];

            const [result] = await db.query(
                `UPDATE ${tableName} SET ${fields} WHERE id = ?`,
                values
            );

            if (result.affectedRows === 0) {
                throw Object.assign(new Error('Registro no encontrado'), { statusCode: 404 });
            }
            return { id, ...data };
        },

        async softDelete(id) {
            const [result] = await db.query(
                `UPDATE ${tableName} SET ${activeColumn} = FALSE WHERE id = ?`,
                [id]
            );
            if (result.affectedRows === 0) {
                throw Object.assign(new Error('Registro no encontrado'), { statusCode: 404 });
            }
            return { id, [activeColumn]: false };
        }
    };
};

module.exports = createCrudService;
