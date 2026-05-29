#!/usr/bin/env node
/**
 * Genera los PNG del logo LOLS para usar en correos (CID embed).
 *
 * Fuente canónica: frontend/src/components/ui/Logo.tsx (SVG paramétrico).
 * El correo no puede usar SVG (Gmail/Outlook lo eliminan) → rasterizamos a PNG.
 *
 * Solo el ÍCONO geométrico (las barras) es independiente de la fuente, así que
 * lo rasterizamos; el texto "LOLS Ingeniería" se escribe como HTML en el correo
 * (nítido en cualquier resolución y sin depender de fuentes en el server).
 *
 * Genera:
 *   assets/logo-lols-white.png  — ícono blanco (para header verde)
 *   assets/logo-lols-green.png  — ícono verde  (para fondos claros)
 *
 * USO:  node scripts/generate_logo_assets.js
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const GREEN = '#029E4D';
const OUT_DIR = path.join(__dirname, '..', 'assets');

/** SVG del ícono LOLS (viewBox 0 0 220 240), parametrizado por color. */
function iconSvg(color) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 240" width="220" height="240">
  <g fill="${color}">
    <rect x="20" y="20" width="180" height="12"/>
    <rect x="20" y="208" width="180" height="12"/>
    <rect x="20" y="48" width="75" height="144"/>
    <rect x="119" y="52" width="77" height="32" fill="none" stroke="${color}" stroke-width="8"/>
    <rect x="119" y="104" width="77" height="32" fill="none" stroke="${color}" stroke-width="8"/>
    <rect x="115" y="152" width="85" height="40"/>
  </g>
</svg>`;
}

async function render(color, file) {
    // Rasterizamos a 3x (alto 360px) para nitidez en pantallas retina; el correo
    // lo muestra a ~46px de alto.
    const png = await sharp(Buffer.from(iconSvg(color)))
        .resize({ height: 360 })
        .png()
        .toBuffer();
    const out = path.join(OUT_DIR, file);
    fs.writeFileSync(out, png);
    console.log(`✅ ${file} (${png.length} bytes)`);
}

async function main() {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    await render('#ffffff', 'logo-lols-white.png');
    await render(GREEN, 'logo-lols-green.png');
    console.log(`📁 ${OUT_DIR}`);
}

main().catch((err) => {
    console.error('❌ Error generando logos:', err.message);
    process.exit(1);
});
