import { chromium } from 'playwright';

(async () => {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
        console.log('--- Iniciando Verificación Visual con Bypass de Login ---');
        
        // Mocks de API
        await page.route('**/api/trabajadores*', route => route.fulfill({
            status: 200, contentType: 'application/json',
            body: JSON.stringify({ status: 'success', data: [{ 
                id: 1, rut: '12.345.678-9', nombres: 'Pruebas', apellido_paterno: 'Finales', activo: 0, 
                estado_nombre: 'Finiquitado', cargo_nombre: 'Operador' 
            }]})
        }));

        await page.route('**/api/asistencias/estados', route => route.fulfill({
            status: 200, contentType: 'application/json',
            body: JSON.stringify({ status: 'success', data: [
                { id: 1, codigo: 'A', nombre: 'Asiste', color: '#029E4D', es_presente: 1 },
                { id: 2, codigo: 'JI', nombre: 'Jornada Incompleta (JI)', color: '#FF9F0A', es_presente: 0 }
            ]})
        }));

        await page.route('**/api/obras*', route => route.fulfill({
            status: 200, contentType: 'application/json',
            body: JSON.stringify({ status: 'success', data: [{ id: 1, nombre: 'Obra Mock', activa: 1 }] })
        }));

        // Abrir la página para establecer el origen
        await page.goto('http://localhost:5173/login');

        // INYECTAR LOCALSTORAGE
        console.log('Inyectando sesión en localStorage...');
        await page.evaluate(() => {
            localStorage.setItem('sgdl_token', 'mocked-token');
            localStorage.setItem('sgdl_user', JSON.stringify({ id: 1, email: 'test@lols.cl', rol: 'Super Administrador' }));
        });

        console.log('Navegando directamente a Trabajadores...');
        await page.goto('http://localhost:5173/trabajadores', { waitUntil: 'networkidle' });
        await page.waitForTimeout(3000);
        await page.screenshot({ path: 'verify_workers_direct.png', fullPage: true });
        const workersHtml = await page.content();
        console.log(`¿HTML contiene "Finiquitado"?: ${workersHtml.includes('Finiquitado')}`);

        console.log('Navegando directamente a Asistencia...');
        await page.goto('http://localhost:5173/asistencia', { waitUntil: 'networkidle' });
        await page.waitForTimeout(3000);
        await page.screenshot({ path: 'verify_attendance_direct.png', fullPage: true });
        const attendanceHtml = await page.content();
        console.log(`¿HTML contiene "JI"?: ${attendanceHtml.includes('JI')}`);

        console.log('--- Verificación Finalizada ---');
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await browser.close();
    }
})();
