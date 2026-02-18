const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
    // Create test file
    const txtFile = path.join(__dirname, 'test_delete.txt');
    fs.writeFileSync(txtFile, 'Content to delete.');

    const browser = await chromium.launch();
    const context = await browser.newContext();
    const request = context.request;

    // Login
    console.log('1. Logging in...');
    const loginRes = await request.post('http://localhost:3000/api/auth/login', {
        data: { email: 'admin@boveda.cl', password: 'admin' }
    });
    const loginData = await loginRes.json();
    const token = loginData.token;

    // Upload
    console.log('2. Uploading test file...');
    const uploadRes = await request.post('http://localhost:3000/api/documentos/upload/1', {
        headers: { 'Authorization': `Bearer ${token}` },
        multipart: {
            tipo_documento_id: '8',
            archivo: {
                name: 'test_delete.txt',
                mimeType: 'text/plain',
                buffer: fs.readFileSync(txtFile)
            }
        }
    });

    if (!uploadRes.ok()) {
        console.error('Upload failed:', await uploadRes.text());
        process.exit(1);
    }
    const uploadData = await uploadRes.json();
    const docId = uploadData.id;
    console.log(`✅ Uploaded document ID: ${docId}`);

    // Download (Verify status 200)
    console.log('3. Testing Download...');
    // Note: backend route is /download/:id, frontend was /descargar/
    const downloadRes = await request.get(`http://localhost:3000/api/documentos/download/${docId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    if (downloadRes.status() === 200) {
        console.log('✅ Download successful (200 OK)');
    } else {
        console.error(`❌ Download failed (${downloadRes.status()}):`, await downloadRes.text());
    }

    // Delete
    console.log('4. Testing Delete...');
    const deleteRes = await request.delete(`http://localhost:3000/api/documentos/${docId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    if (deleteRes.status() === 200) {
        console.log('✅ Delete successful (200 OK)');
    } else {
        console.error(`❌ Delete failed (${deleteRes.status()}):`, await deleteRes.text());
    }

    // Verify deleted (Download should now fail 404)
    console.log('5. Verifying Deletion (Download should fail)...');
    const verifyRes = await request.get(`http://localhost:3000/api/documentos/download/${docId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    if (verifyRes.status() === 404) {
        console.log('✅ Verification successful: Document returns 404 Not Found.');
    } else {
        console.error(`❌ Verification failed: Expected 404 but got ${verifyRes.status()}`);
    }

    fs.unlinkSync(txtFile);
    await browser.close();
})();
