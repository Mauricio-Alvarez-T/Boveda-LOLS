const multer = require('multer');
const path = require('path');
const fs = require('fs');

const UPLOAD_DIR = path.join(__dirname, '../../uploads');

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const trabajadorDir = path.join(UPLOAD_DIR, String(req.params.trabajadorId || 'temp'));
        if (!fs.existsSync(trabajadorDir)) {
            fs.mkdirSync(trabajadorDir, { recursive: true });
        }
        cb(null, trabajadorDir);
    },
    filename: (req, file, cb) => {
        // Temporary name; will be renamed by pdf.service after conversion
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const fileFilter = (req, file, cb) => {
    const allowedTypes = [
        'application/pdf',
        'image/jpeg',
        'image/png',
        'image/webp',
        'text/plain',
        // Word editado/firmado que vuelve a la ficha (plan Gestiones B2). Se guarda tal cual.
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];

    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error(`Formato no permitido: ${file.mimetype}. Solo se aceptan PDF, JPG, PNG, WEBP, TXT y Word (DOC/DOCX).`), false);
    }
};

const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10 MB max
    }
});

module.exports = upload;
