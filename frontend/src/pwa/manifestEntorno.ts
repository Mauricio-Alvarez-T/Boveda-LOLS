/**
 * La app instalada de test.boveda.lols.cl se ve distinta de la de producción (2026-10-27).
 *
 * El dueño tiene las dos instaladas en el teléfono y las distinguía por casualidad (la de test había
 * quedado con un ícono blanco de un manifest viejo, que Chrome iba a reemplazar por el verde en su
 * próxima revisión). Ahora es a propósito: en el build de staging (`VITE_ENTORNO=staging`, lo pone el
 * workflow) el plugin `manifestPorEntorno` de vite.config.ts reescribe `manifest.json` e `index.html`
 * con esto: nombre «Bóveda TEST», íconos naranjas (el color de la franja «Entorno de pruebas») y barra
 * de estado naranja. En producción no cambia nada y los íconos de test ni siquiera se publican.
 *
 * Puro (sin DOM ni fs): lo importa vite.config.ts y lo prueba jest.
 */

export const NARANJO_TEST = '#F59E0B';   // amber-500, el de EntornoBanner
export const NOMBRE_TEST = 'Bóveda TEST';

export interface IconoManifest { src: string; sizes: string; type: string; purpose?: string }
export interface Manifest {
    name: string;
    short_name: string;
    description?: string;
    theme_color: string;
    icons: IconoManifest[];
    [k: string]: unknown;
}

export const esStaging = (entorno: string | undefined) => entorno === 'staging';

/** '/icon-192.png' → '/icon-test-192.png'; '/apple-touch-icon.png' → '/apple-touch-icon-test.png'. */
export function rutaIconoTest(src: string): string {
    return src.replace(/^\/(icon|apple-touch-icon)(?=[-.])/, '/$1-test');
}

/** ¿Este archivo de `public/` es un ícono de test? (en producción se borran del build). */
export const esIconoTest = (archivo: string) => /^(icon-test-|apple-touch-icon-test\.)/.test(archivo);

/** Manifest de staging: mismo manifest con nombre, color e íconos de test. Los SVG se descartan (son verdes). */
export function manifestDeStaging(base: Manifest): Manifest {
    return {
        ...base,
        name: NOMBRE_TEST,
        short_name: NOMBRE_TEST,
        description: `Entorno de pruebas (datos ficticios). ${base.description ?? ''}`.trim(),
        theme_color: NARANJO_TEST,
        icons: base.icons
            .filter(i => i.type === 'image/png')
            .map(i => ({ ...i, src: rutaIconoTest(i.src) })),
    };
}

/** index.html de staging: ícono de iPhone, color de la barra y nombre en la pantalla de inicio. */
export function htmlDeStaging(html: string): string {
    return html
        .replace(/(<link rel="apple-touch-icon" href=")\/apple-touch-icon\.png(")/, '$1/apple-touch-icon-test.png$2')
        .replace(/(<meta name="theme-color" content=")#[0-9A-Fa-f]{6}(")/, `$1${NARANJO_TEST}$2`)
        .replace(/(<meta name="apple-mobile-web-app-title" content=")[^"]*(")/, `$1${NOMBRE_TEST}$2`);
}
