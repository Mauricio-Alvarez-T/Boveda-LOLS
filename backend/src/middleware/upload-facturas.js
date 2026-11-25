const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Foto o PDF de una factura de inventario (mig 157). Mismo patrón que la foto de un
// gasto (upload-costos): uploads/facturas-inventario/<único>.<ext>, descarga
// autenticada (documento con montos, nunca estático público), tope 10 MB.
const UPLOAD_DIR = path.join(__dirname, '../../uploads/facturas-inventario');

if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
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

const limits = { fileSize: 10 * 1024 * 1024 };

/** Archivo que queda guardado con la factura. */
const uploadFactura = multer({ storage, fileFilter, limits });

/** «Leer factura» con IA: el archivo solo se lee, no se guarda (queda en memoria). */
const uploadLectura = multer({ storage: multer.memoryStorage(), fileFilter, limits });

module.exports = { uploadFactura, uploadLectura, UPLOAD_DIR };
