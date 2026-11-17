/**
 * E2E del editor visual del Sitio web (docs/reglas/sitio-web.md § Editor visual).
 *
 * Qué hace: sirve el frontend compilado (`vite preview`), simula TODA la API (`page.route`, nada sale a un servidor real:
 * una persona con sitio_web.ver/editar/publicar, `/sitio-web/config` con `urlSitio: http://localhost:4321` y
 * `/sitio-web/editor/borrador` armado con las 27 obras reales de backend/tests/fixtures/sitio-web/obras), abre Sitio web,
 * espera el saludo con el iframe (el sitio con el puente), escribe en el título de una obra DENTRO del iframe, revisa que
 * la barra diga «Guardar (1)», abre el diálogo de guardar y revisa el cuerpo del POST /sitio-web/editor/guardar.
 *
 * Cómo correrlo:
 *   1. El sitio con el puente en http://localhost:4321 (repo lols.cl, rama del editor visual):
 *        npm run build && npx astro preview --port 4321      (o: npm run dev -- --port 4321)
 *   2. El frontend compilado:   cd frontend && npm run build
 *   3. Este script:             cd frontend && node e2e/editor_visual_e2e.js
 *
 *   Usa el Chrome instalado (`channel: 'chrome'`; los navegadores de Playwright no se descargan). Variables opcionales:
 *   SITIO_URL (por defecto http://localhost:4321), PREVIEW_PORT (4173), HEADLESS=0 para ver el navegador,
 *   E2E_CAPTURAS_DIR=<carpeta> para guardar cómo se ve (escritorio y teléfono), E2E_CAPTURA=<archivo.png> la de una falla.
 *   Si no hay nada escuchando en SITIO_URL, imprime «SKIP» y sale con 0 (el sitio lo construye otro repo).
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const FRONT = path.resolve(AQUI, '..');
const SITIO = (process.env.SITIO_URL || 'http://localhost:4321').replace(/\/+$/, '');
const PUERTO = Number(process.env.PREVIEW_PORT || 4173);
const BOVEDA = `http://localhost:${PUERTO}`;
const HEADLESS = process.env.HEADLESS !== '0';

const log = (...a) => console.log('[editor-visual-e2e]', ...a);

async function responde(url, ms = 3000) {
    try {
        const r = await fetch(url, { signal: AbortSignal.timeout(ms) });
        return r.status < 500;
    } catch {
        return false;
    }
}

async function esperarA(url, ms) {
    const fin = Date.now() + ms;
    while (Date.now() < fin) {
        if (await responde(url, 1000)) return true;
        await new Promise(r => setTimeout(r, 300));
    }
    return false;
}

/* ─────────── datos: las 27 obras reales ─────────── */

const DIR_FIX = path.resolve(FRONT, '../backend/tests/fixtures/sitio-web/obras');
const OBRAS = fs.readdirSync(DIR_FIX).filter(f => f.endsWith('.json')).sort().map((f, i) => {
    const json = JSON.parse(fs.readFileSync(path.join(DIR_FIX, f), 'utf8'));
    return {
        json,
        meta: {
            id: 500 + i, incluir: true, nueva: false, faltantes: [], estadoDerivado: 'publicada',
            updated_at: `2026-11-10T12:00:${String(i % 60).padStart(2, '0')}.000Z`, slug_congelado: true, foto: null,
            fotos_por_aprobar: 0, mandante: json.mandante, mandante_autoriza: json.mandante !== null,
        },
    };
});
const ESTADO_BOVEDA = { 'en-curso': 'en_construccion', contratado: 'contratado', terminado: 'terminado' };

const CONFIG = {
    modo: 'simulacion', motivo: 'modo_simulacion', repo: 'Mauricio-Alvarez-T/lols.cl', rama: 'main', urlSitio: SITIO, tokenVenceEnDias: null,
    catalogos: {
        estados: [
            { valor: 'en_construccion', sitio: 'en-curso', etiqueta: 'En construcción' },
            { valor: 'contratado', sitio: 'contratado', etiqueta: 'En proyecto' },
            { valor: 'terminado', sitio: 'terminado', etiqueta: 'Terminado' },
        ],
        tipos: [], servicios: [], largos: {}, altMin: 5, anio: { min: 1995, max: 2100 },
        foto: { anchos: [800, 1600], minAncho: 800, maxBytes: 10485760, mimes: ['image/jpeg', 'image/png', 'image/webp'] },
    },
};
const PERMISOS = ['sitio_web.ver', 'sitio_web.editar', 'sitio_web.publicar'];
const USUARIO = { id: 1, nombre: 'Prueba E2E', email: 'e2e@lols.invalid', rol: 'Prueba', rol_id: 1, obra_id: null, permisos: PERMISOS };

/* ─────────── la API simulada ─────────── */

function montarApi(context, guardados, sinSimular) {
    const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
    const json = (route, cuerpo, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: CORS, body: JSON.stringify(cuerpo) });
    return context.route(url => url.pathname.startsWith('/api/') && url.origin !== new URL(SITIO).origin, async (route) => {
        const req = route.request();
        if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
        const ruta = new URL(req.url()).pathname.replace(/^.*?\/api/, '');
        if (ruta === '/sitio-web/config') return json(route, { data: CONFIG });
        if (ruta === '/sitio-web/editor/borrador') return json(route, { data: OBRAS });
        if (ruta === '/sitio-web/editor/guardar' && req.method() === 'POST') {
            const cuerpo = req.postDataJSON();
            guardados.push(cuerpo);
            const obras = cuerpo.obras.map(o => ({ id: o.id, updated_at: '2026-11-17T12:00:00.000Z' }));
            for (const o of cuerpo.obras) {
                const x = OBRAS.find(y => y.meta.id === o.id);
                if (x && typeof o.cambios.nombre === 'string') { x.json = { ...x.json, nombre: o.cambios.nombre }; x.meta = { ...x.meta, updated_at: '2026-11-17T12:00:00.000Z' }; }
            }
            return json(route, { data: { obras } });
        }
        if (ruta === '/sitio-web/obras') {
            return json(route, { data: OBRAS.map(o => ({
                id: o.meta.id, slug: o.json.slug, nombre: o.json.nombre, estado: ESTADO_BOVEDA[o.json.estado], comuna: o.json.comuna, orden: o.json.orden,
                incluir: true, vinculada: false, tiene_portada: o.json.fotos.length > 0, portada_id: null, referencia: o.json.referencia ?? null,
                fotos_por_aprobar: 0, faltantes: [], estadoDerivado: 'publicada', publicado_at: '2026-11-01T10:00:00.000Z', updated_at: o.meta.updated_at,
            })) });
        }
        if (ruta === '/sitio-web/publicaciones') return json(route, { data: [] });
        if (ruta === '/sitio-web/pendientes') return json(route, { data: { fotosPorAprobar: 0, obrasConCambios: 0, ultimaConError: null } });
        sinSimular.add(`${req.method()} ${ruta}`);
        return json(route, { data: [] });
    });
}

/* ─────────── la prueba ─────────── */

async function main() {
    if (!(await responde(`${SITIO}/?editor`))) {
        log(`SKIP: no hay nada escuchando en ${SITIO} (el sitio lols.cl con el puente del editor). Ver cómo levantarlo arriba del archivo.`);
        process.exit(0);
    }
    if (!fs.existsSync(path.join(FRONT, 'dist/index.html'))) {
        log('Falta el frontend compilado: corre `npm run build` en frontend/ primero.');
        process.exit(1);
    }

    const vite = spawn(process.execPath, [path.join(FRONT, 'node_modules/vite/bin/vite.js'), 'preview', '--port', String(PUERTO), '--strictPort'], { cwd: FRONT, stdio: 'ignore' });
    let browser;
    let page;
    let falla = null;
    try {
        if (!(await esperarA(BOVEDA, 30000))) throw new Error(`vite preview no respondió en ${BOVEDA}`);
        browser = await chromium.launch({ channel: 'chrome', headless: HEADLESS });
        const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
        await context.addInitScript(([usuario]) => {
            localStorage.setItem('sgdl_token', 'token-e2e');
            localStorage.setItem('sgdl_user', JSON.stringify(usuario));
        }, [USUARIO]);
        const guardados = [];
        const sinSimular = new Set();
        await montarApi(context, guardados, sinSimular);
        page = await context.newPage();
        page.on('pageerror', e => log('error en la página:', e.message));

        await page.goto(`${BOVEDA}/sitio-web`);
        log('Esperando el saludo del puente…');
        await page.locator('[data-estado-marco="listo"]').waitFor({ timeout: 20000 });
        log('Saludo OK (iniciar + MessageChannel).');

        const sitio = page.frameLocator('iframe[title="El sitio lols.cl para editar"]');
        const titulo = sitio.locator('[data-ed-item^="obras/"] [data-ed-campo="/nombre"]').first();
        await titulo.waitFor({ timeout: 10000 });
        const item = await titulo.evaluate(el => el.closest('[data-ed-item]').getAttribute('data-ed-item'));
        const slug = item.replace(/^obras\//, '');
        const obra = OBRAS.find(o => o.json.slug === slug);
        if (!obra) throw new Error(`El sitio muestra ${item}, que no está en el borrador simulado`);
        const nuevo = `${obra.json.nombre} (editado)`;
        const version = obra.meta.updated_at;
        log(`Escribiendo en el título de ${item}…`);
        await titulo.click();
        await titulo.press('End');
        await titulo.pressSequentially(' (editado)', { delay: 30 });
        await titulo.press('Tab');   // salir del campo: el puente manda el último cambio

        await page.getByRole('button', { name: /^Guardar \(1\)$/ }).waitFor({ timeout: 5000 });
        log('La barra dice «Guardar (1)».');

        // Deshacer / rehacer desde la barra: el sitio vuelve a pintar el título (mensaje `campo` por el puerto).
        await page.getByRole('button', { name: 'Deshacer' }).click();
        await sitio.locator(`[data-ed-item="${item}"] [data-ed-campo="/nombre"]`).first().filter({ hasText: new RegExp(`^${obra.json.nombre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }).waitFor({ timeout: 5000 });
        await page.getByRole('button', { name: /^Guardar$/ }).waitFor({ timeout: 5000 });
        await page.getByRole('button', { name: 'Rehacer' }).click();
        await sitio.locator(`[data-ed-item="${item}"] [data-ed-campo="/nombre"]`).first().filter({ hasText: '(editado)' }).waitFor({ timeout: 5000 });
        log('Deshacer y rehacer llegan al sitio.');

        await page.getByRole('button', { name: /^Guardar \(1\)$/ }).click();
        // El diálogo (ui/Modal no lleva role="dialog"): su título y la fila «Nombre: antes → después».
        await page.getByText('Guardar cambios', { exact: true }).waitFor({ timeout: 5000 });
        await page.locator('li', { hasText: nuevo }).first().waitFor({ timeout: 5000 });
        await page.getByRole('button', { name: /^Guardar$/ }).click();
        // Guardado: el diálogo se cierra y la barra vuelve a «Guardar» sin número (apagado).
        await page.getByText('Guardar cambios', { exact: true }).waitFor({ state: 'detached', timeout: 5000 });
        await page.getByRole('button', { name: /^Guardar$/ }).waitFor({ timeout: 5000 });

        if (guardados.length !== 1) throw new Error(`Se esperaba 1 POST /editor/guardar y hubo ${guardados.length}`);
        const esperado = { obras: [{ id: obra.meta.id, updated_at: version, cambios: { nombre: nuevo } }] };
        const recibido = guardados[0];
        if (JSON.stringify(recibido) !== JSON.stringify(esperado)) {
            throw new Error(`Cuerpo del guardado inesperado:\n  recibido ${JSON.stringify(recibido)}\n  esperado ${JSON.stringify(esperado)}`);
        }
        log('POST /sitio-web/editor/guardar:', JSON.stringify(recibido));
        const capturas = process.env.E2E_CAPTURAS_DIR;
        if (capturas) {
            // Opcional: cómo se ve (escritorio con la obra en el panel, y el teléfono con la hoja inferior).
            fs.mkdirSync(capturas, { recursive: true });
            await titulo.click();
            await page.screenshot({ path: path.join(capturas, 'editor-escritorio.png') });
            await page.setViewportSize({ width: 390, height: 844 });
            await page.reload();
            await page.locator('[data-estado-marco="listo"]').waitFor({ timeout: 20000 });
            await page.screenshot({ path: path.join(capturas, 'editor-celular.png') });
            // Tocar un texto no abre la hoja (taparía lo que se escribe): «Datos de la obra» en la barra de abajo sí.
            await sitio.locator('[data-ed-campo="/nombre"]').first().click();
            await page.getByRole('button', { name: 'Datos de la obra' }).click();
            await page.getByRole('dialog', { name: 'Obra seleccionada' }).waitFor({ timeout: 5000 });
            await page.screenshot({ path: path.join(capturas, 'editor-celular-hoja.png') });
            log('Capturas en', capturas);
        }
        if (sinSimular.size) log('Rutas de la API sin datos propios (respondieron { data: [] }):', [...sinSimular].join(', '));
        log('OK');
    } catch (e) {
        falla = e;
        // Para ver qué había en pantalla (o la ruta de E2E_CAPTURA).
        const captura = process.env.E2E_CAPTURA || path.join(os.tmpdir(), 'editor_visual_e2e_falla.png');
        if (page) await page.screenshot({ path: captura, fullPage: true }).then(() => log('Captura:', captura)).catch(() => {});
    } finally {
        if (browser) await browser.close().catch(() => {});
        vite.kill();
    }
    if (falla) {
        log('FALLÓ:', falla.message);
        process.exit(1);
    }
}

main();
