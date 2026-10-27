import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * El manifest de la app instalable (2026-10-27). En Android, Bóveda abría con la barra de Chrome arriba
 * (título + dirección + ⋮) porque Chrome no podía instalarla como app: los dos PNG eran el mismo archivo
 * de 1024 px declarados como 192 y 512, y solo "maskable". Se regeneran con scripts/generar-iconos-pwa.js.
 */
const PUBLIC = join(__dirname, '..', '..', 'public');
const manifest = JSON.parse(readFileSync(join(PUBLIC, 'manifest.json'), 'utf8')) as {
    id: string; scope: string; start_url: string; display: string; theme_color: string;
    icons: { src: string; sizes: string; type: string; purpose: string }[];
};

/** Ancho y alto reales de un PNG (cabecera IHDR, bytes 16-23). */
const medidaPng = (src: string) => {
    const b = readFileSync(join(PUBLIC, src.replace(/^\//, '')));
    expect(b.subarray(1, 4).toString('latin1')).toBe('PNG');
    return `${b.readUInt32BE(16)}x${b.readUInt32BE(20)}`;
};

describe('manifest.json (app instalable)', () => {
    it('abre a pantalla completa, con id y scope (Chrome la reconoce como la misma app)', () => {
        expect(manifest).toMatchObject({ id: '/', scope: '/', start_url: '/', display: 'standalone', theme_color: '#029E4D' });
    });

    it('cada PNG mide lo que declara (antes eran el mismo archivo de 1024 px)', () => {
        const pngs = manifest.icons.filter(i => i.type === 'image/png');
        expect(pngs.length).toBeGreaterThanOrEqual(4);
        for (const i of pngs) expect({ src: i.src, medida: medidaPng(i.src) }).toEqual({ src: i.src, medida: i.sizes });
    });

    it('trae PNG "any" Y "maskable" de 192 y 512 (Android necesita PNG "any" para instalarla)', () => {
        for (const purpose of ['any', 'maskable']) {
            const tam = manifest.icons.filter(i => i.type === 'image/png' && i.purpose === purpose).map(i => i.sizes).sort();
            expect({ purpose, tam }).toEqual({ purpose, tam: ['192x192', '512x512'] });
        }
    });

    it('apple-touch-icon de 180 px y el ícono de notificaciones existe con su tamaño', () => {
        expect(medidaPng('/apple-touch-icon.png')).toBe('180x180');
        expect(medidaPng('/icon-192.png')).toBe('192x192');
    });

    it('favicon.svg usa atributos SVG (stroke-width), no props de React (strokeWidth se ignoraba)', () => {
        const svg = readFileSync(join(PUBLIC, 'favicon.svg'), 'utf8');
        expect(svg).not.toMatch(/strokeWidth/);
        expect(svg).toMatch(/stroke-width="8"/);
    });
});
