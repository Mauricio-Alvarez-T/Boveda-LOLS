const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// Create a dummy text file
const filePath = path.join(__dirname, 'test_doc.txt');
fs.writeFileSync(filePath, 'Este es un documento de prueba generado automáticamente para verificar la conversión de TXT a PDF.');

(async () => {
    const browser = await chromium.launch();
    const context = await browser.newContext();
    const api = context.request;

    console.log('1. Logging in...');
    const loginRes = await api.post('http://localhost:3000/api/auth/login', {
        data: { email: 'testadmin@boveda.cl', password: 'testadmin123' }
    });

    if (!loginRes.ok()) {
        console.error('Login failed');
        process.exit(1);
    }

    const { token } = await loginRes.json();
    console.log('Token received.');

    // 2. Get document types
    const typesRes = await api.get('http://localhost:3000/api/documentos/tipos?activo=true', {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    const { data: types } = await typesRes.json();
    const typeId = types[0].id; // Use the first available type
    console.log(`Using document type ID: ${typeId} (${types[0].nombre})`);

    // 3. Upload the TXT file
    console.log('3. Uploading TXT file...');

    // Playwright handles multipart uploads if we pass the file object in data
    const uploadRes = await api.post(`http://localhost:3000/api/documentos/upload/1`, {
        headers: { 'Authorization': `Bearer ${token}` },
        multipart: {
            tipo_documento_id: typeId.toString(),
            archivo: {
                name: 'test_doc.txt',
                mimeType: 'text/plain',
                buffer: fs.readFileSync(filePath)
            }
        }
    });

    if (uploadRes.ok()) {
        const result = await uploadRes.json();
        console.log('Upload successful!', result);
        console.log(`Document saved as: ${result.nombre_archivo}`);

        if (result.nombre_archivo.endsWith('.pdf')) {
            console.log('SUCCESS: File was converted to PDF.');
        } else {
            console.error(`FAILURE: File was NOT converted to PDF. Ext: ${path.extname(result.nombre_archivo)}`);
            process.exit(1);
        }
    } else {
        const errText = await uploadRes.text();
        console.error('Upload failed:', errText);
        process.exit(1);
    }

    await browser.close();
    fs.unlinkSync(filePath);
})();
