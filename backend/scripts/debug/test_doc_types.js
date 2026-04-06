const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch();
    const context = await browser.newContext();
    const request = context.request;

    // Login
    const loginRes = await request.post('http://localhost:3000/api/auth/login', {
        data: { email: 'admin@boveda.cl', password: 'admin' }
    });
    const token = (await loginRes.json()).token;
    const headers = { 'Authorization': `Bearer ${token}` };

    // 1. Create Type
    const createRes = await request.post('http://localhost:3000/api/documentos/tipos', {
        headers,
        data: { nombre: 'Test Doc Type', dias_vigencia: 30, obligatorio: false }
    });
    const type = await createRes.json();
    console.log(`Created Type: ${type.id}`);

    // 2. Delete Type
    await request.delete(`http://localhost:3000/api/documentos/tipos/${type.id}`, { headers });
    console.log('Deleted Type.');

    // 3. List with activo=true
    const listActiveRes = await request.get('http://localhost:3000/api/documentos/tipos?activo=true', { headers });
    const activeData = await listActiveRes.json();
    const foundActive = activeData.data.find(t => t.id === type.id);

    if (foundActive) {
        console.error('❌ Failed: Deleted type still visible with ?activo=true');
    } else {
        console.log('✅ Success: Deleted type hidden with ?activo=true');
    }

    // 4. List without filter
    const listAllRes = await request.get('http://localhost:3000/api/documentos/tipos', { headers });
    const allData = await listAllRes.json();
    const foundAll = allData.data.find(t => t.id === type.id);

    if (foundAll) {
        console.log('✅ Success: Deleted type visible without filter (soft delete confirmed)');
    } else {
        console.error('❌ Failed: Deleted type not found even without filter (unexpected hard delete?)');
    }

    await browser.close();
})();
