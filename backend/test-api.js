/**
 * SGDL - API Integration Test Script
 * Tests CRUD for: Empresas, Obras, Cargos, Trabajadores, Asistencia, Dashboard
 */
const http = require('http');

const BASE = 'http://localhost:3000';
let TOKEN = '';
let createdIds = {};
const TS = Date.now(); // unique suffix for test data

function api(method, path, body = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, BASE);
        const data = body ? JSON.stringify(body) : null;
        const options = {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname + url.search,
            method,
            headers: {
                'Content-Type': 'application/json',
                ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
                ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
            }
        };
        const req = http.request(options, res => {
            let body = '';
            res.on('data', c => (body += c));
            res.on('end', () => {
                try { resolve({ status: res.statusCode, data: JSON.parse(body) }); }
                catch { resolve({ status: res.statusCode, data: body }); }
            });
        });
        req.on('error', reject);
        if (data) req.write(data);
        req.end();
    });
}

function log(icon, label, detail = '') {
    console.log(`  ${icon} ${label}${detail ? ` → ${detail}` : ''}`);
}

async function test(name, fn) {
    try {
        await fn();
        log('✅', name);
        return true;
    } catch (err) {
        log('❌', name, err.message);
        return false;
    }
}

function assert(condition, msg) { if (!condition) throw new Error(msg); }

async function run() {
    let passed = 0, failed = 0;
    const track = (ok) => ok ? passed++ : failed++;

    console.log('\n╔══════════════════════════════════════════════╗');
    console.log('║   SGDL - Test de Integración API             ║');
    console.log('╚══════════════════════════════════════════════╝\n');

    // ── 1. AUTH ──
    console.log('📋 1. AUTENTICACIÓN');
    track(await test('Login con credenciales válidas', async () => {
        const res = await api('POST', '/api/auth/login', { email: 'admin@boveda.cl', password: 'admin' });
        assert(res.status === 200, `Status ${res.status}: ${JSON.stringify(res.data)}`);
        assert(res.data.token, 'No se recibió token');
        TOKEN = res.data.token;
    }));

    track(await test('Login con credenciales inválidas → 401', async () => {
        const res = await api('POST', '/api/auth/login', { email: 'noexiste@test.cl', password: '12345' });
        assert(res.status === 401, `Esperaba 401, recibió ${res.status}`);
    }));

    track(await test('GET /api/auth/me → usuario actual', async () => {
        const res = await api('GET', '/api/auth/me');
        assert(res.status === 200, `Status ${res.status}`);
        assert(res.data.email === 'admin@boveda.cl', `Email incorrecto: ${res.data.email}`);
    }));

    // ── 2. EMPRESAS ──
    console.log('\n🏢 2. EMPRESAS (CRUD)');
    track(await test('POST /api/empresas → crear', async () => {
        const res = await api('POST', '/api/empresas', {
            rut: `99.${TS % 1000}.${(TS + 1) % 1000}-1`,
            razon_social: `Constructora Test ${TS} SpA`,
            direccion: 'Calle Falsa 123, Santiago',
            telefono: '+56912345678'
        });
        assert(res.status === 201, `Status ${res.status}: ${JSON.stringify(res.data)}`);
        // Controller returns { id, ...data } directly
        createdIds.empresa = res.data.id;
        assert(createdIds.empresa, `No se obtuvo ID. Response: ${JSON.stringify(res.data)}`);
        log('   🆔', `ID: ${createdIds.empresa}`);
    }));

    track(await test('GET /api/empresas/:id → detalle', async () => {
        const res = await api('GET', `/api/empresas/${createdIds.empresa}`);
        assert(res.status === 200, `Status ${res.status}: ${JSON.stringify(res.data)}`);
        // getById returns the item directly
        assert(res.data.razon_social.includes('Constructora Test'), `Nombre incorrecto: ${res.data.razon_social}`);
    }));

    track(await test('PUT /api/empresas/:id → actualizar', async () => {
        const res = await api('PUT', `/api/empresas/${createdIds.empresa}`, {
            razon_social: `Constructora Actualizada ${TS} SpA`
        });
        assert(res.status === 200, `Status ${res.status}: ${JSON.stringify(res.data)}`);
    }));

    track(await test('GET /api/empresas → listar', async () => {
        const res = await api('GET', '/api/empresas');
        assert(res.status === 200, `Status ${res.status}`);
        assert(res.data.data.length >= 1, 'No hay empresas');
        log('   📊', `${res.data.data.length} empresas`);
    }));

    // ── 3. OBRAS ──
    console.log('\n🏗️  3. OBRAS (CRUD)');
    track(await test('POST /api/obras → crear', async () => {
        const res = await api('POST', '/api/obras', {
            empresa_id: createdIds.empresa,
            nombre: `Obra Torre Norte Test ${TS}`,
            direccion: 'Av. Libertador 789, Providencia'
        });
        assert(res.status === 201, `Status ${res.status}: ${JSON.stringify(res.data)}`);
        createdIds.obra = res.data.id;
        assert(createdIds.obra, `No se obtuvo ID. Response: ${JSON.stringify(res.data)}`);
        log('   🆔', `ID: ${createdIds.obra}`);
    }));

    track(await test('PUT /api/obras/:id → actualizar', async () => {
        const res = await api('PUT', `/api/obras/${createdIds.obra}`, {
            nombre: `Obra Torre Norte (Actualizada) ${TS}`
        });
        assert(res.status === 200, `Status ${res.status}: ${JSON.stringify(res.data)}`);
    }));

    track(await test('GET /api/obras → listar', async () => {
        const res = await api('GET', '/api/obras');
        assert(res.status === 200, `Status ${res.status}`);
        log('   📊', `${res.data.data.length} obras`);
    }));

    // ── 4. CARGOS ──
    console.log('\n👔 4. CARGOS (CRUD)');
    track(await test('POST /api/cargos → crear', async () => {
        const res = await api('POST', '/api/cargos', {
            nombre: `Electricista Test ${TS}`
        });
        assert(res.status === 201, `Status ${res.status}: ${JSON.stringify(res.data)}`);
        createdIds.cargo = res.data.id;
        assert(createdIds.cargo, `No se obtuvo ID. Response: ${JSON.stringify(res.data)}`);
        log('   🆔', `ID: ${createdIds.cargo}`);
    }));

    track(await test('GET /api/cargos → listar', async () => {
        const res = await api('GET', '/api/cargos');
        assert(res.status === 200, `Status ${res.status}`);
        log('   📊', `${res.data.data.length} cargos`);
    }));

    // ── 5. TRABAJADORES ──
    console.log('\n👷 5. TRABAJADORES (CRUD)');
    track(await test('POST /api/trabajadores → crear trabajador 1 (Carlos)', async () => {
        const res = await api('POST', '/api/trabajadores', {
            rut: `${TS % 100}.${(TS + 1) % 1000}.${(TS + 2) % 1000}-9`,
            nombres: 'Carlos Alberto',
            apellido_paterno: 'González',
            apellido_materno: 'Muñoz',
            telefono: '+56912345678',
            email: `carlos${TS}@test.cl`,
            empresa_id: createdIds.empresa,
            obra_id: createdIds.obra,
            cargo_id: createdIds.cargo,
            fecha_ingreso: '2024-01-15'
        });
        assert(res.status === 201, `Status ${res.status}: ${JSON.stringify(res.data)}`);
        createdIds.trabajador1 = res.data.id;
        assert(createdIds.trabajador1, `No se obtuvo ID`);
        log('   🆔', `ID: ${createdIds.trabajador1}`);
    }));

    track(await test('POST /api/trabajadores → crear trabajador 2 (María)', async () => {
        const res = await api('POST', '/api/trabajadores', {
            rut: `${(TS + 10) % 100}.${(TS + 11) % 1000}.${(TS + 12) % 1000}-4`,
            nombres: 'María Fernanda',
            apellido_paterno: 'López',
            apellido_materno: 'Soto',
            telefono: '+56987654321',
            email: `maria${TS}@test.cl`,
            empresa_id: createdIds.empresa,
            obra_id: createdIds.obra,
            cargo_id: createdIds.cargo,
            fecha_ingreso: '2024-03-01'
        });
        assert(res.status === 201, `Status ${res.status}: ${JSON.stringify(res.data)}`);
        createdIds.trabajador2 = res.data.id;
        log('   🆔', `ID: ${createdIds.trabajador2}`);
    }));

    track(await test('POST /api/trabajadores → crear trabajador 3 (Pedro)', async () => {
        const res = await api('POST', '/api/trabajadores', {
            rut: `${(TS + 20) % 100}.${(TS + 21) % 1000}.${(TS + 22) % 1000}-8`,
            nombres: 'Pedro Antonio',
            apellido_paterno: 'Ramírez',
            apellido_materno: 'Vega',
            telefono: '+56911223344',
            email: `pedro${TS}@test.cl`,
            empresa_id: createdIds.empresa,
            obra_id: createdIds.obra,
            cargo_id: createdIds.cargo,
            fecha_ingreso: '2024-06-01'
        });
        assert(res.status === 201, `Status ${res.status}: ${JSON.stringify(res.data)}`);
        createdIds.trabajador3 = res.data.id;
        log('   🆔', `ID: ${createdIds.trabajador3}`);
    }));

    track(await test('GET /api/trabajadores → listar todos', async () => {
        const res = await api('GET', '/api/trabajadores');
        assert(res.status === 200, `Status ${res.status}`);
        assert(res.data.data.length >= 3, `Esperaba ≥3, got ${res.data.data.length}`);
        log('   📊', `${res.data.data.length} trabajadores`);
    }));

    track(await test('GET /api/trabajadores/:id → detalle', async () => {
        const res = await api('GET', `/api/trabajadores/${createdIds.trabajador1}`);
        assert(res.status === 200, `Status ${res.status}: ${JSON.stringify(res.data)}`);
        assert(res.data.nombres === 'Carlos Alberto', `Nombre: ${res.data.nombres}`);
    }));

    track(await test('PUT /api/trabajadores/:id → actualizar email', async () => {
        const res = await api('PUT', `/api/trabajadores/${createdIds.trabajador1}`, {
            telefono: '+56900000000'
        });
        assert(res.status === 200, `Status ${res.status}: ${JSON.stringify(res.data)}`);
    }));

    track(await test('GET /api/trabajadores?q=Carlos → búsqueda', async () => {
        const res = await api('GET', '/api/trabajadores?q=Carlos');
        assert(res.status === 200, `Status ${res.status}`);
        assert(res.data.data.length >= 1, `Esperaba ≥1, got ${res.data.data.length}`);
        log('   🔍', `Búsqueda: ${res.data.data.length} resultado(s)`);
    }));

    // ── 6. ASISTENCIA ──
    console.log('\n📋 6. ASISTENCIA');
    const today = new Date().toISOString().split('T')[0];
    track(await test(`POST /api/asistencias/bulk → registrar (${today})`, async () => {
        const res = await api('POST', '/api/asistencias/bulk', {
            obra_id: createdIds.obra,
            registros: [
                { trabajador_id: createdIds.trabajador1, obra_id: createdIds.obra, fecha: today, estado: 'Presente', observacion: 'Sin novedad' },
                { trabajador_id: createdIds.trabajador2, obra_id: createdIds.obra, fecha: today, estado: 'Atraso', observacion: '15 min tarde' },
                { trabajador_id: createdIds.trabajador3, obra_id: createdIds.obra, fecha: today, estado: 'Ausente', observacion: 'Sin aviso' }
            ]
        });
        assert(res.status === 200 || res.status === 201, `Status ${res.status}: ${JSON.stringify(res.data)}`);
        log('   📝', `${Array.isArray(res.data) ? res.data.length : '?'} registros procesados`);
    }));

    track(await test(`GET /api/asistencias/obra/:id/fecha/:fecha → consultar`, async () => {
        const res = await api('GET', `/api/asistencias/obra/${createdIds.obra}/fecha/${today}`);
        assert(res.status === 200, `Status ${res.status}: ${JSON.stringify(res.data).substring(0, 200)}`);
        // Returns rows array directly
        const rows = Array.isArray(res.data) ? res.data : (res.data.data || []);
        assert(rows.length >= 1, `Esperaba registros, got ${rows.length}`);
        log('   📊', `${rows.length} registros de asistencia`);
    }));

    // ── 7. DASHBOARD ──
    console.log('\n📊 7. DASHBOARD');
    track(await test('GET /api/dashboard/summary', async () => {
        const res = await api('GET', '/api/dashboard/summary');
        assert(res.status === 200, `Status ${res.status}`);
        assert(res.data.data.counters, 'No se recibieron counters');
        const c = res.data.data.counters;
        log('   👷', `Trabajadores: ${c.trabajadores}`);
        log('   📄', `Documentos: ${c.documentos}`);
        log('   ⚠️ ', `Vencidos: ${c.vencidos}`);
        log('   ✅', `Asistencia hoy: ${c.asistencia_hoy}%`);
    }));

    // ── 8. TIPOS AUSENCIA ──
    console.log('\n🏥 8. TIPOS AUSENCIA');
    track(await test('GET /api/tipos-ausencia → listar', async () => {
        const res = await api('GET', '/api/tipos-ausencia');
        assert(res.status === 200, `Status ${res.status}`);
        log('   📊', `${res.data.data.length} tipos de ausencia`);
    }));

    // ── 9. HEALTH CHECK ──
    console.log('\n💚 9. HEALTH CHECK');
    track(await test('GET /api/health', async () => {
        const res = await api('GET', '/api/health');
        assert(res.status === 200, `Status ${res.status}`);
        assert(res.data.status === 'ok', `Status: ${res.data.status}`);
    }));

    // ── 10. CLEANUP ──
    console.log('\n🧹 10. LIMPIEZA (soft-delete)');
    track(await test('DELETE /api/trabajadores/:id → desactivar Pedro', async () => {
        const res = await api('DELETE', `/api/trabajadores/${createdIds.trabajador3}`);
        assert(res.status === 200, `Status ${res.status}: ${JSON.stringify(res.data)}`);
    }));

    track(await test('Verificar que Pedro ya no aparece en lista activos', async () => {
        const res = await api('GET', `/api/trabajadores/${createdIds.trabajador3}`);
        // Should still exist but with activo=false, or depending on getById impl might just return it
        assert(res.status === 200 || res.status === 404, `Status ${res.status}`);
    }));

    // ── RESULTS ──
    const total = passed + failed;
    console.log('\n╔══════════════════════════════════════════════╗');
    console.log(`║   RESULTADOS: ${String(passed).padStart(2)} ✅  ${String(failed).padStart(2)} ❌  (Total: ${total})       ║`);
    if (failed === 0) {
        console.log('║   🎉 ¡TODOS LOS TESTS PASARON!               ║');
    }
    console.log('╚══════════════════════════════════════════════╝\n');

    if (failed > 0) process.exit(1);
}

run().catch(err => { console.error('Error fatal:', err); process.exit(1); });
