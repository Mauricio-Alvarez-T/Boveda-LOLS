/**
 * Motor de documentos Word (plan Gestiones B2, decisión D-A).
 *
 * Un ".doc" es HTML con cabecera MS Office: Word lo abre como documento EDITABLE sin librerías
 * ni conversión. Este módulo es puro (sin DB): arma el HTML completo, el buffer del archivo
 * (UTF-8 con BOM para que Word respete acentos/ñ) y helpers de formato compartidos por todas las
 * plantillas de `plantillas/documentos/`. Portado de frontend/src/utils/downloadWord.ts y
 * ConstanciaModal.tsx (la generación ya NO ocurre en el navegador: así queda en la ficha, con
 * permiso real y trazabilidad).
 *
 * Imprimir = el mismo HTML servido SIN BOM por GET /documentos-laborales/:id/html (si llevara
 * BOM el iframe del navegador caería en quirks mode).
 */
const fs = require('fs');
const path = require('path');
const { cleanRut } = require('../utils/rut');

const LOGO_PATH = path.join(__dirname, '../../assets/logo-lols-wordmark.png');
/** Tamaño de impresión del wordmark (px CSS). El PNG es 450×198 = 3× para nitidez. */
const LOGO_W = 150;
const LOGO_H = 66;
const LOGO_TEXT_FALLBACK = '<div style="font-size:13pt;font-weight:bold;color:#029E4D">LOLS INGENIERÍA</div>';
const BOM = '﻿';

/**
 * Logo del EMPLEADOR que emite (2026-09-30). Emiten dos: LOLS Empresas de Ingeniería Ltda. y Miguel
 * Ángel Urrutia Aguilera (persona natural, "MAUA"); cada contrato lleva el suyo, igual que los
 * formatos en papel. Word no pinta SVG incrustado en un .doc HTML, así que se imprime un PNG 3×
 * pre-renderizado (nunca se rasteriza en runtime: sharp + fuentes del cPanel). La fuente vectorial
 * de MAUA vive al lado (`assets/logo-maua.svg`, trazada del logo oficial; el PNG sale de ahí).
 * Cualquier otra empresa cae en LOLS, que es lo que se imprimía hasta hoy.
 */
const LOGOS = Object.freeze({
    LOLS: { path: LOGO_PATH, w: LOGO_W, h: LOGO_H, alt: 'LOLS INGENIERIA', fallback: LOGO_TEXT_FALLBACK },
    // PNG 504×105 = 3× de 168×35: la proporción del wordmark (≈4,8:1) a lo ancho de la celda del
    // logo (28% de la caja A4 ≈ 169px), para no correr el título centrado.
    MAUA: {
        path: path.join(__dirname, '../../assets/logo-maua-wordmark.png'), w: 168, h: 35,
        alt: 'MIGUEL ANGEL URRUTIA AGUILERA',
        fallback: '<div style="font-size:11pt;font-weight:bold">MIGUEL ÁNGEL URRUTIA AGUILERA</div>',
    },
});
const RUT_MAUA = '75463529';

/**
 * Clave de LOGOS para una empresa ({ rut, razon_social }): MAUA por RUT o por el nombre completo del
 * empleador (así la identifica también el reporte de asistencia, y cubre un RUT mal tipeado en la BD).
 * El nombre completo, no un apellido suelto, para no capturar una sociedad relacionada.
 */
function logoDeEmpresa(empresa) {
    if (!empresa) return 'LOLS';
    if (cleanRut(empresa.rut || '') === RUT_MAUA) return 'MAUA';
    const razon = String(empresa.razon_social || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
    return /MIGUEL\s+ANGEL\s+URRUTIA\s+AGUILERA/.test(razon) ? 'MAUA' : 'LOLS';
}

const _logoCache = {};
/** data:image/png;base64,… del logo ('' si el asset no está). Se lee una vez por proceso. */
function logoDataUri(clave = 'LOLS') {
    const logo = LOGOS[clave] || LOGOS.LOLS;
    if (_logoCache[clave] === undefined) {
        try { _logoCache[clave] = `data:image/png;base64,${fs.readFileSync(logo.path).toString('base64')}`; }
        catch { _logoCache[clave] = ''; }
    }
    return _logoCache[clave];
}

/**
 * <img> del logo del empleador (`empresa` = { rut, razon_social }; sin empresa → LOLS).
 * `alto` (px) lo escala manteniendo la proporción — formatos densos como el ODI van más chicos.
 */
function logoHtml(empresa, { alto } = {}) {
    const clave = logoDeEmpresa(empresa);
    const logo = LOGOS[clave];
    const uri = logoDataUri(clave);
    const h = alto || logo.h;
    const w = alto ? Math.round(logo.w * (alto / logo.h)) : logo.w;
    return uri ? `<img src="${uri}" width="${w}" height="${h}" alt="${logo.alt}"/>` : logo.fallback;
}

function escapeHtml(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Valor o línea para completar a mano (los documentos se firman en papel). */
function oLinea(v, largo = 25) {
    const s = v == null ? '' : String(v).trim();
    return s ? escapeHtml(s) : '_'.repeat(largo);
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function _parse(iso) {
    if (!iso) return null;
    // Un Date se lee en hora LOCAL: mysql2 devuelve los DATETIME así y toISOString() correría el día
    // para todo lo registrado después de las 21:00 en Chile (UTC-3).
    const s = iso instanceof Date ? hoyYmd(iso) : String(iso).slice(0, 10);
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    return { y: Number(m[1]), mo: Number(m[2]), d: Number(m[3]) };
}

/** '2026-09-02' → '02 de septiembre de 2026' ('' si no hay fecha). */
function fechaLarga(iso) {
    const p = _parse(iso);
    return p ? `${String(p.d).padStart(2, '0')} de ${MESES[p.mo - 1]} de ${p.y}` : '';
}

/** '2026-09-02' → '02/09/2026' (o línea para completar). */
function fechaCorta(iso) {
    const p = _parse(iso);
    return p ? `${String(p.d).padStart(2, '0')}/${String(p.mo).padStart(2, '0')}/${p.y}` : '___/___/______';
}

/** 553553 → '$553.553'. */
function fmtCLP(n) {
    const v = Math.trunc(Number(n) || 0);
    return `$${v.toLocaleString('es-CL').replace(/ /g, '.')}`;
}

/** Hoy en YYYY-MM-DD (hora local del servidor). */
function hoyYmd(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Página propia de una plantilla (opcional). Sin ella el documento es A4, márgenes de 2,5 cm y Times 12.
 * Con ella Word recibe además una SECCIÓN con nombre (`@page WordSection1` + `div.WordSection1`): es la
 * forma en que Word lee tamaño de papel y márgenes de un .doc HTML; el `@page` genérico es para el
 * navegador (imprimir desde Bóveda). Se usa cuando el formato en papel ocupa una hoja exacta (ODI).
 *   { papel: '21.59cm 27.94cm', margen: '0.5cm 1.5cm 0.4cm 1.5cm', fuente: "Tahoma, sans-serif",
 *     tamano: '9pt', interlineado: 1.15 }
 */
const PAPEL_CARTA = '21.59cm 27.94cm';

/** Documento completo listo para Word/impresora. `body` es el HTML interno de la plantilla. */
function wrapHtml(titulo, body, pagina) {
    const pg = pagina || null;
    const pageCss = pg
        ? `@page { size: ${pg.papel}; margin: ${pg.margen}; }` +
          `@page WordSection1 { size: ${pg.papel}; margin: ${pg.margen}; mso-header-margin: 0; mso-footer-margin: 0; mso-paper-source: 0; }` +
          'div.WordSection1 { page: WordSection1; }'
        : '@page { size: A4; margin: 2.5cm; }';
    const bodyCss = pg
        ? `body { font-family: ${pg.fuente}; font-size: ${pg.tamano}; color: #000; line-height: ${pg.interlineado}; }`
        : "body { font-family: 'Times New Roman', serif; font-size: 12pt; color: #000; line-height: 1.5; }";
    return (
        '<!DOCTYPE html>' +
        '<html xmlns:o="urn:schemas-microsoft-com:office:office" ' +
        'xmlns:w="urn:schemas-microsoft-com:office:word" ' +
        'xmlns="http://www.w3.org/TR/REC-html40">' +
        `<head><meta charset="utf-8"><title>${escapeHtml(titulo)}</title>` +
        '<style>' +
        pageCss +
        bodyCss +
        'h1 { font-size: 14pt; text-align: center; text-transform: uppercase; margin: 0 0 4pt; }' +
        'h2 { font-size: 12pt; text-align: center; font-weight: bold; margin: 0 0 16pt; }' +
        'p { margin: 0 0 10pt; text-align: justify; }' +
        'ul { margin: 0 0 10pt 18pt; padding: 0; } li { margin: 0 0 4pt; text-align: justify; }' +
        'table { border-collapse: collapse; } td { vertical-align: top; }' +
        '.grid td, .grid th { border: 1px solid #000; padding: 3pt 5pt; font-size: 10pt; }' +
        '.firmas td { text-align: center; }' +
        '.salto { page-break-before: always; }' +
        `</style></head><body>${pg ? `<div class="WordSection1">${body}</div>` : body}</body></html>`
    );
}

/**
 * Encabezado estándar: logo del empleador a la izquierda, título centrado (y fecha opcional).
 * `empresa` decide el logo (ver logoDeEmpresa); sin ella se imprime el de LOLS.
 */
function encabezado(titulo, { fecha, subtitulo, empresa } = {}) {
    return (
        '<table width="100%"><tr>' +
        `<td width="28%" style="vertical-align:top">${logoHtml(empresa)}</td>` +
        '<td width="44%" style="text-align:center;vertical-align:top">' +
        '<div style="margin-top:20pt">' +
        `<div style="font-size:14pt;font-weight:bold">${escapeHtml(titulo)}</div>` +
        (subtitulo ? `<div style="font-size:11pt;font-weight:bold;margin-top:2pt">${escapeHtml(subtitulo)}</div>` : '') +
        (fecha ? `<div style="margin-top:6pt">Fecha: ${escapeHtml(fechaCorta(fecha))}</div>` : '') +
        '</div></td>' +
        '<td width="28%"></td>' +
        '</tr></table>'
    );
}

/**
 * Bloque de firmas a dos columnas. Cada lado: { titulo, lineas: string[] }.
 * Ej.: bloqueFirmas({titulo:'EMPLEADOR', lineas:['LOLS INGENIERIA LTDA.','RUT: 77.085.560-8']}, {…}).
 */
function bloqueFirmas(izq, der, { margenTop = 60 } = {}) {
    const lado = (l) => l
        ? `<div style="border-top:1px solid #000;padding-top:4pt"><b>${escapeHtml(l.titulo)}</b>` +
          (l.lineas || []).map(x => `<br/>${escapeHtml(x)}`).join('') + '</div>'
        : '';
    return (
        `<table width="100%" class="firmas" style="margin-top:${margenTop}pt"><tr>` +
        `<td width="42%">${lado(izq)}</td><td width="16%"></td><td width="42%">${lado(der)}</td>` +
        '</tr></table>'
    );
}

/** Firma simple centrada del trabajador (nombre, RUT, lugar y fecha) — formato de los anexos del kit. */
function firmaTrabajador(nombre, rut, fechaIso, { conHuella = false } = {}) {
    return (
        '<table width="100%" style="margin-top:50pt"><tr>' +
        `<td width="55%"><b>NOMBRE DEL TRABAJADOR</b><br/><br/>${escapeHtml(nombre)}<br/>RUT ${escapeHtml(rut || '')}</td>` +
        '<td width="45%" style="text-align:center"><div style="margin-top:28pt;border-top:1px solid #000;padding-top:4pt"><b>FIRMA</b>' +
        (conHuella ? '<br/><span style="font-size:10pt">Huella</span>' : '') + '</div></td>' +
        '</tr></table>' +
        `<p style="margin-top:14pt">En Santiago, ${escapeHtml(fechaLarga(fechaIso))}</p>`
    );
}

/** Buffer del archivo .doc (UTF-8 con BOM). */
function toDocBuffer(htmlCompleto) {
    return Buffer.from(BOM + htmlCompleto, 'utf8');
}

/** HTML sin BOM (para imprimir en un iframe). */
function sinBom(s) {
    return String(s).replace(/^﻿/, '');
}

/**
 * Quita el punto final de una razón social ("LOLS … Ltda." → "LOLS … Ltda") para que las frases que
 * agregan el suyo no impriman "LTDA..". Los nombres de empresa en la BD vienen con y sin punto.
 */
function sinPuntoFinal(s) {
    return String(s ?? '').trim().replace(/\.+$/, '');
}

/** 'Pérez Soto' → 'Perez_Soto' (nombres de archivo). */
function slug(s) {
    return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

/** Marca de tiempo compacta para nombres de archivo: 20260911-154233. */
function stamp(d = new Date()) {
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

module.exports = {
    LOGO_W, LOGO_H, LOGO_PATH, LOGOS,
    logoDataUri, logoHtml, logoDeEmpresa, escapeHtml, oLinea, sinPuntoFinal,
    fechaLarga, fechaCorta, fmtCLP, hoyYmd,
    wrapHtml, PAPEL_CARTA, encabezado, bloqueFirmas, firmaTrabajador,
    toDocBuffer, sinBom, slug, stamp,
};
