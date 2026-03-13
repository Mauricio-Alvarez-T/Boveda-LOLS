import { chromium } from 'playwright';

(async () => {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
        console.log('--- Iniciando Test de Sincronización de Horarios E2E ---');
        
        // Mocks de API
        await page.route('**/api/auth/login', route => route.fulfill({
            status: 200, contentType: 'application/json',
            body: JSON.stringify({ status: 'success', data: { user: { id: 1, email: 'test@lols.cl', rol: 'Super Administrador', rol_id: 1 }, token: 'mockToken' }})
        }));

        await page.route('**/api/obras*', route => route.fulfill({
            status: 200, contentType: 'application/json',
            body: JSON.stringify({ status: 'success', data: [{ id: 1, nombre: 'Obra Horario Test', activa: 1 }] })
        }));

        // Configuración de horario para la obra (Lunes a las 08:30)
        const mockSchedules = [
            { obra_id: 1, dia_semana: 'lun', hora_entrada: '08:30:00', hora_salida: '18:30:00', hora_colacion_inicio: '13:00:00', hora_colacion_fin: '14:00:00', colacion_minutos: 60 }
        ];

        await page.route('**/api/asistencias/horarios/*', route => route.fulfill({
            status: 200, contentType: 'application/json',
            body: JSON.stringify({ status: 'success', data: mockSchedules })
        }));

        await page.route('**/api/asistencias/estados', route => route.fulfill({
            status: 200, contentType: 'application/json',
            body: JSON.stringify({ status: 'success', data: [
                { id: 1, codigo: 'A', nombre: 'Asiste', color: '#029E4D', es_presente: 1 }
            ]})
        }));

        await page.route('**/api/trabajadores*', route => route.fulfill({
            status: 200, contentType: 'application/json',
            body: JSON.stringify({ status: 'success', data: [{ id: 1, nombres: 'Juan', apellido_paterno: 'Perez', rut: '1-1', activo: 1, categoria_reporte: 'obra' }] })
        }));

        await page.route('**/api/asistencias/obra/*', route => route.fulfill({
            status: 200, contentType: 'application/json',
            body: JSON.stringify({ status: 'success', data: { registros: [], feriado: null } })
        }));

        // Inyectar sesión
        await page.goto('http://localhost:5173/login');
        await page.evaluate(() => {
            localStorage.setItem('sgdl_token', 'mocked-token');
            localStorage.setItem('sgdl_user', JSON.stringify({ id: 1, email: 'test@lols.cl', rol: 'Super Administrador', rol_id: 1 }));
        });

        // Navegar a una fecha que sea Lunes (por ejemplo 2026-03-02 es lunes)
        console.log('Navegando a Asistencia (Lunes 2026-03-02)...');
        await page.goto('http://localhost:5173/asistencia?date=2026-03-02&obra_id=1', { waitUntil: 'networkidle' });
        
        await page.waitForSelector('text=Perez');

        // Clic en "A" (Asiste)
        console.log('Marcando asistencia como "Presente"...');
        await page.click('button:has-text("A")');

        // Abrir detalle para ver si se llenaron las horas
        console.log('Abriendo detalle del trabajador...');
        await page.click('text=Detalle');

        // Verificar que el input de hora de entrada tenga "08:30"
        // En TimeStepperInput, el input tiene un valor que podemos verificar
        const entradaInput = page.locator('input[type="time"]').first();
        const value = await entradaInput.inputValue();
        
        console.log(`Hora de entrada detectada: ${value}`);

        if (value === '08:30') {
            console.log('✓ TEST DE SINCRONIZACIÓN EXITOSO: Horarios aplicados automáticamente.');
        } else {
            console.log(`✗ TEST DE SINCRONIZACIÓN FALLIDO: Se esperaba 08:30 pero se obtuvo ${value}`);
            await page.screenshot({ path: 'schedule_sync_failure.png' });
        }

    } catch (error) {
        console.error('Error durante el test:', error);
        await page.screenshot({ path: 'schedule_sync_error.png' });
    } finally {
        await browser.close();
    }
})();
