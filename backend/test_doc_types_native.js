
(async () => {
    // Helper
    const fetch = globalThis.fetch;

    // Login
    console.log('Logging in...');
    const loginRes = await fetch('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'admin@boveda.cl', password: 'admin' })
    });
    const { token } = await loginRes.json();
    const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
    };

    // 1. Create Type
    console.log('Creating Type...');
    const createRes = await fetch('http://localhost:3000/api/documentos/tipos', {
        method: 'POST',
        headers,
        body: JSON.stringify({ nombre: 'Test Doc Type', dias_vigencia: 30, obligatorio: false })
    });
    const type = await createRes.json();
    console.log(`Created Type: ${type.id}`);

    // 2. Delete Type
    console.log('Deleting Type...');
    await fetch(`http://localhost:3000/api/documentos/tipos/${type.id}`, {
        method: 'DELETE',
        headers
    });
    console.log('Deleted.');

    // 3. List with activo=true
    console.log('Verifying active filter...');
    const listActiveRes = await fetch('http://localhost:3000/api/documentos/tipos?activo=true', { headers });
    const activeData = await listActiveRes.json();
    const foundActive = activeData.data.find(t => t.id === type.id);

    if (foundActive) {
        console.error('❌ Failed: Deleted type still visible with ?activo=true');
    } else {
        console.log('✅ Success: Deleted type hidden with ?activo=true');
    }

    // 4. List without filter
    console.log('Verifying soft delete...');
    const listAllRes = await fetch('http://localhost:3000/api/documentos/tipos', { headers });
    const allData = await listAllRes.json();
    const foundAll = allData.data.find(t => t.id === type.id);

    if (foundAll) {
        console.log('✅ Success: Deleted type visible without filter (soft delete confirmed)');
    } else {
        console.error('❌ Failed: Deleted type not found even without filter (unexpected hard delete?)');
    }
})();
