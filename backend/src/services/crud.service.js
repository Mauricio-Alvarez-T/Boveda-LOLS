const db = require('../config/db');
const ExcelJS = require('exceljs');

/**
 * Genera un servicio CRUD genérico para cualquier tabla.
 * @param {string} tableName - Nombre de la tabla en la BD
 * @param {object} options - Opciones de configuración
 * @param {string[]} options.searchFields - Campos para búsqueda (?q=)
 * @param {string} options.joins - JOINs adicionales para el listado
 * @param {string} options.selectFields - Campos a seleccionar (default: tableName.*)
 */
const createCrudService = (tableName, options = {}) => {
    const { searchFields = [], joins = '', selectFields = `${tableName}.*`, activeColumn = 'activo', allowedFilters = [] } = options;

    return {
        // ... (getAll, getById, create, update, softDelete methods remain the same)
        async getAll(query = {}) {
            const { page = 1, limit = 50, q, activo } = query;
            const offset = (page - 1) * limit;
            let where = [];
            let params = [];

            if (activo !== undefined) {
                where.push(`${tableName}.${activeColumn} = ?`);
                params.push(activo === 'true' || activo === true ? 1 : 0);
            }

            if (allowedFilters.length > 0) {
                allowedFilters.forEach(field => {
                    if (query[field] !== undefined) {
                        where.push(`${tableName}.${field} = ?`);
                        params.push(query[field]);
                    }
                });
            }

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
        },

        async exportToExcel(query = {}, entityName = 'Reporte') {
            // Get all data without pagination
            const { q, activo } = query;
            let where = [];
            let params = [];

            if (activo !== undefined) {
                where.push(`${tableName}.${activeColumn} = ?`);
                params.push(activo === 'true' || activo === true ? 1 : 0);
            }

            if (allowedFilters.length > 0) {
                allowedFilters.forEach(field => {
                    if (query[field] !== undefined) {
                        where.push(`${tableName}.${field} = ?`);
                        params.push(query[field]);
                    }
                });
            }

            if (q && searchFields.length > 0) {
                const searchConditions = searchFields.map(f => `${tableName}.${f} LIKE ?`).join(' OR ');
                where.push(`(${searchConditions})`);
                searchFields.forEach(() => params.push(`%${q}%`));
            }

            const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
            const [rows] = await db.query(
                `SELECT ${selectFields} FROM ${tableName} ${joins} ${whereClause} ORDER BY ${tableName}.id DESC`,
                params
            );

            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet(entityName, {
                views: [{ state: 'frozen', ySplit: 6, xSplit: 0 }],
                pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1 }
            });

            // 1. EXECUTIVE HEADER (Unified Style)
            worksheet.mergeCells('A1:H2');
            const titleCell = worksheet.getCell('A1');
            titleCell.value = `REPORTE EJECUTIVO DE ${entityName.toUpperCase()}`;
            titleCell.font = { name: 'Segoe UI', size: 18, bold: true, color: { argb: 'FF1E293B' } };
            titleCell.alignment = { vertical: 'middle', horizontal: 'center' };

            worksheet.mergeCells('A3:H3');
            const subTitle = worksheet.getCell('A3');
            subTitle.value = 'Detalle administrativo y configuración de sistema';
            subTitle.font = { name: 'Segoe UI', size: 11, italic: true, color: { argb: 'FF64748B' } };
            subTitle.alignment = { horizontal: 'center' };

            // Metadata Row
            worksheet.getCell('A5').value = 'FECHA REPORTE:';
            worksheet.getCell('B5').value = new Date().toLocaleDateString('es-CL');
            worksheet.getCell('D5').value = 'TOTAL REGISTROS:';
            worksheet.getCell('E5').value = rows.length;
            [worksheet.getCell('A5'), worksheet.getCell('D5')].forEach(c => {
                c.font = { bold: true, size: 9, color: { argb: 'FF475569' } };
            });

            // 2. TABLE HEADERS
            if (rows.length > 0) {
                const headerRow = 6;
                // Filter out technical fields and URLs
                const keys = Object.keys(rows[0]).filter(k => {
                    const isTechnical = ['id', 'activo'].includes(k) || k.endsWith('_id');
                    const isUrl = k.endsWith('_url');
                    return !isTechnical && !isUrl;
                });

                // Label mapping dictionary
                const labelMap = {
                    'nombres': 'NOMBRES',
                    'apellido_paterno': 'APELLIDO PATERNO',
                    'apellido_materno': 'APELLIDO MATERNO',
                    'empresa_nombre': 'EMPRESA',
                    'obra_nombre': 'OBRA',
                    'cargo_nombre': 'CARGO',
                    'razon_social': 'RAZÓN SOCIAL',
                    'rut': 'RUT',
                    'direccion': 'DIRECCIÓN',
                    'nombre': 'NOMBRE',
                    'codigo': 'CÓDIGO',
                    'color': 'COLOR',
                    'descripcion': 'DESCRIPCIÓN',
                    'fecha_creacion': 'F. CREACIÓN',
                    'fecha_ingreso': 'F. INGRESO',
                    'obligatorio': 'OBLIGATORIO',
                    'categoria_reporte': 'CATEGORÍA',
                    'email': 'CORREO ELECTRÓNICO',
                    'telefono': 'TELÉFONO'
                };

                keys.forEach((key, i) => {
                    const cell = worksheet.getCell(headerRow, i + 1);
                    // Use mapping or clean up technical name
                    const rawLabel = labelMap[key] || key.replace(/_/g, ' ').toUpperCase();
                    cell.value = rawLabel;

                    cell.font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
                    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
                    cell.border = { bottom: { style: 'medium', color: { argb: 'FF000000' } } };

                    // Default width
                    worksheet.getColumn(i + 1).width = 25;
                });
                worksheet.getRow(headerRow).height = 25;

                // 3. DATA ROWS
                rows.forEach((r, index) => {
                    const rowData = keys.map(k => {
                        const val = r[k];
                        if (val instanceof Date) return val.toLocaleDateString('es-CL');
                        if (typeof val === 'boolean') return val ? 'SÍ' : 'NO';
                        return val || '-';
                    });

                    const row = worksheet.addRow(rowData);
                    row.height = 28; // Standard row height for clarity

                    if (index % 2 === 1) {
                        row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
                    }

                    row.eachCell({ includeEmpty: true }, (cell) => {
                        cell.font = { name: 'Segoe UI', size: 10 };
                        cell.alignment = { vertical: 'middle', wrapText: true };
                        cell.border = {
                            bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                            right: { style: 'thin', color: { argb: 'FFF1F5F9' } }
                        };
                    });
                });

                // Auto-filter
                worksheet.autoFilter = {
                    from: { row: headerRow, column: 1 },
                    to: { row: headerRow + rows.length, column: keys.length }
                };
            }

            return await workbook.xlsx.writeBuffer();
        }
    };
};

module.exports = createCrudService;
