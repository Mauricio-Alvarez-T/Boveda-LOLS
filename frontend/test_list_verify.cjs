const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch();
    const context = await browser.newContext();
    const request = context.request;

    // 1. Login
    console.log('1. Logging in...');
    const loginRes = await request.post('http://localhost:3000/api/auth/login', {
        data: { email: 'admin@boveda.cl', password: 'admin' }
    });
    const loginData = await loginRes.json();
    const token = loginData.token;

    // 2. Get documents for worker 1
    console.log('2. Fetching documents for worker 1...');
    const res = await request.get('http://localhost:3000/api/documentos/trabajador/1', {
        headers: { 'Authorization': `Bearer ${token}` }
    });

    const json = await res.json();
    console.log('Response structure:', JSON.stringify(json, null, 2));

    if (json.data && Array.isArray(json.data)) {
        console.log(`✅ Success: Response has 'data' array with ${json.data.length} documents.`);
    } else {
        console.error('❌ Failure: Response missingdata array.');
        console.log('Received:', json);
    }

    await browser.close();
})();
