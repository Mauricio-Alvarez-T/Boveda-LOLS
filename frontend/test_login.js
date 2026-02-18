import { chromium } from 'playwright';

(async () => {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    page.on('console', msg => console.log('BROWSER:', msg.text()));

    try {
        console.log('Navegando al login...');
        await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });

        console.log('Ingresando credenciales...');
        // Usar los selectores exactos del LoginForm
        await page.fill('input[type="email"]', 'testadmin@boveda.cl');
        await page.fill('input[type="password"]', 'testadmin123');

        console.log('Haciendo clic en Iniciar Sesión...');
        await page.click('button[type="submit"]');

        // Esperar a que cambie la URL o aparezca el dashboard
        console.log('Esperando redirección...');
        await page.waitForTimeout(5000); // Darle tiempo a la animación y al API

        console.log('Tomando captura del Dashboard...');
        await page.screenshot({ path: 'dashboard_check.png', fullPage: true });

        const url = page.url();
        console.log('URL actual:', url);

        if (url.includes('dashboard') || url === 'http://localhost:5173/') {
            console.log('¡Login exitoso detectado!');
        } else {
            console.log('Parece que el login no redirigió como se esperaba.');
        }

    } catch (error) {
        console.error('Error durante el login:', error);
    } finally {
        await browser.close();
    }
})();
