const pdfService = require('./src/services/pdf.service');
const { PDFDocument } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

(async () => {
    // 1. Generate long text file
    const textPath = path.join(__dirname, 'long_text.txt');
    const outputPath = path.join(__dirname, 'long_text.pdf');

    let content = '';
    for (let i = 0; i < 200; i++) {
        content += `Line ${i}: This is a long line of text to test word wrapping functionality and pagination system within the pdf conversion service. We need to make sure this goes to multiple pages.\n`;
    }
    fs.writeFileSync(textPath, content);

    // 2. Convert to PDF
    console.log('Converting text to PDF...');
    await pdfService.textToPdf(textPath, outputPath);

    // 3. Verify page count
    const pdfBytes = fs.readFileSync(outputPath);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const pageCount = pdfDoc.getPageCount();

    console.log(`Generated PDF has ${pageCount} pages.`);

    if (pageCount > 1) {
        console.log('✅ Pagination Successful!');
    } else {
        console.error('❌ Pagination Failed: PDF has only 1 page.');
        process.exit(1);
    }

    // Cleanup
    if (fs.existsSync(textPath)) fs.unlinkSync(textPath);
    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
})();
