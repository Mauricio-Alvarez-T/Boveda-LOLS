import { chromium } from 'playwright';

(async () => {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
        console.log('--- Iniciando Test de Consistencia (V2): Asistencia vs WhatsApp ---');
        
        // Mocks de API
        await page.route('**/api/auth/login', route => route.fulfill({
            status: 200, contentType: 'application/json',
            body: JSON.stringify({ status: 'success', data: { user: { id: 1, email: 'test@lols.cl', rol: 'Super Administrador', rol_id: 1 }, token: 'mockToken' }})
        }));

        const mockWorkers = [
            { id: 1, nombres: 'Juan', apellido_paterno: 'Perez', rut: '1-1', activo: 1, categoria_reporte: 'obra', cargo_nombre: 'Carpintero' }
        ];

        await page.route('**/api/trabajadores*', route => route.fulfill({
            status: 200, contentType: 'application/json',
            body: JSON.stringify({ status: 'success', data: mockWorkers })
        }));

        await page.route('**/api/asistencias/estados', route => route.fulfill({
            status: 200, contentType: 'application/json',
            body: JSON.stringify({ status: 'success', data: [
                { id: 1, codigo: 'A', nombre: 'Asiste', color: '#029E4D', es_presente: 1 },
                { id: 2, codigo: 'F', nombre: 'Falta Injustificada', color: '#FF3B30', es_presente: 0 },
                { id: 3, codigo: 'JI', nombre: 'Jornada Incompleta (JI)', color: '#FF9F0A', es_presente: 0 }
            ]})
        }));

        await page.route('**/api/asistencias/obra/*', route => route.fulfill({
            status: 200, contentType: 'application/json',
            body: JSON.stringify({ status: 'success', data: { registros: [], feriado: null } })
        }));

        await page.route('**/api/obras*', route => route.fulfill({
            status: 200, contentType: 'application/json',
            body: JSON.stringify({ status: 'success', data: [{ id: 1, nombre: 'Obra Test', activa: 1 }] })
        }));

        await page.route('**/api/config-horarios/obra/*', route => route.fulfill({
            status: 200, contentType: 'application/json',
            body: JSON.stringify({ status: 'success', data: [] })
        }));

        // Inyectar sesión
        await page.goto('http://localhost:5173/login');
        await page.evaluate(() => {
            localStorage.setItem('sgdl_token', 'mocked-token');
            localStorage.setItem('sgdl_user', JSON.stringify({ id: 1, email: 'test@lols.cl', rol: 'Super Administrador', rol_id: 1 }));
        });

        console.log('Navegando a Asistencia...');
        await page.goto('http://localhost:5173/asistencia', { waitUntil: 'networkidle' });
        
        // Esperar a que el trabajador aparezca para asegurar que la vista cargó
        await page.waitForSelector('text=Perez', { timeout: 10000 });
        console.log('Trabajador detectado.');

        // Forzar estados vía API Mock para evitar problemas de clic en UI si los botones son dinámicos
        // Aunque intentaremos clicar un botón con una clase específica o texto exacto
        await page.screenshot({ path: 'attendance_before_click.png' });

        // Intentamos clicar el botón "F" para el trabajador Perez
        // En Attendance.tsx: {est.codigo} dentro de un button
        console.log('Intentando marcar Falta (F)...');
        const fButton = page.locator('button').filter({ hasText: /^F$/ }).first();
        await fButton.click();
        
        // Esperamos a que se procese
        await page.waitForTimeout(1000);

        console.log('Generando reporte de WhatsApp...');
        // Manejar window.open
        const [newPage] = await Promise.all([
            context.waitForEvent('page'),
            page.click('button:has-text("WhatsApp")')
        ]);
        
        const finalUrl = newPage.url();
        const decodedText = decodeURIComponent(finalUrl.split('text=')[1]);
        
        console.log('--- Texto del Reporte Generado ---');
        console.log(decodedText);
        
        const isFasta = decodedText.includes('F: 01');
        const includesJuan = decodedText.includes('Perez (F)');
        
        console.log(`- Conteo F=01: ${isFasta ? 'OK' : 'FALLA'}`);
        console.log(`- Juan en excepciones: ${includesJuan ? 'OK' : 'FALLA'}`);

        if (isFasta && includesJuan) {
            console.log('✓ TEST DE CONSISTENCIA EXITOSO');
        } else {
            console.log('✗ TEST DE CONSISTENCIA FALLIDO');
            await page.screenshot({ path: 'attendance_failure.png' });
        }

    } catch (error) {
        console.error('Error durante el test:', error);
        await page.screenshot({ path: 'attendance_error.png' });
    } finally {
        await browser.close();
    }
})();
