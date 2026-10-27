#!/usr/bin/env node
/**
 * Genera los íconos de la app instalable (PWA) desde vectores (2026-10-27).
 *
 *   node scripts/generar-iconos-pwa.js
 *
 * Antes había un solo PNG de 1024×1024 copiado tres veces (icon-192, icon-512 y apple-touch-icon), con
 * un borde blanco y ruido de imagen, declarado solo como "maskable". En Android, Chrome necesita PNG
 * con purpose "any" y tamaños reales para instalar Bóveda como app (WebAPK); si no puede, deja un
 * acceso directo que abre con la barra de Chrome arriba (título + dirección + ⋮).
 *
 * Salen de acá (frontend/public/):
 *   icon-192.png, icon-512.png           purpose "any": cuadrado verde redondeado, fondo transparente
 *   icon-maskable-192/512.png            purpose "maskable": verde a sangre, logo dentro de la zona segura
 *                                        (círculo del 80%), para que ningún launcher lo recorte
 *   apple-touch-icon.png (180)           iOS: verde a sangre, sin transparencia (iOS redondea solo)
 *   *-test*.png                          los mismos cinco en NARANJO para el build de staging
 *
 * El dibujo es el mismo de favicon.svg: tarjeta blanca con el glifo verde de Bóveda.
 * Usa el sharp del backend (no hace falta instalar nada en el frontend).
 */
const path = require('path');
const sharp = require(path.join(__dirname, '../backend/node_modules/sharp'));

const VERDE = '#029E4D';
/** Naranja de la franja «Entorno de pruebas» (amber-500): la app de test.boveda.lols.cl se distingue a simple vista. */
const NARANJO = '#F59E0B';
const OUT = path.join(__dirname, '../frontend/public');

/** Glifo de favicon.svg (viewBox 220×240), en el color pedido. */
const glifo = (color) => `
    <rect x="20" y="20" width="180" height="12" fill="${color}"/>
    <rect x="20" y="208" width="180" height="12" fill="${color}"/>
    <rect x="20" y="48" width="75" height="144" fill="${color}"/>
    <rect x="119" y="52" width="77" height="32" fill="none" stroke="${color}" stroke-width="8"/>
    <rect x="119" y="104" width="77" height="32" fill="none" stroke="${color}" stroke-width="8"/>
    <rect x="115" y="152" width="85" height="40" fill="${color}"/>`;

/**
 * Ícono de S×S: fondo verde (redondeado o a sangre) y tarjeta blanca centrada de ancho `tarjeta`·S
 * con el glifo verde adentro.
 */
function svgIcono(S, { tarjeta, radioFondo, color = VERDE }) {
    const tw = S * tarjeta;
    const th = tw * (240 / 220);            // misma proporción que el glifo
    const tx = (S - tw) / 2, ty = (S - th) / 2;
    const pad = tw * 0.1;
    const fondo = radioFondo == null
        ? `<rect width="${S}" height="${S}" fill="${color}"/>`
        : `<rect width="${S}" height="${S}" rx="${S * radioFondo}" fill="${color}"/>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
  ${fondo}
  <rect x="${tx}" y="${ty}" width="${tw}" height="${th}" rx="${tw * 0.06}" fill="#fff"/>
  <svg x="${tx + pad}" y="${ty + pad}" width="${tw - 2 * pad}" height="${th - 2 * pad}" viewBox="0 0 220 240">${glifo(color)}</svg>
</svg>`;
}

const ICONOS = [
    // purpose any: el launcher lo muestra tal cual → cuadrado redondeado, tarjeta grande.
    { archivo: 'icon-192.png', S: 192, tarjeta: 0.5, radioFondo: 0.22 },
    { archivo: 'icon-512.png', S: 512, tarjeta: 0.5, radioFondo: 0.22 },
    // purpose maskable: el launcher recorta (círculo, gota, cuadrado…). Zona segura = círculo de radio
    // 0.4·S: la tarjeta (0.4·S de ancho → semidiagonal ≈ 0.30·S) cabe holgada.
    { archivo: 'icon-maskable-192.png', S: 192, tarjeta: 0.4 },
    { archivo: 'icon-maskable-512.png', S: 512, tarjeta: 0.4 },
    // iOS: sin transparencia (la pinta negra) y redondea él mismo.
    { archivo: 'apple-touch-icon.png', S: 180, tarjeta: 0.46, plano: true },
];
// Mismos cinco en naranja para staging (2026-10-27): el dueño tiene las dos apps instaladas y las distingue
// por el color. Los usa el plugin `manifestPorEntorno` de vite.config.ts solo en el build de staging.
for (const i of [...ICONOS]) ICONOS.push({ ...i, archivo: i.archivo.replace(/^(icon|apple-touch-icon)/, '$1-test'), color: NARANJO });

(async () => {
    for (const i of ICONOS) {
        let img = sharp(Buffer.from(svgIcono(i.S, i)));
        if (i.plano) img = img.flatten({ background: i.color || VERDE });
        await img.png({ compressionLevel: 9 }).toFile(path.join(OUT, i.archivo));
        const m = await sharp(path.join(OUT, i.archivo)).metadata();
        console.log(`${i.archivo.padEnd(24)} ${m.width}×${m.height}${m.hasAlpha ? ' (con transparencia)' : ''}`);
    }
})().catch((e) => { console.error(e); process.exit(1); });
