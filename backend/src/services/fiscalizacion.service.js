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
        workbook.created = new Date();

        const sheet = workbook.addWorksheet('Nómina de Fiscalización', {
            views: [{ state: 'frozen', ySplit: 1 }]
        });

        sheet.columns = [
            { header: 'RUT', key: 'rut', width: 15 },
            { header: 'Nombres', key: 'nombres', width: 30 },
            { header: 'Apellidos', key: 'apellidos', width: 30 },
            { header: 'Empresa', key: 'empresa', width: 35 },
            { header: 'Obra', key: 'obra', width: 25 },
            { header: 'Cargo', key: 'cargo', width: 25 },
            { header: 'Fecha Ingreso', key: 'ingreso', width: 15 },
            { header: 'Estado', key: 'estado', width: 15 },
            { header: 'Documentación al Día', key: 'docs', width: 20 }
        ];

        // Format Header
        sheet.getRow(1).font = { name: 'Arial', family: 4, size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
        sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0071E3' } }; // Blue institutional
        sheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
        sheet.getRow(1).height = 25;

        // Add Data
        trabajadores.forEach(t => {
            const apellidos = [t.apellido_paterno, t.apellido_materno].filter(Boolean).join(' ');
            const ingreso = t.fecha_ingreso ? new Date(t.fecha_ingreso).toLocaleDateString('es-CL') : 'No registrada';
            const docsStatus = t.docs_porcentaje === 100 ? 'Sí (100%)' : `No (${t.docs_porcentaje}%)`;

            const row = sheet.addRow({
                rut: t.rut,
                nombres: t.nombres,
                apellidos: apellidos,
                empresa: t.empresa_nombre || 'Sin Empresa',
                obra: t.obra_nombre || 'Sin Obra',
                cargo: t.cargo_nombre || 'Sin Cargo',
                ingreso: ingreso,
                estado: t.activo ? 'Activo' : 'Inactivo',
                docs: docsStatus
            });

            // Color code missing docs and inactive
            if (!t.activo) {
                row.font = { color: { argb: 'FF999999' }, italic: true };
            } else if (t.docs_porcentaje < 100) {
                row.getCell('docs').font = { color: { argb: 'FFFF3B30' }, bold: true }; // Red
            } else {
                row.getCell('docs').font = { color: { argb: 'FF34C759' }, bold: true }; // Green
            }
        });

        // Add Auto-Filters
        sheet.autoFilter = {
            from: 'A1',
            to: 'I1',
        };

        const tempPath = path.join(__dirname, '..', '..', 'tmp', `Fiscalizacion_${Date.now()}.xlsx`);

        // Ensure tmp dir exists
        if (!fs.existsSync(path.dirname(tempPath))) {
            fs.mkdirSync(path.dirname(tempPath), { recursive: true });
        }

        await workbook.xlsx.writeFile(tempPath);
        return tempPath;
    }
}

module.exports = new FiscalizacionService();
