/**
 * E2E del editor visual del Sitio web (docs/reglas/sitio-web.md § Editor visual).
 *
 * Qué hace: sirve el frontend compilado (`vite preview`), simula TODA la API (`page.route`, nada sale a un servidor real:
 * una persona con sitio_web.ver/editar/publicar, `/sitio-web/config` con `urlSitio: http://localhost:4321` y
 * `/sitio-web/editor/borrador` armado con las 27 obras reales de backend/tests/fixtures/sitio-web/obras), abre Sitio web,
 * espera el saludo con el iframe (el sitio con el puente), escribe en el título de una obra DENTRO del iframe, revisa que
 * la barra diga «Guardar (1)», abre el diálogo de guardar y revisa el cuerpo del POST /sitio-web/editor/guardar.
 * Etapa A2 (estructura): «Nueva obra» desde la barra (y, si el puente ya trae A2, también la tarjeta «+ Nueva obra» del
 * sitio), el nombre en el panel, cambiar el estado de una obra, ◀ «Mover antes» y guardar: el POST lleva `nuevas`, el
 * `estado` en `cambios` y `orden`. Lo que depende del puente A2 (que pinte `~n1`, la tarjeta, el slug definitivo después
 * de guardar) se revisa solo si el puente responde; si no, esos pasos dicen «SKIP (puente sin A2)» y el resto sigue.
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
            publicado_at: '2026-11-01T10:00:00.000Z', nunca_publicada: false,
        },
    };
});
const ESTADO_SITIO = { en_construccion: 'en-curso', contratado: 'contratado', terminado: 'terminado' };
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
            // Lo que haría el servidor, lo justo para que el borrador siguiente lo traiga (A1: nombre; A2: crear, estado, orden).
            const version = `2026-11-17T12:00:${String(guardados.length).padStart(2, '0')}.000Z`;
            const nuevas = {};
            for (const n of cuerpo.nuevas || []) {
                const id = 9000 + OBRAS.length;
                const slug = n.cambios.nombre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
                const estado = ESTADO_SITIO[n.cambios.estado || 'en_construccion'];
                const orden = Math.max(0, ...OBRAS.filter(o => o.json.estado === estado).map(o => o.json.orden)) + 10;
                OBRAS.push({
                    json: {
                        slug, orden, estado, nombre: n.cambios.nombre, titular: null, tipo: null, mandante: null, comuna: n.cambios.comuna ?? null, direccion: null,
                        superficieM2: null, anio: null, inicio: null, servicios: n.cambios.servicios || [], desafio: null, solucion: null, resultado: null, fotos: [],
                    },
                    meta: {
                        id, incluir: false, nueva: false, faltantes: [], estadoDerivado: 'borrador', updated_at: version, slug_congelado: false, foto: null,
                        fotos_por_aprobar: 0, mandante: null, mandante_autoriza: false, publicado_at: null, nunca_publicada: true,
                    },
                });
                nuevas[n.tmp] = { id, slug, updated_at: version };
            }
            for (const o of cuerpo.obras) {
                const x = OBRAS.find(y => y.meta.id === o.id);
                if (!x) continue;
                if (typeof o.cambios.nombre === 'string') x.json = { ...x.json, nombre: o.cambios.nombre };
                if (o.cambios.estado) {
                    const estado = ESTADO_SITIO[o.cambios.estado];
                    x.json = { ...x.json, estado, orden: Math.max(0, ...OBRAS.filter(y => y.json.estado === estado).map(y => y.json.orden)) + 10 };
                }
                x.meta = { ...x.meta, updated_at: version };
            }
            for (const g of cuerpo.orden || []) {
                g.ids.forEach((ref, i) => {
                    const id = typeof ref === 'string' ? nuevas[ref].id : ref;
                    const x = OBRAS.find(y => y.meta.id === id);
                    if (x) x.json = { ...x.json, orden: (i + 1) * 10 };
                });
            }
            const obras = cuerpo.obras.map(o => ({ id: o.id, updated_at: version }));
            return json(route, { data: { obras, nuevas, orden: cuerpo.orden || [], incluir: [] } });
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

        /* ─────────── A2: estructura ─────────── */
        const panel = page.locator('aside[aria-label="Obra seleccionada"]');
        const skipA2 = (paso) => log(`SKIP (puente sin A2): ${paso}`);
        const aparece = (loc, ms = 4000) => loc.first().waitFor({ timeout: ms }).then(() => true, () => false);

        // 1. «Nueva obra» desde la barra → «En proyecto» (sale en la portada: «Próximos proyectos» muestra todas).
        await page.getByRole('button', { name: 'Nueva obra' }).first().click();
        await page.getByRole('menuitem', { name: /En proyecto/ }).click();
        await panel.getByText('Sin guardar · se crea al guardar').waitFor({ timeout: 5000 });
        const nombreNueva = panel.locator('input').first();
        // El sitio enfoca su ficha al mostrarla; el panel recupera el foco del Nombre poco después.
        const enfocado = await page.waitForFunction(() => document.activeElement?.tagName === 'INPUT'
            && !!document.activeElement.closest('aside[aria-label="Obra seleccionada"]'), null, { timeout: 2000 }).then(() => true, () => false);
        log(`Obra nueva ~n1 en el panel (Nombre ${enfocado ? 'con el cursor' : 'SIN el cursor'}).`);
        if (!enfocado) throw new Error(`El panel de la obra nueva no dejó el cursor en Nombre (foco en: ${await page.evaluate(() => (document.activeElement?.outerHTML || "").slice(0, 160))})`);
        await nombreNueva.fill('Edificio E2E Nuevo');
        const puenteA2 = await aparece(sitio.locator('[data-ed-item="obras/~n1"]'));
        if (puenteA2) log('El puente pinta la obra nueva (obras/~n1).');
        else skipA2('el sitio no pintó obras/~n1');

        // 1b. La tarjeta «+ Nueva obra» del puente (solo con A2): crea ~n2, que se descarta (el guardado lleva solo ~n1).
        if (puenteA2) {
            const tarjeta = sitio.locator('[data-ed-lista]').getByText(/Nueva obra/).first();
            if (await aparece(tarjeta, 3000)) {
                await tarjeta.click();
                await panel.getByRole('heading', { name: 'Nueva obra' }).waitFor({ timeout: 5000 });
                log('La tarjeta «+ Nueva obra» del sitio crea una obra provisoria.');
                await panel.getByRole('button', { name: 'Descartar' }).click();
                await page.getByText('Obra nueva descartada.').waitFor({ timeout: 5000 });
            } else skipA2('no se encontró la tarjeta «+ Nueva obra» en el sitio');
        }

        // 2. Cambiar el estado de una obra que ya existe: la primera de «Obras en esta página» pasa a «En proyecto».
        // (Descartar ya la cerró; si no, se cierra la obra abierta.)
        const cerrar = panel.getByRole('button', { name: 'Cerrar la obra' });
        if (await cerrar.count()) await cerrar.click();
        const primera = panel.locator('ul li button').first();
        await primera.waitFor({ timeout: 5000 });
        const nombreObra = (await primera.innerText()).trim();
        const cambiada = OBRAS.find(o => o.json.nombre === nombreObra);
        if (!cambiada) throw new Error(`«${nombreObra}» no está en el borrador simulado`);
        const versionCambiada = cambiada.meta.updated_at;   // la API simulada la cambia al guardar
        await primera.click();
        const lugar = panel.locator('section[aria-label="Lugar en el sitio"]');
        await lugar.locator('select').selectOption('contratado');
        await lugar.getByText(/en Proyectos › En proyecto/).waitFor({ timeout: 5000 });
        log(`«${nombreObra}» pasó a «En proyecto» (queda última de su lista).`);

        // 3. ◀ «Mover antes»: queda antes de la nueva.
        await lugar.getByRole('button', { name: 'Mover antes' }).click();
        const contratadas = OBRAS.filter(o => o.json.estado === 'contratado').length;
        await lugar.getByText(new RegExp(`N\\.º ${contratadas + 1} de ${contratadas + 2}`)).waitFor({ timeout: 5000 });
        log('◀ «Mover antes» la deja antes de la nueva.');

        // 4. Guardar: nuevas + estado en cambios + orden con el slug provisorio.
        await page.getByRole('button', { name: /^Guardar \(\d+\)$/ }).click();
        await page.getByText('Guardar cambios', { exact: true }).waitFor({ timeout: 5000 });
        await page.locator('li', { hasText: 'Nueva obra' }).first().waitFor({ timeout: 5000 });
        await page.getByRole('button', { name: /^Guardar$/ }).click();
        await page.getByText('Guardar cambios', { exact: true }).waitFor({ state: 'detached', timeout: 5000 });
        if (guardados.length !== 2) throw new Error(`Se esperaban 2 POST /editor/guardar y hubo ${guardados.length}`);
        const a2 = guardados[1];
        const fallas = [];
        if (!(a2.nuevas?.length === 1 && a2.nuevas[0].tmp === '~n1' && a2.nuevas[0].cambios.nombre === 'Edificio E2E Nuevo' && a2.nuevas[0].cambios.estado === 'contratado')) {
            fallas.push('nuevas');
        }
        if (!a2.obras.some(o => o.id === cambiada.meta.id && o.cambios.estado === 'contratado' && o.updated_at === versionCambiada)) fallas.push('obras[].cambios.estado');
        const ordenContratado = (a2.orden || []).find(g => g.estado === 'contratado');
        if (!ordenContratado || JSON.stringify(ordenContratado.ids.slice(-2)) !== JSON.stringify([cambiada.meta.id, '~n1'])) fallas.push('orden');
        if (fallas.length) throw new Error(`Cuerpo del guardado A2 inesperado (${fallas.join(', ')}): ${JSON.stringify(a2)}`);
        log('POST A2:', JSON.stringify({ nuevas: a2.nuevas, obras: a2.obras, orden: a2.orden }));

        // 5. Después de guardar, el borrador nuevo trae la obra con su slug definitivo y FUERA del sitio (se crea así):
        //    el provisorio desaparece de la página y la obra queda en la bandeja «Fuera del sitio (1)».
        await page.getByRole('button', { name: /Fuera del sitio \(1\)/ }).waitFor({ timeout: 5000 });
        if (puenteA2) {
            const fin = Date.now() + 5000;
            while (await sitio.locator('[data-ed-item="obras/~n1"]:not([hidden])').count()) {
                if (Date.now() > fin) throw new Error('El puente siguió mostrando obras/~n1 después de guardar');
                await new Promise(r => setTimeout(r, 200));
            }
            log('El provisorio obras/~n1 ya no está en el sitio; la obra guardada queda en «Fuera del sitio (1)».');
        } else skipA2('el provisorio desaparece del sitio después de guardar');
        await panel.getByText(/N\.º \d+ de \d+ en Proyectos › En proyecto/).first().waitFor({ timeout: 5000 });
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
