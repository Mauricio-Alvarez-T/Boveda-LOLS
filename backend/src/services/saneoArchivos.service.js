/**
 * Archivos de `backend/uploads/` en el saneo de staging (2026-09-15).
 *
 * Dos razones para tratarlos aparte de la base:
 *  1. Los nombres de archivo LLEVAN EL RUT (`pdf.service.js:16-28` →
 *     `<rutTrabajador>-<rutEmpresa>-<fecha>-<hora>.<ext>`), así que borrar la fila sin borrar el
 *     archivo deja el dato en el disco.
 *  2. `uploads/` nunca se sincroniza entre entornos (rsync `--exclude`), así que cada servidor
 *     tiene su propio árbol y hay que limpiarlo donde vive.
 *
 * Los documentos que siembra saneoSiembra necesitan un archivo real detrás para que "Ver
 * documento", descargar e imprimir funcionen en el QA: se escribe un MARCADOR del tipo correcto
 * (PDF mínimo válido o .doc de Word) que dice que es un documento de prueba.
 */
const fs = require('fs');
const path = require('path');
const { wrapHtml, toDocBuffer } = require('./docGenerador.service');

const UPLOADS_DIR = path.resolve(__dirname, '../../uploads');

const TEXTO_MARCADOR = 'DOCUMENTO DE PRUEBA - Boveda LOLS (staging). Sin datos de personas reales.';

/**
 * PDF mínimo de una página con el texto del marcador. Se arma a mano (sin dependencias) con la
 * tabla xref calculada: los visores la exigen para abrirlo sin recuperar.
 */
function pdfMarcador(texto = TEXTO_MARCADOR) {
    const contenido = `BT /F1 14 Tf 57 760 Td (${texto.replace(/[()\\]/g, '')}) Tj ET`;
    const objetos = [
        '<< /Type /Catalog /Pages 2 0 R >>',
        '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
        `<< /Length ${contenido.length} >>\nstream\n${contenido}\nendstream`,
        '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    ];

    let pdf = '%PDF-1.4\n';
    const offsets = [];
    objetos.forEach((obj, i) => {
        offsets.push(pdf.length);
        pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
    });
    const inicioXref = pdf.length;
    pdf += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
    offsets.forEach(off => { pdf += `${String(off).padStart(10, '0')} 00000 n \n`; });
    pdf += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${inicioXref}\n%%EOF\n`;
    return Buffer.from(pdf, 'latin1');
}

/** .doc de Word (HTML con cabecera MSO + BOM), con el mismo motor que usa el kit de ingreso. */
function docMarcador(texto = TEXTO_MARCADOR) {
    return toDocBuffer(wrapHtml('Documento de prueba', `<p style="font-size:14pt"><b>${texto}</b></p>`));
}

/** Contenido del marcador según la extensión del archivo. */
function marcadorPara(nombre) {
    const ext = path.extname(String(nombre)).toLowerCase();
    if (ext === '.pdf') return pdfMarcador();
    if (ext === '.doc' || ext === '.docx') return docMarcador();
    return Buffer.from(`${TEXTO_MARCADOR}\n`, 'utf8');
}

/** Escribe el marcador en `uploads/<ruta>` creando los directorios que falten. */
function escribirMarcador(rutaRelativa, baseDir = UPLOADS_DIR) {
    const destino = path.resolve(baseDir, rutaRelativa);
    if (!destino.startsWith(path.resolve(baseDir))) throw new Error(`Ruta fuera de uploads: ${rutaRelativa}`);
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    fs.writeFileSync(destino, marcadorPara(destino));
    return destino;
}

/** Borra `uploads/<ruta>` si existe. Devuelve true si borró algo. */
function borrarArchivo(rutaRelativa, baseDir = UPLOADS_DIR) {
    if (!rutaRelativa) return false;
    const destino = path.resolve(baseDir, rutaRelativa);
    if (!destino.startsWith(path.resolve(baseDir))) return false;
    if (!fs.existsSync(destino)) return false;
    fs.unlinkSync(destino);
    return true;
}

/**
 * Carpetas `uploads/<trabajadorId>/` completas de los trabajadores purgados. Se borra el árbol
 * entero: los nombres de archivo llevan el RUT, así que no basta con las rutas conocidas por la BD
 * (un archivo cuya fila ya no existe seguiría ahí).
 */
function borrarCarpetasDeTrabajadores(ids, baseDir = UPLOADS_DIR) {
    let carpetas = 0;
    for (const id of ids || []) {
        const dir = path.resolve(baseDir, String(id));
        if (!dir.startsWith(path.resolve(baseDir))) continue;
        if (!fs.existsSync(dir)) continue;
        fs.rmSync(dir, { recursive: true, force: true });
        carpetas += 1;
    }
    return carpetas;
}

/**
 * Carpetas numéricas de `uploads/` que ya no corresponden a ningún trabajador de la base.
 * `idsVigentes` = los que quedan tras la purga.
 */
function carpetasHuerfanas(idsVigentes, baseDir = UPLOADS_DIR) {
    if (!fs.existsSync(baseDir)) return [];
    const vigentes = new Set((idsVigentes || []).map(String));
    return fs.readdirSync(baseDir, { withFileTypes: true })
        .filter(d => d.isDirectory() && /^\d+$/.test(d.name) && !vigentes.has(d.name))
        .map(d => d.name);
}

module.exports = {
    UPLOADS_DIR,
    TEXTO_MARCADOR,
    pdfMarcador,
    docMarcador,
    marcadorPara,
    escribirMarcador,
    borrarArchivo,
    borrarCarpetasDeTrabajadores,
    carpetasHuerfanas,
};
