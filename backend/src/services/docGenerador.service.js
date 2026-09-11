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

const LOGO_PATH = path.join(__dirname, '../../assets/logo-lols-wordmark.png');
/** Tamaño de impresión del wordmark (px CSS). El PNG es 450×198 = 3× para nitidez. */
const LOGO_W = 150;
const LOGO_H = 66;
const LOGO_TEXT_FALLBACK = '<div style="font-size:13pt;font-weight:bold;color:#029E4D">LOLS INGENIERÍA</div>';
const BOM = '﻿';

let _logoCache;
/** data:image/png;base64,… del wordmark ('' si el asset no está). Se lee una vez por proceso. */
function logoDataUri() {
    if (_logoCache === undefined) {
        try { _logoCache = `data:image/png;base64,${fs.readFileSync(LOGO_PATH).toString('base64')}`; }
        catch { _logoCache = ''; }
    }
    return _logoCache;
}

function logoHtml() {
    const uri = logoDataUri();
    return uri ? `<img src="${uri}" width="${LOGO_W}" height="${LOGO_H}" alt="LOLS INGENIERIA"/>` : LOGO_TEXT_FALLBACK;
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
    const s = iso instanceof Date ? iso.toISOString().slice(0, 10) : String(iso).slice(0, 10);
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

/** Documento completo listo para Word/impresora. `body` es el HTML interno de la plantilla. */
function wrapHtml(titulo, body) {
    return (
        '<!DOCTYPE html>' +
        '<html xmlns:o="urn:schemas-microsoft-com:office:office" ' +
        'xmlns:w="urn:schemas-microsoft-com:office:word" ' +
        'xmlns="http://www.w3.org/TR/REC-html40">' +
        `<head><meta charset="utf-8"><title>${escapeHtml(titulo)}</title>` +
        '<style>' +
        '@page { size: A4; margin: 2.5cm; }' +
        "body { font-family: 'Times New Roman', serif; font-size: 12pt; color: #000; line-height: 1.5; }" +
        'h1 { font-size: 14pt; text-align: center; text-transform: uppercase; margin: 0 0 4pt; }' +
        'h2 { font-size: 12pt; text-align: center; font-weight: bold; margin: 0 0 16pt; }' +
        'p { margin: 0 0 10pt; text-align: justify; }' +
        'ul { margin: 0 0 10pt 18pt; padding: 0; } li { margin: 0 0 4pt; text-align: justify; }' +
        'table { border-collapse: collapse; } td { vertical-align: top; }' +
        '.grid td, .grid th { border: 1px solid #000; padding: 3pt 5pt; font-size: 10pt; }' +
        '.firmas td { text-align: center; }' +
        '.salto { page-break-before: always; }' +
        `</style></head><body>${body}</body></html>`
    );
}

/** Encabezado estándar: logo a la izquierda, título centrado (y fecha opcional). */
function encabezado(titulo, { fecha, subtitulo } = {}) {
    return (
        '<table width="100%"><tr>' +
        `<td width="28%" style="vertical-align:top">${logoHtml()}</td>` +
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
    LOGO_W, LOGO_H, LOGO_PATH,
    logoDataUri, logoHtml, escapeHtml, oLinea, sinPuntoFinal,
    fechaLarga, fechaCorta, fmtCLP, hoyYmd,
    wrapHtml, encabezado, bloqueFirmas, firmaTrabajador,
    toDocBuffer, sinBom, slug, stamp,
};
