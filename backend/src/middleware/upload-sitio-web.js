const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { MIMES, MAX_BYTES } = require('../config/sitioWeb.config');

// Portada de una obra del sitio web (mig 147, docs/reglas/sitio-web.md). El archivo del cliente cae en
// uploads/sitio-web/tmp/<uuid>.bin: nombre FIJO, sin la extensión ni el nombre que mande el teléfono (pueden
// traer el nombre de una persona). sitioWebFotos.service lo procesa con sharp (formato real, sin metadatos,
// derivadas WebP) y lo borra siempre (finally). Lo que quede en tmp/ con más de una hora se limpia en cada
// subida y al arrancar. Tope de 10 MB, como los demás uploads (mensaje en errorHandler.js).
const TMP_DIR = path.join(__dirname, '../../uploads/sitio-web/tmp');
const UNA_HORA = 60 * 60 * 1000;

/** Borra los archivos de tmp/ más viejos que `maxEdadMs`. Devuelve cuántos borró. Nunca lanza. */
function limpiarTmp(maxEdadMs = UNA_HORA, ahora = Date.now(), dir = TMP_DIR) {
    let borrados = 0;
    let nombres = [];
    try { nombres = fs.readdirSync(dir); } catch { return 0; }
    for (const nombre of nombres) {
        const ruta = path.join(dir, nombre);
        try {
            const st = fs.statSync(ruta);
            if (st.isFile() && ahora - st.mtimeMs > maxEdadMs) { fs.unlinkSync(ruta); borrados++; }
        } catch { /* ya no estaba */ }
    }
    return borrados;
}

// Al arrancar (Passenger carga las rutas al levantar el proceso): restos de subidas cortadas.
limpiarTmp();

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        try {
            fs.mkdirSync(TMP_DIR, { recursive: true });
            limpiarTmp();
            cb(null, TMP_DIR);
        } catch (e) { cb(e); }
    },
    filename: (req, file, cb) => cb(null, `${crypto.randomUUID()}.bin`),
});

const fileFilter = (req, file, cb) => {
    if (MIMES.includes(file.mimetype)) return cb(null, true);
    const err = new Error(`Formato no permitido: ${file.mimetype}. Solo se aceptan fotos JPG, PNG y WEBP.`);
    err.statusCode = 400;
    cb(err, false);
};

module.exports = multer({ storage, fileFilter, limits: { fileSize: MAX_BYTES, files: 1, fields: 10, fieldSize: 4096 } });

// Importar las obras del sitio en SIMULACIÓN (staging): un ZIP del repo lols.cl (con src/content/obras y
// public/proyectos; el «Download ZIP» de GitHub sirve). Mismo tmp/ y nombre fijo; sitioWebPublicar.importar lo lee
// con jszip (solo esas dos carpetas, con topes) y lo borra siempre. El repo completo pesa ~15 MB.
const MIMES_ZIP = ['application/zip', 'application/x-zip-compressed', 'application/x-zip', 'multipart/x-zip', 'application/octet-stream'];
const MAX_PAQUETE = 40 * 1024 * 1024;
const fileFilterZip = (req, file, cb) => {
    if (MIMES_ZIP.includes(file.mimetype)) return cb(null, true);
    const err = new Error(`Formato no permitido: ${file.mimetype}. Solo un ZIP del repo lols.cl.`);
    err.statusCode = 400;
    cb(err, false);
};

module.exports.paquete = multer({ storage, fileFilter: fileFilterZip, limits: { fileSize: MAX_PAQUETE, files: 1, fields: 5, fieldSize: 1024 } });
module.exports.MAX_PAQUETE = MAX_PAQUETE;
module.exports.limpiarTmp = limpiarTmp;
module.exports.TMP_DIR = TMP_DIR;
