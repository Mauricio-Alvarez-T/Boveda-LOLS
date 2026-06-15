const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Documentos de vehículos (permiso de circulación, seguro, inscripción, póliza).
// Se guardan tal cual (PDF o imagen) en uploads/vehiculos/<vehiculoId>/ y se sirven
// vía descarga autenticada (no estático público — son papeles sensibles).
const UPLOAD_DIR = path.join(__dirname, '../../uploads/vehiculos');

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
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const fileFilter = (req, file, cb) => {
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error(`Formato no permitido: ${file.mimetype}. Solo se aceptan PDF, JPG, PNG y WEBP.`), false);
    }
};

const uploadVehiculos = multer({
    storage,
    fileFilter,
    limits: { fileSize: 10 * 1024 * 1024 } // 10 MB
});

module.exports = uploadVehiculos;
