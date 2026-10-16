const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Foto de la factura o boleta de un gasto de obra (mig 122). Mismo patrón que los
// justificativos: uploads/costos/<obraId>/<único>.<ext>, descarga autenticada (son
// documentos con montos, nunca estáticos públicos). El teléfono la comprime a ~300 KB
// antes de subir para que se lea; el tope del servidor es 10 MB por si llega sin pasar
// por la compresión (PDF escaneado).
const UPLOAD_DIR = path.join(__dirname, '../../uploads/costos');

if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = path.join(UPLOAD_DIR, String(req.params.obraId || 'gastos'));
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const unico = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, unico + path.extname(file.originalname).toLowerCase());
    },
});

const ALLOWED = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

const fileFilter = (req, file, cb) => {
    if (ALLOWED.includes(file.mimetype)) return cb(null, true);
    const err = new Error(`Formato no permitido: ${file.mimetype}. Solo se aceptan PDF, JPG, PNG y WEBP.`);
    err.statusCode = 400;
    cb(err, false);
};

module.exports = multer({ storage, fileFilter, limits: { fileSize: 10 * 1024 * 1024 } });
