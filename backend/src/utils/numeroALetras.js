/**
 * Números enteros → letras en español (Chile), para montos impresos en contratos y finiquitos.
 *   numeroALetras(553553)            → 'quinientos cincuenta y tres mil quinientos cincuenta y tres'
 *   montoEnLetras(553553)            → 'quinientos cincuenta y tres mil quinientos cincuenta y tres pesos'
 *   montoEnLetras(1000000)           → 'un millón de pesos'
 * Puro, sin dependencias. Solo enteros no negativos hasta 999.999.999.999 (suficiente para CLP).
 */
const UNIDADES = ['', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez',
    'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte',
    'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve'];
const DECENAS = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
const CENTENAS = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];

function menorQueMil(n, { apocopar = false } = {}) {
    if (n === 0) return '';
    if (n === 100) return 'cien';
    const c = Math.floor(n / 100), resto = n % 100;
    const partes = [];
    if (c) partes.push(CENTENAS[c]);
    if (resto) {
        if (resto < 30) {
            // "un" en vez de "uno" antes de "mil"/"millón" (veintiún mil, un millón).
            let u = UNIDADES[resto];
            if (apocopar && resto === 1) u = 'un';
            if (apocopar && resto === 21) u = 'veintiún';
            partes.push(u);
        } else {
            const d = Math.floor(resto / 10), u = resto % 10;
            let s = DECENAS[d];
            if (u) s += ` y ${apocopar && u === 1 ? 'un' : UNIDADES[u]}`;
            partes.push(s);
        }
    }
    return partes.join(' ');
}

function numeroALetras(valor) {
    const n = Math.trunc(Math.abs(Number(valor) || 0));
    if (n === 0) return 'cero';
    if (n >= 1e12) throw new Error('numeroALetras: valor fuera de rango');

    const millones = Math.floor(n / 1e6);
    const miles = Math.floor((n % 1e6) / 1000);
    const unidades = n % 1000;
    const partes = [];

    if (millones) {
        if (millones === 1) partes.push('un millón');
        else partes.push(`${numeroALetras(millones).replace(/\buno$/, 'un')} millones`);
    }
    if (miles) {
        if (miles === 1) partes.push('mil');
        else partes.push(`${menorQueMil(miles, { apocopar: true })} mil`);
    }
    if (unidades) partes.push(menorQueMil(unidades));

    return partes.join(' ').replace(/\s+/g, ' ').trim();
}

/** "quinientos … pesos" / "un millón de pesos" / "un peso". */
function montoEnLetras(valor, moneda = 'pesos') {
    const n = Math.trunc(Math.abs(Number(valor) || 0));
    const letras = numeroALetras(n);
    if (n === 1) return 'un peso';
    // Millones exactos llevan "de": "dos millones de pesos"; con resto no: "dos millones cien mil pesos".
    if (n >= 1e6 && n % 1e6 === 0) return `${letras} de ${moneda}`;
    return `${letras} ${moneda}`;
}

/** Primera letra en mayúscula (para "(Quinientos … pesos)"). */
function capitalizar(s) {
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

module.exports = { numeroALetras, montoEnLetras, capitalizar };
