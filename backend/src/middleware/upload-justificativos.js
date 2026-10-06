const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Justificativo de una ausencia (foto del certificado, comprobante, PDF).
// Va atado al PERÍODO de ausencia: uploads/justificativos/<periodoId>/<único>.<ext>.
// Se sirve por descarga autenticada, igual que los papeles de vehículos: son
// documentos del trabajador, no archivos públicos. Mismo patrón que upload-vehiculos.js.
const UPLOAD_DIR = path.join(__dirname, '../../uploads/justificativos');

if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = path.join(UPLOAD_DIR, String(req.params.id || 'temp'));
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname).toLowerCase());
    }
});

// Lo que sale de la cámara del teléfono (JPG/PNG/WEBP; Safari convierte HEIC a
// JPG al subir) más PDF para el certificado escaneado.
const ALLOWED = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

const fileFilter = (req, file, cb) => {
    if (ALLOWED.includes(file.mimetype)) {
        cb(null, true);
    } else {
        const err = new Error(`Formato no permitido: ${file.mimetype}. Solo se aceptan PDF, JPG, PNG y WEBP.`);
        err.statusCode = 400;
        cb(err, false);
    }
};

const uploadJustificativos = multer({
    storage,
    fileFilter,
    limits: { fileSize: 10 * 1024 * 1024 } // 10 MB
});

module.exports = uploadJustificativos;
