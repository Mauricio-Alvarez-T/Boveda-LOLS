const db = require('../config/db');
const pdfService = require('./pdf.service');
const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger-structured');
const g = require('./docGenerador.service');

const UPLOADS_DIR = path.join(__dirname, '../../uploads');
const COL_INEXISTENTE = 1054;

/**
 * Columnas de `documentos` anteriores a la mig 110. Se listan EXPLÍCITAS (nunca `d.*`): desde la
 * 110 la tabla tiene `metadata` (snapshot con remuneración) que NO debe salir por rutas con
 * documentos.ver — solo por /documentos-laborales con su gate.
 */
const COLS_LEGACY = 'd.id, d.trabajador_id, d.tipo_documento_id, d.nombre_archivo, d.ruta_archivo, d.rut_empresa_al_subir, d.fecha_subida, d.fecha_vencimiento, d.subido_por, d.activo';
/** Columnas nuevas (mig 110) — la query cae al legacy si la migración aún no corrió (errno 1054). */
const COLS_110 = 'd.origen, d.estado, d.generado_por, d.fecha_generacion, d.fecha_descarga, d.plantilla_version, td.codigo AS tipo_codigo, td.restringido, ug.nombre AS generado_por_nombre';

const esColInexistente = (err) => err && err.errno === COL_INEXISTENTE;

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
        const relativePath = path.relative(UPLOADS_DIR, finalPath);
        const [result] = await db.query(
            `INSERT INTO documentos (trabajador_id, tipo_documento_id, nombre_archivo, ruta_archivo, rut_empresa_al_subir, fecha_vencimiento, subido_por)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [trabajadorId, tipoDocumentoId, fileName, relativePath, rut_empresa || 'SIN-EMPRESA', fechaVencimiento, userId]
        );

        return { id: result.insertId, nombre_archivo: fileName, fecha_vencimiento: fechaVencimiento };
    },

    /**
     * Documento GENERADO por Bóveda (plan Gestiones B2, mig 110): escribe el .doc en uploads/<tid>/ y
     * la fila con origen='generado'. Busca el tipo por `codigo` (409 si el tipo del sistema no está o
     * la mig 110 no corrió). No pasa por pdfService (no se convierte).
     * @returns {{id:number, nombre_archivo:string, tipo_documento_id:number, tipo_nombre:string}}
     */
    async crearGenerado({ trabajadorId, tipoCodigo, html, userId, metadata = null, plantillaVersion = null, nombreBase = 'Documento' }) {
        let tipos;
        try {
            [tipos] = await db.query('SELECT id, nombre FROM tipos_documento WHERE codigo = ? AND activo = 1 LIMIT 1', [tipoCodigo]);
        } catch (err) {
            if (!esColInexistente(err)) throw err;
            throw Object.assign(new Error('Los documentos generados requieren la migración 110 (tipos_documento.codigo). Avisa a TI.'), { statusCode: 409, code: 'MIGRACION_PENDIENTE' });
        }
        if (!tipos.length) {
            throw Object.assign(new Error(`Tipo de documento del sistema no configurado o inactivo: ${tipoCodigo}`), { statusCode: 409, code: 'TIPO_NO_CONFIGURADO' });
        }
        const tipo = tipos[0];

        const [trabajadores] = await db.query(
            `SELECT t.rut AS rut_trabajador, e.rut AS rut_empresa
               FROM trabajadores t LEFT JOIN empresas e ON t.empresa_id = e.id
              WHERE t.id = ?`,
            [trabajadorId]
        );
        if (!trabajadores.length) throw Object.assign(new Error('Trabajador no encontrado'), { statusCode: 404 });
        const rutEmpresa = trabajadores[0].rut_empresa || 'SIN-EMPRESA';

        // Un trabajador recién aprobado no tiene carpeta (solo multer la creaba al subir).
        const dir = path.join(UPLOADS_DIR, String(trabajadorId));
        fs.mkdirSync(dir, { recursive: true });
        const fileName = `${nombreBase}_${g.stamp()}.doc`;
        const fullPath = path.join(dir, fileName);
        fs.writeFileSync(fullPath, g.toDocBuffer(html));

        try {
            const [result] = await db.query(
                `INSERT INTO documentos (trabajador_id, tipo_documento_id, nombre_archivo, ruta_archivo, rut_empresa_al_subir, fecha_vencimiento, subido_por,
                                         origen, estado, generado_por, fecha_generacion, plantilla_version, metadata)
                 VALUES (?, ?, ?, ?, ?, NULL, ?, 'generado', 'generado', ?, NOW(), ?, ?)`,
                [trabajadorId, tipo.id, fileName, path.relative(UPLOADS_DIR, fullPath), rutEmpresa, userId, userId, plantillaVersion, metadata ? JSON.stringify(metadata) : null]
            );
            return { id: result.insertId, nombre_archivo: fileName, tipo_documento_id: tipo.id, tipo_nombre: tipo.nombre };
        } catch (err) {
            fs.unlink(fullPath, () => {});
            throw err;
        }
    },

    /** Último documento generado ACTIVO de un tipo (por codigo) para el trabajador, o null. */
    async buscarGenerado(trabajadorId, tipoCodigo) {
        try {
            const [rows] = await db.query(
                `SELECT d.id, d.nombre_archivo FROM documentos d
                   JOIN tipos_documento td ON td.id = d.tipo_documento_id
                  WHERE d.trabajador_id = ? AND td.codigo = ? AND d.origen = 'generado' AND d.activo = TRUE
                  ORDER BY d.id DESC LIMIT 1`,
                [trabajadorId, tipoCodigo]
            );
            return rows[0] || null;
        } catch (err) {
            if (esColInexistente(err)) return null;
            throw err;
        }
    },

    /**
     * Documentos activos del trabajador. Proyección explícita SIN `metadata`; con las columnas de la
     * mig 110 cuando existen (fallback legacy si no). `origen` filtra 'subido' | 'generado'.
     */
    async getByTrabajador(trabajadorId, { origen } = {}) {
        try {
            const where = origen ? ' AND d.origen = ?' : '';
            const [rows] = await db.query(
                `SELECT ${COLS_LEGACY}, td.nombre AS tipo_nombre, td.obligatorio AS tipo_obligatorio, ${COLS_110}
                   FROM documentos d
                   JOIN tipos_documento td ON d.tipo_documento_id = td.id
                   LEFT JOIN usuarios ug ON ug.id = d.generado_por
                  WHERE d.trabajador_id = ? AND d.activo = TRUE${where}
                  ORDER BY d.fecha_subida DESC, d.id DESC`,
                origen ? [trabajadorId, origen] : [trabajadorId]
            );
            return rows;
        } catch (err) {
            if (!esColInexistente(err)) throw err;
            if (origen === 'generado') return []; // sin mig 110 no hay generados
            const [rows] = await db.query(
                `SELECT ${COLS_LEGACY}, td.nombre AS tipo_nombre, td.obligatorio AS tipo_obligatorio
                   FROM documentos d
                   JOIN tipos_documento td ON d.tipo_documento_id = td.id
                  WHERE d.trabajador_id = ? AND d.activo = TRUE
                  ORDER BY d.fecha_subida DESC`,
                [trabajadorId]
            );
            return rows.map(r => ({ ...r, origen: 'subido', estado: 'subido', restringido: 0, tipo_codigo: null }));
        }
    },

    /**
     * Ruta física + metadatos de acceso. `restringido` (tipo, mig 110) decide si la descarga exige
     * documentos.laborales.descargar; sin la mig → 0 (comportamiento legacy).
     */
    async getFilePath(id) {
        let row;
        try {
            const [rows] = await db.query(
                `SELECT d.ruta_archivo, d.nombre_archivo, d.trabajador_id, d.origen, d.estado, td.codigo AS tipo_codigo, td.nombre AS tipo_nombre, td.restringido
                   FROM documentos d LEFT JOIN tipos_documento td ON td.id = d.tipo_documento_id
                  WHERE d.id = ? AND d.activo = TRUE`,
                [id]
            );
            row = rows[0];
        } catch (err) {
            if (!esColInexistente(err)) throw err;
            const [rows] = await db.query(
                `SELECT d.ruta_archivo, d.nombre_archivo, d.trabajador_id, td.nombre AS tipo_nombre
                   FROM documentos d LEFT JOIN tipos_documento td ON td.id = d.tipo_documento_id
                  WHERE d.id = ? AND d.activo = TRUE`,
                [id]
            );
            row = rows[0] ? { ...rows[0], origen: 'subido', estado: 'subido', restringido: 0, tipo_codigo: null } : undefined;
        }
        if (!row) {
            throw Object.assign(new Error('Documento no encontrado'), { statusCode: 404 });
        }
        return {
            fullPath: path.join(UPLOADS_DIR, row.ruta_archivo),
            fileName: row.nombre_archivo,
            trabajador_id: row.trabajador_id,
            origen: row.origen,
            estado: row.estado,
            tipo_codigo: row.tipo_codigo ?? null,
            tipo_nombre: row.tipo_nombre ?? null,
            restringido: !!row.restringido,
        };
    },

    /** Primera descarga/impresión: generado → descargado (monótono; re-descargar no cambia nada). */
    async marcarDescargado(id) {
        try {
            const [r] = await db.query(
                `UPDATE documentos SET estado = 'descargado', fecha_descarga = COALESCE(fecha_descarga, NOW())
                  WHERE id = ? AND estado = 'generado'`,
                [id]
            );
            return r.affectedRows > 0;
        } catch (err) {
            if (esColInexistente(err)) return false;
            throw err;
        }
    },

    async getVencidos(dias = 30) {
        const [rows] = await db.query(
            `SELECT ${COLS_LEGACY}, t.rut, t.nombres, t.apellido_paterno, td.nombre as tipo_nombre
       FROM documentos d
       JOIN trabajadores t ON d.trabajador_id = t.id
       JOIN tipos_documento td ON d.tipo_documento_id = td.id
       WHERE d.activo = TRUE AND t.es_prueba = 0
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
       WHERE t.activo = TRUE AND t.es_prueba = 0 AND td.obligatorio = TRUE AND td.activo = TRUE AND d.id IS NULL
       ORDER BY t.apellido_paterno ASC, t.apellido_materno ASC, t.nombres ASC, td.nombre ASC`
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
    /**
     * ZIP con los documentos del trabajador. Los tipos RESTRINGIDOS (contratos, finiquitos… mig 110)
     * se omiten SIEMPRE — se descargan uno a uno por /documentos-laborales con su gate — y la cantidad
     * omitida viaja en el header X-Documentos-Omitidos para que el front avise.
     */
    async downloadAll(trabajadorId, res) {
        const archiver = require('archiver');

        // Get all active documents for the worker
        const todos = await this.getByTrabajador(trabajadorId);
        const docs = todos.filter(d => !d.restringido);
        const omitidos = todos.length - docs.length;
        if (docs.length === 0) {
            const msg = omitidos > 0
                ? 'Todos los documentos de este trabajador son laborales restringidos: descárgalos uno a uno desde la ficha (solo oficina).'
                : 'No hay documentos para descargar';
            throw Object.assign(new Error(msg), { statusCode: 404, omitidos });
        }

        // Get worker info for the zip filename
        const [trabajador] = await db.query('SELECT rut, nombres, apellido_paterno FROM trabajadores WHERE id = ?', [trabajadorId]);
        const workerName = trabajador[0] ? `${trabajador[0].nombres}_${trabajador[0].apellido_paterno}`.replace(/ /g, '_') : 'documentos';
        const zipName = `Documentos_${workerName}.zip`;

        // Set headers for download
        res.setHeader('X-Documentos-Omitidos', String(omitidos));
        res.attachment(zipName);

        const archive = archiver('zip', {
            zlib: { level: 9 } // Sets the compression level.
        });

        archive.on('error', function (err) {
            throw err;
        });

        archive.pipe(res);

        for (const doc of docs) {
            const filePath = path.join(UPLOADS_DIR, doc.ruta_archivo);
            if (fs.existsSync(filePath)) {
                const safeTipoNombre = doc.tipo_nombre ? doc.tipo_nombre.replace(/[^a-zA-Z0-9\-_]/g, '_') : 'Documento';
                const ext = path.extname(doc.nombre_archivo) || '.pdf';
                const uniqueName = `${safeTipoNombre}_${doc.id}${ext}`;
                archive.file(filePath, { name: uniqueName });
            }
        }

        if (omitidos > 0) logger.info('ZIP de documentos: restringidos omitidos', { trabajadorId, omitidos });
        await archive.finalize();
    },
};

module.exports = documentoService;
