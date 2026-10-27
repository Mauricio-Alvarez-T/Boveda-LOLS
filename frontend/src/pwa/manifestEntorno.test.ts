import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import {
    esIconoTest, esStaging, htmlDeStaging, manifestDeStaging, NARANJO_TEST, NOMBRE_TEST, rutaIconoTest, type Manifest,
} from './manifestEntorno';

const PUBLIC = join(__dirname, '..', '..', 'public');
const manifest = JSON.parse(readFileSync(join(PUBLIC, 'manifest.json'), 'utf8')) as Manifest;
const indexHtml = readFileSync(join(__dirname, '..', '..', 'index.html'), 'utf8');

describe('app de staging distinta de la de producción (ícono naranjo, «Bóveda TEST»)', () => {
    it('solo el build de staging cambia', () => {
        expect(esStaging('staging')).toBe(true);
        expect(esStaging(undefined)).toBe(false);
        expect(esStaging('production')).toBe(false);
    });

    it('rutas de íconos de test', () => {
        expect(rutaIconoTest('/icon-192.png')).toBe('/icon-test-192.png');
        expect(rutaIconoTest('/icon-maskable-512.png')).toBe('/icon-test-maskable-512.png');
        expect(rutaIconoTest('/apple-touch-icon.png')).toBe('/apple-touch-icon-test.png');
        expect(esIconoTest('icon-test-maskable-192.png')).toBe(true);
        expect(esIconoTest('apple-touch-icon-test.png')).toBe(true);
        expect(esIconoTest('icon-192.png')).toBe(false);
        expect(esIconoTest('apple-touch-icon.png')).toBe(false);
    });

    it('manifest de staging: nombre, color naranjo y solo PNG de test que EXISTEN en public/', () => {
        const m = manifestDeStaging(manifest);
        expect(m).toMatchObject({ name: NOMBRE_TEST, short_name: NOMBRE_TEST, theme_color: NARANJO_TEST, id: '/', display: 'standalone' });
        expect(m.short_name.length).toBeLessThanOrEqual(12);   // lo que cabe bajo el ícono sin cortarse
        expect(m.description).toMatch(/^Entorno de pruebas/);
        expect(m.icons.every(i => i.type === 'image/png' && /-test-/.test(i.src))).toBe(true);
        expect(m.icons.map(i => i.purpose).sort()).toEqual(['any', 'any', 'maskable', 'maskable']);
        for (const i of m.icons) expect({ src: i.src, existe: existsSync(join(PUBLIC, i.src.slice(1))) }).toEqual({ src: i.src, existe: true });
        // El de producción queda intacto.
        expect(manifest.name).toBe('Bóveda LOLS');
        expect(manifest.theme_color).toBe('#029E4D');
    });

    it('index.html de staging: ícono de iPhone, barra naranja y nombre (y el original no se toca)', () => {
        const h = htmlDeStaging(indexHtml);
        expect(h).toContain('<link rel="apple-touch-icon" href="/apple-touch-icon-test.png">');
        expect(h).toContain(`<meta name="theme-color" content="${NARANJO_TEST}">`);
        expect(h).toContain(`<meta name="apple-mobile-web-app-title" content="${NOMBRE_TEST}">`);
        expect(existsSync(join(PUBLIC, 'apple-touch-icon-test.png'))).toBe(true);
        // Si alguien cambia esas tres etiquetas en index.html, el reemplazo dejaría de aplicar en silencio.
        expect(h).not.toBe(indexHtml);
        expect(indexHtml).toContain('<meta name="theme-color" content="#029E4D">');
    });
});
