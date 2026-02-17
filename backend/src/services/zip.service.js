const archiver = require('archiver');
const fs = require('fs');
const path = require('path');
const db = require('../config/db');

const zipService = {
    /**
     * Crea un ZIP con los documentos de los trabajadores seleccionados.
     * Estructura: ZIP/RUT_Trabajador_Nombre/archivo1.pdf, archivo2.pdf...
     * @param {number[]} trabajadorIds - Array de IDs de trabajadores
     * @returns {string} Path del archivo ZIP generado
     */
    async createZip(trabajadorIds) {
        const timestamp = Date.now();
        const zipPath = path.join(__dirname, '../../uploads/temp', `fiscalizacion_${timestamp}.zip`);
        const tempDir = path.dirname(zipPath);

        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        const output = fs.createWriteStream(zipPath);
        const archive = archiver('zip', { zlib: { level: 6 } });

        return new Promise(async (resolve, reject) => {
            output.on('close', () => resolve(zipPath));
            archive.on('error', (err) => reject(err));
            archive.pipe(output);

            for (const trabajadorId of trabajadorIds) {
                // Get worker info
                const [trabajadores] = await db.query(
                    'SELECT rut, nombres, apellido_paterno FROM trabajadores WHERE id = ?',
                    [trabajadorId]
                );

                if (trabajadores.length === 0) continue;
                const t = trabajadores[0];
                const folderName = `${t.rut}_${t.nombres}_${t.apellido_paterno}`.replace(/\s+/g, '_');

                // Get documents
                const [docs] = await db.query(
                    'SELECT ruta_archivo, nombre_archivo FROM documentos WHERE trabajador_id = ? AND activo = TRUE',
                    [trabajadorId]
                );

                for (const doc of docs) {
                    const filePath = path.join(__dirname, '../../uploads', doc.ruta_archivo);
                    if (fs.existsSync(filePath)) {
                        archive.file(filePath, { name: `${folderName}/${doc.nombre_archivo}` });
                    }
                }
            }

            archive.finalize();
        });
    }
};

module.exports = zipService;
