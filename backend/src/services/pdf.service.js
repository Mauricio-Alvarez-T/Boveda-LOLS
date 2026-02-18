const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

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
        } else if (mimetype === 'text/plain') {
            // Text → PDF conversion
            await this.textToPdf(filePath, finalPath);
            // Remove original text file
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
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
    },

    /**
     * Converts a text file to PDF
     */
    async textToPdf(textPath, outputPath) {
        const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
        const fs = require('fs');

        const pdfDoc = await PDFDocument.create();
        const font = await pdfDoc.embedFont(StandardFonts.TimesRoman);
        const fontSize = 12;
        const margin = 50;
        const content = fs.readFileSync(textPath, 'utf-8');

        let page = pdfDoc.addPage();
        let { width, height } = page.getSize();
        let y = height - margin;
        const maxWidth = width - (margin * 2);

        // Split text into paragraphs (handling various line endings)
        const paragraphs = content.split(/\r?\n/);

        for (const paragraph of paragraphs) {
            // Check if paragraph is empty (just a newline)
            if (paragraph.trim() === '') {
                y -= fontSize + 2;
                if (y < margin) {
                    page = pdfDoc.addPage();
                    y = height - margin;
                }
                continue;
            }

            // Word wrap logic
            const words = paragraph.split(' ');
            let line = '';

            for (const word of words) {
                const testLine = line + word + ' ';
                const textWidth = font.widthOfTextAtSize(testLine, fontSize);

                if (textWidth > maxWidth) {
                    // Draw current line and move to next
                    if (y < margin) {
                        page = pdfDoc.addPage();
                        y = height - margin;
                    }
                    page.drawText(line, { x: margin, y, size: fontSize, font, color: rgb(0, 0, 0) });
                    y -= fontSize + 2;
                    line = word + ' ';
                } else {
                    line = testLine;
                }
            }

            // Draw remaining part of the paragraph
            if (line.length > 0) {
                if (y < margin) {
                    page = pdfDoc.addPage();
                    y = height - margin;
                }
                page.drawText(line, { x: margin, y, size: fontSize, font, color: rgb(0, 0, 0) });
                y -= fontSize + 2;
            }
        }

        const pdfBytes = await pdfDoc.save();
        fs.writeFileSync(outputPath, pdfBytes);
    }
};

module.exports = pdfService;
