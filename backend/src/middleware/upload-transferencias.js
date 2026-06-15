const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Fotos OPCIONALES de recepción / discrepancia de transferencias (Fase 3).
// Copia del patrón de upload-inventario.js: mismo diskStorage, mismos formatos
// y límite. Se sirven en /api/uploads/transferencias (ver backend/index.js).
const UPLOAD_DIR = path.join(__dirname, '../../uploads/transferencias');

if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname).toLowerCase());
    }
});

const fileFilter = (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error(`Solo se aceptan imágenes JPG, PNG o WEBP. Recibido: ${file.mimetype}`), false);
    }
};

const uploadTransferencias = multer({
    storage,
    fileFilter,
    limits: { fileSize: 5 * 1024 * 1024 } // 5 MB
});

module.exports = uploadTransferencias;
