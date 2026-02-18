
(async () => {
    const fetch = globalThis.fetch;
    const loginRes = await fetch('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'admin@boveda.cl', password: 'admin' })
    });
    const { token } = await loginRes.json();
    const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };

    // --- TEST OBRA ---
    console.log('Testing Obra Filter...');
    const obraRes = await fetch('http://localhost:3000/api/obras', {
        method: 'POST',
        headers, body: JSON.stringify({ nombre: 'Obra Filter Test', direccion: 'X' })
    });
    const obra = await obraRes.json();
    console.log('Created Obra:', obra.id);

    // Delete
    await fetch(`http://localhost:3000/api/obras/${obra.id}`, { method: 'DELETE', headers });
    console.log('Deleted Obra');

    // List with activo=true
    const obraActiveRes = await fetch('http://localhost:3000/api/obras?activo=true', { headers });
    const obraActiveData = await obraActiveRes.json();
    const obraFound = obraActiveData.data.find(o => o.id === obra.id);
    if (!obraFound) console.log('✅ Obra correctly hidden with activo=true');
    else console.error('❌ Obra STILL VISIBLE with activo=true');

    // List without filter
    const obraAllRes = await fetch('http://localhost:3000/api/obras', { headers });
    const obraAllData = await obraAllRes.json();
    const obraFoundAll = obraAllData.data.find(o => o.id === obra.id);
    if (obraFoundAll) console.log('✅ Obra visible without filter');
    else console.error('❌ Obra not found without filter (Hard deleted?)');

    // --- TEST EMPRESA ---
    console.log('\nTesting Empresa Filter...');
    const rut = '99.999.000-' + Math.floor(Math.random() * 9);
    const empRes = await fetch('http://localhost:3000/api/empresas', {
        method: 'POST',
        headers, body: JSON.stringify({ rut, razon_social: 'Empresa Filter Test' })
    });
    const currEmp = await empRes.json();
    console.log('Created Empresa:', currEmp.id);

    // Delete
    await fetch(`http://localhost:3000/api/empresas/${currEmp.id}`, { method: 'DELETE', headers });
    console.log('Deleted Empresa');

    // List with activo=true
    const empActiveRes = await fetch('http://localhost:3000/api/empresas?activo=true', { headers });
    const empActiveData = await empActiveRes.json();
    const empFound = empActiveData.data.find(e => e.id === currEmp.id);
    if (!empFound) console.log('✅ Empresa correctly hidden with activo=true');
    else console.error('❌ Empresa STILL VISIBLE with activo=true');

})();
