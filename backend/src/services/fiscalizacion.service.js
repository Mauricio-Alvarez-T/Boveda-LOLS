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
            const words = q.trim().split(/\s+/).filter(w => w.length > 0);
            if (words.length > 0) {
                const blockConditions = [];
                words.forEach(word => {
                    blockConditions.push(`(t.rut LIKE ? OR t.nombres LIKE ? OR t.apellido_paterno LIKE ? OR t.apellido_materno LIKE ?)`);
                    const searchTerm = `%${word}%`;
                    params.push(searchTerm, searchTerm, searchTerm, searchTerm);
                });
                query += ` AND (${blockConditions.join(' AND ')})`;
            }
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

        if (filters.ausentes === 'true') {
            const today = new Date().toISOString().split('T')[0];
            query += ` AND t.id IN (
                SELECT a.trabajador_id 
                FROM asistencias a 
                JOIN estados_asistencia ea ON a.estado_id = ea.id
                WHERE a.fecha = ? AND ea.es_presente = FALSE
            )`;
            params.push(today);
        }

        query += ` ORDER BY t.apellido_paterno ASC, t.apellido_materno ASC, t.nombres ASC`;

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
     * Genera un reporte Excel de fiscalización - DEPRECADO (Usar asistenciaService)
     */
}

module.exports = new FiscalizacionService();
