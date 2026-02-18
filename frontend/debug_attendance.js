import { chromium } from 'playwright';

(async () => {
    // Definimos el HOME para que Playwright encuentre sus binarios
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    console.log('--- Iniciando Depuración de Asistencia ---');

    // Escuchar logs de consola
    page.on('console', msg => {
        if (msg.type() === 'error') {
            console.log(`BROWSER ERROR: ${msg.text()}`);
        }
    });

    // Escuchar todas las peticiones de red
    page.on('request', request => {
        if (request.url().includes('/asistencias')) {
            console.log(`>> Request: ${request.method()} ${request.url()}`);
            if (request.postData()) {
                console.log(`   Body: ${request.postData()}`);
            }
        }
    });

    // Escuchar fallos de peticiones
    page.on('requestfailed', request => {
        console.log(`!! Request Failed: ${request.url()} - ${request.failure()?.errorText}`);
    });

    // Escuchar las respuestas del servidor
    page.on('response', async response => {
        if (response.url().includes('/asistencias')) {
            console.log(`<< Response: ${response.status()} ${response.url()}`);
            try {
                const body = await response.text();
                if (response.status() >= 400) {
                    console.log(`   Error Body: ${body}`);
                }
            } catch (e) { }
        }
    });

    try {
        console.log('1. Navegando al login...');
        await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle' });

        console.log('2. Iniciando sesión como testadmin...');
        await page.fill('input[type="email"]', 'testadmin@boveda.cl');
        await page.fill('input[type="password"]', 'testadmin123');
        await page.click('button[type="submit"]');

        console.log('3. Esperando al Dashboard...');
        await page.waitForURL('**/');
        await page.waitForSelector('nav');

        console.log('4. Navegando a Asistencia...');
        await page.goto('http://localhost:5173/asistencia', { waitUntil: 'networkidle' });

        console.log('5. Intentando guardar cambios de asistencia...');
        // Esperamos a que cargue la nómina
        await page.waitForSelector('.premium-card', { timeout: 10000 });

        // Clic en Guardar Cambios
        await page.click('button:has-text("Guardar Cambios")');

        console.log('6. Esperando respuesta del servidor...');
        await page.waitForTimeout(5000); // Suficiente tiempo para capturar logs de red

        await page.screenshot({ path: 'attendance_error_debug.png', fullPage: true });
        console.log('Captura de pantalla guardada.');

    } catch (error) {
        console.error('ERROR EN EL SCRIPT:', error);
    } finally {
        await browser.close();
        console.log('--- Depuración Finalizada ---');
    }
})();
