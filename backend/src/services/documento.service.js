const db = require('../config/db');
const pdfService = require('./pdf.service');
const path = require('path');

const documentoService = {
    async upload(trabajadorId, file, tipoDocumentoId, userId) {
        // Get worker and company RUT
        const [trabajadores] = await db.query(
            `SELECT t.rut as rut_trabajador, e.rut as rut_empresa 
       FROM trabajadores t 
       LEFT JOIN empresas e ON t.empresa_id = e.id 
       WHERE t.id = ?`,
            [trabajadorId]
        );

        if (trabajadores.length === 0) {
            throw Object.assign(new Error('Trabajador no encontrado'), { statusCode: 404 });
        }

        const { rut_trabajador, rut_empresa } = trabajadores[0];

        // Convert to PDF and rename
        const { finalPath, fileName } = await pdfService.processFile(
            file.path,
            file.mimetype,
            rut_trabajador,
            rut_empresa || 'SIN-EMPRESA'
        );

        // Calculate expiration date if tipo_documento has vigencia
        const [tipos] = await db.query('SELECT dias_vigencia FROM tipos_documento WHERE id = ?', [tipoDocumentoId]);
        let fechaVencimiento = null;
        if (tipos.length > 0 && tipos[0].dias_vigencia) {
            const d = new Date();
            d.setDate(d.getDate() + tipos[0].dias_vigencia);
            fechaVencimiento = d.toISOString().split('T')[0];
        }

        // Save to DB
        const relativePath = path.relative(path.join(__dirname, '../../uploads'), finalPath);
        const [result] = await db.query(
            `INSERT INTO documentos (trabajador_id, tipo_documento_id, nombre_archivo, ruta_archivo, rut_empresa_al_subir, fecha_vencimiento, subido_por)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [trabajadorId, tipoDocumentoId, fileName, relativePath, rut_empresa || 'SIN-EMPRESA', fechaVencimiento, userId]
        );

        return { id: result.insertId, nombre_archivo: fileName, fecha_vencimiento: fechaVencimiento };
    },

    async getByTrabajador(trabajadorId) {
        const [rows] = await db.query(
            `SELECT d.*, td.nombre as tipo_nombre 
       FROM documentos d 
       JOIN tipos_documento td ON d.tipo_documento_id = td.id 
       WHERE d.trabajador_id = ? AND d.activo = TRUE 
       ORDER BY d.fecha_subida DESC`,
            [trabajadorId]
        );
        return rows;
    },

    async getFilePath(id) {
        const [rows] = await db.query('SELECT ruta_archivo, nombre_archivo FROM documentos WHERE id = ? AND activo = TRUE', [id]);
        if (rows.length === 0) {
            throw Object.assign(new Error('Documento no encontrado'), { statusCode: 404 });
        }
        return {
            fullPath: path.join(__dirname, '../../uploads', rows[0].ruta_archivo),
            fileName: rows[0].nombre_archivo
        };
    },

    async getVencidos(dias = 30) {
        const [rows] = await db.query(
            `SELECT d.*, t.rut, t.nombres, t.apellido_paterno, td.nombre as tipo_nombre
       FROM documentos d
       JOIN trabajadores t ON d.trabajador_id = t.id
       JOIN tipos_documento td ON d.tipo_documento_id = td.id
       WHERE d.activo = TRUE 
         AND d.fecha_vencimiento IS NOT NULL
         AND d.fecha_vencimiento <= DATE_ADD(CURDATE(), INTERVAL ? DAY)
       ORDER BY d.fecha_vencimiento ASC`,
            [dias]
        );
        return rows;
    },

    async getFaltantes() {
        const [rows] = await db.query(
            `SELECT t.id, t.rut, t.nombres, t.apellido_paterno, td.id as tipo_doc_id, td.nombre as tipo_doc_nombre
       FROM trabajadores t
       CROSS JOIN tipos_documento td
       LEFT JOIN documentos d ON d.trabajador_id = t.id AND d.tipo_documento_id = td.id AND d.activo = TRUE
       WHERE t.activo = TRUE AND td.obligatorio = TRUE AND td.activo = TRUE AND d.id IS NULL
       ORDER BY t.apellido_paterno, td.nombre`
        );
        return rows;
    },

    async getCompletionByTrabajadores(trabajadorIds) {
        if (!trabajadorIds || trabajadorIds.length === 0) return {};

        // Count total mandatory document types
        const [totalRows] = await db.query(
            'SELECT COUNT(*) as total FROM tipos_documento WHERE obligatorio = TRUE AND activo = TRUE'
        );
        const totalObligatorios = totalRows[0].total;

        const result = {};
        // Default everyone to 0
        trabajadorIds.forEach(id => {
            result[id] = {
                uploaded: 0,
                total: totalObligatorios,
                percentage: totalObligatorios === 0 ? 100 : 0
            };
        });

        if (totalObligatorios === 0) return result;

        // Count how many mandatory docs each worker has uploaded
        const placeholders = trabajadorIds.map(() => '?').join(',');
        const [rows] = await db.query(
            `SELECT d.trabajador_id, COUNT(DISTINCT d.tipo_documento_id) as uploaded
             FROM documentos d
             JOIN tipos_documento td ON d.tipo_documento_id = td.id
             WHERE d.trabajador_id IN (${placeholders})
               AND d.activo = TRUE
               AND td.obligatorio = TRUE
               AND td.activo = TRUE
             GROUP BY d.trabajador_id`,
            trabajadorIds
        );

        rows.forEach(row => {
            result[row.trabajador_id] = {
                uploaded: row.uploaded,
                total: totalObligatorios,
                percentage: Math.round((row.uploaded / totalObligatorios) * 100)
            };
        });
        return result;
    },
    async delete(id) {
        const [result] = await db.query('UPDATE documentos SET activo = FALSE WHERE id = ?', [id]);
        if (result.affectedRows === 0) {
            throw Object.assign(new Error('Documento no encontrado'), { statusCode: 404 });
        }
        return { message: 'Documento eliminado correctamente' };
    },
    async downloadAll(trabajadorId, res) {
        const archiver = require('archiver');
        const fs = require('fs');

        // Get all active documents for the worker
        const docs = await this.getByTrabajador(trabajadorId);
        if (docs.length === 0) {
            throw Object.assign(new Error('No hay documentos para descargar'), { statusCode: 404 });
        }

        // Get worker info for the zip filename
        const [trabajador] = await db.query('SELECT rut, nombres, apellido_paterno FROM trabajadores WHERE id = ?', [trabajadorId]);
        const workerName = trabajador[0] ? `${trabajador[0].nombres}_${trabajador[0].apellido_paterno}`.replace(/ /g, '_') : 'documentos';
        const zipName = `Documentos_${workerName}.zip`;

        // Set headers for download
        res.attachment(zipName);

        const archive = archiver('zip', {
            zlib: { level: 9 } // Sets the compression level.
        });

        archive.on('error', function (err) {
            throw err;
        });

        archive.pipe(res);

        for (const doc of docs) {
            const filePath = path.join(__dirname, '../../uploads', doc.ruta_archivo);
            if (fs.existsSync(filePath)) {
                archive.file(filePath, { name: doc.nombre_archivo });
            }
        }

        await archive.finalize();
    },
};

module.exports = documentoService;
