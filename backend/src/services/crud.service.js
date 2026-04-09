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
    const { 
        searchFields = [], 
        joins = '', 
        selectFields = `${tableName}.*`, 
        activeColumn = 'activo', 
        allowedFilters = [],
        allowedFields = [] // Whitelist for create/update
    } = options;

    return {
        // ... (getAll, getById, create, update, softDelete methods remain the same)
        async getAll(query = {}) {
            const { page = 1, limit = 50, q, activo } = query;
            const offset = (page - 1) * limit;
            let where = [];
            let params = [];

            if (activo !== undefined && activo !== 'all') {
                where.push(`${tableName}.${activeColumn} = ?`);
                params.push(activo === 'true' || activo === true || activo === '1' || activo === 1 ? 1 : 0);
            } else if (activo === undefined && options.useSoftDelete) {
                // Si no se especifica 'activo', filtrar por activos por defecto para seguridad
                where.push(`${tableName}.${activeColumn} = 1`);
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
                const words = q.trim().split(/\s+/).filter(w => w.length > 0);
                if (words.length > 0) {
                    const blockConditions = [];
                    words.forEach(word => {
                        const searchConditions = searchFields.map(f => {
                            if (f === 'rut') return `REPLACE(REPLACE(${tableName}.${f}, '.', ''), '-', '') LIKE ?`;
                            return `${tableName}.${f} LIKE ?`;
                        }).join(' OR ');
                        blockConditions.push(`(${searchConditions})`);
                        
                        searchFields.forEach(f => {
                            if (f === 'rut') params.push(`%${word.replace(/[.-]/g, '')}%`);
                            else params.push(`%${word}%`);
                        });
                    });
                    
                    let finalCondition = `(${blockConditions.join(' AND ')})`;
                    
                    // Si hay múltiples palabras (ej. "17 611 988-8") intentamos buscar el string completo sin separadores
                    if (searchFields.includes('rut') && words.length > 1) {
                        const collapsedQuery = q.replace(/[\s.-]/g, '');
                        if (collapsedQuery.length > 0) {
                            finalCondition = `(${finalCondition} OR REPLACE(REPLACE(${tableName}.rut, '.', ''), '-', '') LIKE ?)`;
                            params.push(`%${collapsedQuery}%`);
                        }
                    }
                    
                    where.push(finalCondition);
                }
            }

            const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
            const orderByClause = options.orderBy ? `ORDER BY ${options.orderBy}` : `ORDER BY ${tableName}.id DESC`;

            const [rows] = await db.query(
                `SELECT ${selectFields} FROM ${tableName} ${joins} ${whereClause} ${orderByClause} LIMIT ? OFFSET ?`,
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
            // ── SEGURIDAD: Whitelist de campos ──
            const safeData = {};
            if (allowedFields.length > 0) {
                allowedFields.forEach(f => {
                    if (data[f] !== undefined) safeData[f] = data[f];
                });
            } else {
                // Si no hay whitelist, por ahora permitimos todo pero logueamos peligro
                // TODO: Hacer esto estricto una vez configurado en index.js
                Object.assign(safeData, data);
                console.warn(`⚠️ ALERTA DE SEGURIDAD: Tabla [${tableName}] no tiene whitelist de campos definida.`);
            }

            if (safeData.rut) {
                const { formatRut } = require('../utils/rut');
                safeData.rut = formatRut(safeData.rut);
            }
            const fields = Object.keys(safeData);
            if (fields.length === 0) throw Object.assign(new Error('No hay campos válidos para crear'), { statusCode: 400 });

            const placeholders = fields.map(() => '?').join(', ');
            const values = Object.values(safeData);

            try {
                const [result] = await db.query(
                    `INSERT INTO ${tableName} (${fields.join(', ')}) VALUES (${placeholders})`,
                    values
                );
                return { id: result.insertId, ...data };
            } catch (err) {
                // If it's a duplicate entry error (ER_DUP_ENTRY)
                if (err.errno === 1062 || err.code === 'ER_DUP_ENTRY') {
                    // Determine which inactive column exists in this table
                    const [cols] = await db.query(`SHOW COLUMNS FROM ${tableName} WHERE Field IN ('activo', 'activa')`);
                    const inactiveCol = cols.length > 0 ? cols[0].Field : null;

                    if (inactiveCol) {
                        const searchField = data.nombre ? 'nombre' : (data.razon_social ? 'razon_social' : null);
                        let inactiveQuery = `SELECT id FROM ${tableName} WHERE ${inactiveCol} = 0`;
                        let queryParams = [];

                        if (searchField) {
                            inactiveQuery += ` AND ${searchField} = ?`;
                            queryParams.push(data[searchField]);
                        }
                        inactiveQuery += ` LIMIT 1`;

                        const [inactive] = await db.query(inactiveQuery, queryParams);

                        if (inactive.length > 0) {
                            if (searchField) {
                                await db.query(`DELETE FROM ${tableName} WHERE ${inactiveCol} = 0 AND ${searchField} = ?`, queryParams);
                            } else {
                                await db.query(`DELETE FROM ${tableName} WHERE ${inactiveCol} = 0`);
                            }

                            const [retryResult] = await db.query(
                                `INSERT INTO ${tableName} (${fields.join(', ')}) VALUES (${placeholders})`,
                                values
                            );
                            return { id: retryResult.insertId, ...data };
                        }
                    }
                }
                throw err;
            }
        },

        async update(id, data) {
            // ── SEGURIDAD: Whitelist de campos ──
            const safeData = {};
            if (allowedFields.length > 0) {
                allowedFields.forEach(f => {
                    if (data[f] !== undefined) safeData[f] = data[f];
                });
            } else {
                Object.assign(safeData, data);
                console.warn(`⚠️ ALERTA DE SEGURIDAD: Tabla [${tableName}] no tiene whitelist de campos definida (update).`);
            }

            if (safeData.rut) {
                const { formatRut } = require('../utils/rut');
                safeData.rut = formatRut(safeData.rut);
            }
            const fields = Object.keys(safeData).map(f => `${f} = ?`).join(', ');
            const values = [...Object.values(safeData), id];

            if (Object.keys(safeData).length === 0) throw Object.assign(new Error('No hay campos válidos para actualizar'), { statusCode: 400 });

            const [result] = await db.query(
                `UPDATE ${tableName} SET ${fields} WHERE id = ?`,
                values
            );

            if (result.affectedRows === 0) {
                throw Object.assign(new Error('Registro no encontrado'), { statusCode: 404 });
            }
            return { id, ...safeData };
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

        async hardDelete(id) {
            try {
                const [result] = await db.query(
                    `DELETE FROM ${tableName} WHERE id = ?`,
                    [id]
                );
                if (result.affectedRows === 0) {
                    throw Object.assign(new Error('Registro no encontrado'), { statusCode: 404 });
                }
                return { id, deleted: true };
            } catch (err) {
                if (err.code === 'ER_ROW_IS_REFERENCED_2' || err.errno === 1451) {
                    throw Object.assign(new Error(`No se puede eliminar de ${tableName} debido a que está referenciado por otros registros en el sistema.`), { statusCode: 400 });
                }
                throw err;
            }
        },

        async exportToExcel(query = {}, entityName = 'Reporte') {
            // Get all data without pagination
            const { q, activo } = query;
            let where = [];
            let params = [];

            if (activo !== undefined && activo !== 'all') {
                where.push(`${tableName}.${activeColumn} = ?`);
                params.push(activo === 'true' || activo === true || activo === '1' || activo === 1 ? 1 : 0);
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
                const words = q.trim().split(/\s+/).filter(w => w.length > 0);
                if (words.length > 0) {
                    const blockConditions = [];
                    words.forEach(word => {
                        const searchConditions = searchFields.map(f => `${tableName}.${f} LIKE ?`).join(' OR ');
                        blockConditions.push(`(${searchConditions})`);
                        searchFields.forEach(() => params.push(`%${word}%`));
                    });
                    where.push(`(${blockConditions.join(' AND ')})`);
                }
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
