
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

    // 1. Create Obra without Empresa
    console.log('Creating Obra without Empresa...');
    const createRes = await fetch('http://localhost:3000/api/obras', {
        method: 'POST',
        headers,
        body: JSON.stringify({ nombre: 'Obra Independiente', direccion: 'Calle Sin Empresa 123' })
    });
    const result = await createRes.json();

    if (createRes.status === 200 || createRes.status === 201) {
        console.log('✅ Obra created successfully:', result);
    } else {
        console.error('❌ Failed to create Obra:', result);
        process.exit(1);
    }

    // 2. Cleanup
    console.log('Deleting Obra...');
    const delRes = await fetch(`http://localhost:3000/api/obras/${result.id}`, {
        method: 'DELETE',
        headers
    });
    const delData = await delRes.json();
    if (delRes.status === 200 || delRes.status === 204) {
        console.log('✅ Obra deleted successfully:', delData);
    } else {
        console.error('❌ Failed to delete Obra:', delData);
        process.exit(1);
    }
    console.log('Cleanup done.');
})();
