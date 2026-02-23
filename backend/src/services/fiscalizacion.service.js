const db = require('../config/db');
const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');
const emailService = require('./email.service');

class FiscalizacionService {
    /**
     * Búsqueda avanzada de trabajadores con múltiples filtros y cálculo de completitud en una sola query.
     */
    async searchTrabajadores(filters) {
        const {
            q,
            obra_id,
            empresa_id,
            cargo_id,
            categoria_reporte,
            activo,
            completitud // '100', 'faltantes', 'todos'
        } = filters;

        // 1. Get total mandatory docs (required to calculate percentage in DB)
        const [totalRows] = await db.query(
            'SELECT COUNT(*) as total FROM tipos_documento WHERE obligatorio = TRUE AND activo = TRUE'
        );
        const totalObligatorios = totalRows[0].total;

        let query = `
            SELECT 
                t.*,
                e.razon_social as empresa_nombre,
                o.nombre as obra_nombre,
                c.nombre as cargo_nombre,
                COALESCE(docs.uploaded, 0) as docs_subidos,
                ? as docs_totales
            FROM trabajadores t
            LEFT JOIN empresas e ON t.empresa_id = e.id
            LEFT JOIN obras o ON t.obra_id = o.id
            LEFT JOIN cargos c ON t.cargo_id = c.id
            LEFT JOIN (
                SELECT d.trabajador_id, COUNT(DISTINCT d.tipo_documento_id) as uploaded
                FROM documentos d
                JOIN tipos_documento td ON d.tipo_documento_id = td.id
                WHERE d.activo = TRUE
                  AND td.obligatorio = TRUE
                  AND td.activo = TRUE
                GROUP BY d.trabajador_id
            ) docs ON t.id = docs.trabajador_id
            WHERE 1=1
        `;

        const params = [totalObligatorios];

        if (activo !== undefined && activo !== '') {
            query += ` AND t.activo = ?`;
            params.push(activo === 'true' || activo === true ? 1 : 0);
        }

        if (obra_id) {
            query += ` AND t.obra_id = ?`;
            params.push(obra_id);
        }

        if (empresa_id) {
            query += ` AND t.empresa_id = ?`;
            params.push(empresa_id);
        }

        if (cargo_id) {
            query += ` AND t.cargo_id = ?`;
            params.push(cargo_id);
        }

        if (categoria_reporte) {
            query += ` AND t.categoria_reporte = ?`;
            params.push(categoria_reporte);
        }

        if (q) {
            query += ` AND (t.rut LIKE ? OR t.nombres LIKE ? OR t.apellido_paterno LIKE ? OR t.apellido_materno LIKE ?)`;
            const searchTerm = `%${q}%`;
            params.push(searchTerm, searchTerm, searchTerm, searchTerm);
        }

        if (completitud) {
            if (completitud === '100') {
                query += ` AND COALESCE(docs.uploaded, 0) >= ?`;
                params.push(totalObligatorios);
            } else if (completitud === 'faltantes') {
                query += ` AND COALESCE(docs.uploaded, 0) < ?`;
                params.push(totalObligatorios);
            }
        }

        query += ` ORDER BY t.nombres ASC, t.apellido_paterno ASC`;

        const [rows] = await db.query(query, params);

        // Map percentage
        return rows.map(row => {
            const percentage = totalObligatorios === 0 ? 100 : Math.round((row.docs_subidos / totalObligatorios) * 100);
            return {
                ...row,
                docs_porcentaje: percentage
            };
        });
    }

    /**
     * Genera un reporte Excel de fiscalización bien estructurado.
     */
    async generarExcel(trabajadores) {
        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'Bóveda LOLS';
        workbook.lastModifiedBy = 'Sistema Bóveda';
        workbook.created = new Date();

        const sheet = workbook.addWorksheet('Reporte de Fiscalización', {
            views: [{ state: 'frozen', ySplit: 7, xSplit: 0, activePane: 'bottomRight' }],
            pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1 }
        });

        // 1. EXECUTIVE HEADER (Rows 1-6)
        // Title
        sheet.mergeCells('A1:I2');
        const titleCell = sheet.getCell('A1');
        titleCell.value = 'REPORTE EJECUTIVO DE FISCALIZACIÓN';
        titleCell.font = { name: 'Segoe UI', size: 18, bold: true, color: { argb: 'FF1E293B' } };
        titleCell.alignment = { vertical: 'middle', horizontal: 'center' };

        // Subtitle / Info
        sheet.mergeCells('A3:I3');
        const subTitle = sheet.getCell('A3');
        subTitle.value = 'Estado Documental y Contractual de Nómina';
        subTitle.font = { name: 'Segoe UI', size: 11, italic: true, color: { argb: 'FF64748B' } };
        subTitle.alignment = { horizontal: 'center' };

        // Metadata Labels
        sheet.getCell('A5').value = 'FECHA DE GENERACIÓN:';
        sheet.getCell('B5').value = new Date().toLocaleString('es-CL');
        sheet.getCell('D5').value = 'TRABAJADORES:';
        sheet.getCell('E5').value = trabajadores.length;
        sheet.getCell('G5').value = 'ESTADO:';
        sheet.getCell('H5').value = 'CONSOLIDADO';

        [sheet.getCell('A5'), sheet.getCell('D5'), sheet.getCell('G5')].forEach(c => {
            c.font = { bold: true, size: 9, color: { argb: 'FF475569' } };
        });

        // 2. TABLE HEADERS (Row 7)
        const headerRow = 7;
        sheet.columns = [
            { key: 'rut', width: 14 },
            { key: 'nombres', width: 25 },
            { key: 'apellidos', width: 25 },
            { key: 'empresa', width: 35 },
            { key: 'obra', width: 20 },
            { key: 'cargo', width: 20 },
            { key: 'ingreso', width: 14 },
            { key: 'estado', width: 12 },
            { key: 'docs', width: 18 }
        ];

        // Headers labels
        const headers = ['RUT', 'Nombres', 'Apellidos', 'Empresa', 'Obra', 'Cargo', 'F. Ingreso', 'Estado', 'Documentación'];
        headers.forEach((h, i) => {
            const cell = sheet.getCell(headerRow, i + 1);
            cell.value = h.toUpperCase();
            cell.font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } }; // Slate 800
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
            cell.border = { bottom: { style: 'medium', color: { argb: 'FF000000' } } };
        });
        sheet.getRow(headerRow).height = 25;

        // 3. DATA ROWS (Row 8+)
        trabajadores.forEach((t, index) => {
            const rowNum = headerRow + 1 + index;
            const apellidos = [t.apellido_paterno, t.apellido_materno].filter(Boolean).join(' ');
            const ingreso = t.fecha_ingreso ? new Date(t.fecha_ingreso).toLocaleDateString('es-CL') : '-';

            // Visual indicators for docs
            let docsIcon = (t.docs_porcentaje === 100) ? '✔ AL DÍA' : `✘ FALTAN (${t.docs_porcentaje}%)`;

            const rowData = [
                t.rut,
                t.nombres,
                apellidos,
                t.empresa_nombre || '-',
                t.obra_nombre || '-',
                t.cargo_nombre || '-',
                ingreso,
                t.activo ? 'ACTIVO' : 'INACTIVO',
                docsIcon
            ];

            const row = sheet.addRow(rowData);
            row.height = 22;
            row.alignment = { vertical: 'middle' };

            // Zebra styling
            if (index % 2 === 1) {
                row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } }; // Slate 50
            }

            // Cell formatting
            row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
                cell.font = { name: 'Segoe UI', size: 10 };
                cell.border = {
                    bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                    right: { style: 'thin', color: { argb: 'FFF1F5F9' } }
                };

                // Specific column formatting
                if (colNumber === 8) { // Estado
                    cell.font = { ...cell.font, bold: true, color: { argb: t.activo ? 'FF166534' : 'FF991B1B' } };
                    cell.alignment = { horizontal: 'center', vertical: 'middle' };
                }
                if (colNumber === 9) { // Documentación
                    const color = (t.docs_porcentaje === 100) ? 'FF15803D' : 'FFDC2626';
                    cell.font = { ...cell.font, bold: true, color: { argb: color } };
                    cell.alignment = { horizontal: 'center', vertical: 'middle' };
                }
                if (colNumber === 1 || colNumber === 7) {
                    cell.alignment = { horizontal: 'center', vertical: 'middle' };
                }
            });
        });

        // 4. AUTO-FILTER
        sheet.autoFilter = {
            from: { row: headerRow, column: 1 },
            to: { row: headerRow + trabajadores.length, column: 9 }
        };

        // 5. METADATA SHEET (Keep as hidden or secondary for audit)
        const metaSheet = workbook.addWorksheet('Sistema Auth', { state: 'hidden' });
        metaSheet.addRow(['Generado el', new Date().toISOString()]);
        metaSheet.addRow(['Total Registros', trabajadores.length]);

        const tempPath = path.join(__dirname, '..', '..', 'tmp', `Fiscalizacion_${Date.now()}.xlsx`);
        if (!fs.existsSync(path.dirname(tempPath))) {
            fs.mkdirSync(path.dirname(tempPath), { recursive: true });
        }
        await workbook.xlsx.writeFile(tempPath);
        return tempPath;
    }
}

module.exports = new FiscalizacionService();
