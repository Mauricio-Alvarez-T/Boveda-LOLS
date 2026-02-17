const fs = require('fs');
const path = require('path');
const { PDFDocument } = require('pdf-lib');
const sharp = require('sharp');

const pdfService = {
    /**
     * Convierte una imagen a PDF o valida un PDF existente.
     * Renombra el archivo al formato estándar.
     * @param {string} filePath - Ruta del archivo subido
     * @param {string} mimetype - Tipo MIME del archivo
     * @param {string} rutTrabajador - RUT del trabajador
     * @param {string} rutEmpresa - RUT de la empresa actual
     * @returns {object} { finalPath, fileName }
     */
    async processFile(filePath, mimetype, rutTrabajador, rutEmpresa) {
        const fecha = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        const cleanRutT = rutTrabajador.replace(/\./g, '');
        const cleanRutE = rutEmpresa.replace(/\./g, '');
        const fileName = `${cleanRutT}-${cleanRutE}-${fecha}.pdf`;
        const dir = path.dirname(filePath);
        const finalPath = path.join(dir, fileName);

        if (mimetype === 'application/pdf') {
            // Already PDF, just rename
            fs.renameSync(filePath, finalPath);
        } else {
            // Image → PDF conversion
            await this.imageToPdf(filePath, finalPath);
            // Remove original image
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        }

        return { finalPath, fileName };
    },

    /**
     * Converts an image file to PDF using pdf-lib + sharp
     */
    async imageToPdf(imagePath, outputPath) {
        const pdfDoc = await PDFDocument.create();

        // Read and process image with sharp to get dimensions
        const imageBuffer = fs.readFileSync(imagePath);
        const metadata = await sharp(imageBuffer).metadata();

        let image;
        const ext = path.extname(imagePath).toLowerCase();

        if (ext === '.png' || ext === '.webp') {
            // Convert webp to png first if needed
            const pngBuffer = ext === '.webp'
                ? await sharp(imageBuffer).png().toBuffer()
                : imageBuffer;
            image = await pdfDoc.embedPng(pngBuffer);
        } else {
            // JPG/JPEG
            image = await pdfDoc.embedJpg(imageBuffer);
        }

        // Create page with image dimensions
        const page = pdfDoc.addPage([image.width, image.height]);
        page.drawImage(image, {
            x: 0,
            y: 0,
            width: image.width,
            height: image.height
        });

        const pdfBytes = await pdfDoc.save();
        fs.writeFileSync(outputPath, pdfBytes);
    }
};

module.exports = pdfService;
