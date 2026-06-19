/**
 * Resumen diario de Novedades — orquesta: lee `logs_actividad` del día previo →
 * agrupa por categoría (según `avisos_reglas` activas + umbral) → arma HTML →
 * (envía por email | dry-run). Compartido por el script de cron
 * (`scripts/avisos_diarios.js`) y el endpoint "enviar prueba" del API.
 *
 * NO crea ni cierra conexiones: recibe `db` inyectado. Reutiliza
 * `emailService.sendSystemEmail` (mismo canal que el reporte semanal).
 *
 * Fuente de datos: tabla `logs_actividad` (mig 011), que el middleware global
 * `activityLogger` ya llena con cada alta/cambio/baja. No instrumenta nada nuevo.
 */
const emailService = require('./email.service');
const logger = require('../utils/logger-structured');

// Map categoría → cómo se consulta en logs_actividad. La parte configurable
// (activo / umbral / etiqueta) vive en la tabla `avisos_reglas`; esto es la
// lógica de consulta que no puede vivir en la BD.
//   modulos: valores de `logs_actividad.modulo` que cuentan para la categoría.
//   accion:  filtro de acción (null = cualquiera).
const QUERY_MAP = {
    trabajadores:   { modulos: ['trabajadores'],     accion: 'CREATE' },
    inventario:     { modulos: ['items-inventario'], accion: 'CREATE' },
    vehiculos:      { modulos: ['vehiculos'],         accion: 'CREATE' },
    obras:          { modulos: ['obras'],             accion: 'CREATE' },
    // Eventos sensibles: logueados explícitamente bajo modulo='roles'
    // (ver usuarios.routes.js → cambios de permisos / overrides).
    roles_permisos: { modulos: ['roles'],             accion: null },
};

const MUESTRAS_MAX = 8; // cuántos ejemplos listar por categoría en el correo
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function pad2(n) { return String(n).padStart(2, '0'); }
function ymd(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }

/**
 * Ventana del resumen = el DÍA PREVIO completo respecto de `ref` (o de hoy).
 * Devuelve { desde, hasta, label } con `desde` inclusive y `hasta` exclusivo.
 * @param {string} [ref] 'YYYY-MM-DD' usado como "hoy" (la ventana será su día anterior).
 */
function getDiaPrevio(ref) {
    const hoy = ref ? new Date(`${ref}T00:00:00`) : new Date();
    const inicioHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
    const inicioAyer = new Date(inicioHoy);
    inicioAyer.setDate(inicioAyer.getDate() - 1);
    const d = inicioAyer;
    return {
        desde: `${ymd(inicioAyer)} 00:00:00`,
        hasta: `${ymd(inicioHoy)} 00:00:00`,
        label: `${pad2(d.getDate())} ${MESES[d.getMonth()]} ${d.getFullYear()}`,
    };
}

function esc(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Construye el resumen del día: por cada categoría activa cuyo conteo ≥ umbral,
 * devuelve el conteo y hasta MUESTRAS_MAX ejemplos (entidad + usuario que la hizo).
 * @returns {Promise<{rango, categorias: Array<{key,etiqueta,count,muestras}>, total: number}>}
 */
async function construirResumen(db, rango) {
    let reglas;
    try {
        const [rows] = await db.query('SELECT categoria, etiqueta, umbral FROM avisos_reglas WHERE activo = 1 ORDER BY orden ASC, id ASC');
        reglas = rows;
    } catch (err) {
        if (err && err.errno === 1146) { // tabla aún no existe
            logger.warn('Tabla avisos_reglas no existe todavía — resumen vacío.');
            return { rango, categorias: [], total: 0 };
        }
        throw err;
    }

    const categorias = [];
    let total = 0;

    for (const regla of reglas) {
        const map = QUERY_MAP[regla.categoria];
        if (!map) continue; // categoría sin lógica de consulta definida

        const where = ['l.created_at >= ?', 'l.created_at < ?', `l.modulo IN (${map.modulos.map(() => '?').join(',')})`];
        const params = [rango.desde, rango.hasta, ...map.modulos];
        if (map.accion) { where.push('l.accion = ?'); params.push(map.accion); }

        const [eventos] = await db.query(
            `SELECT l.entidad_label, l.accion, u.nombre AS usuario, l.created_at
             FROM logs_actividad l
             LEFT JOIN usuarios u ON u.id = l.usuario_id
             WHERE ${where.join(' AND ')}
             ORDER BY l.created_at ASC`,
            params
        );

        const count = eventos.length;
        if (count < (regla.umbral || 1)) continue; // no cruza el umbral → no se incluye

        categorias.push({
            key: regla.categoria,
            etiqueta: regla.etiqueta,
            count,
            muestras: eventos.slice(0, MUESTRAS_MAX).map(e => ({
                label: e.entidad_label || '—',
                usuario: e.usuario || 'Sistema',
            })),
        });
        total += count;
    }

    return { rango, categorias, total };
}

function renderHtml({ rango, categorias, total }) {
    const secciones = categorias.map(c => {
        const filas = c.muestras.map(m => `
            <tr>
              <td style="padding:6px 12px;font-size:13px;color:#111827;border-bottom:1px solid #f1f5f9">${esc(m.label)}</td>
              <td style="padding:6px 12px;font-size:12px;color:#6b7280;border-bottom:1px solid #f1f5f9;white-space:nowrap">${esc(m.usuario)}</td>
            </tr>`).join('');
        const extra = c.count > c.muestras.length
            ? `<p style="margin:6px 0 0;font-size:12px;color:#9ca3af">…y ${c.count - c.muestras.length} más</p>` : '';
        return `
        <tr><td style="padding:16px 28px 0">
          <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden">
            <div style="padding:10px 12px;background:#ecfdf5;border-bottom:1px solid #e5e7eb">
              <span style="font-size:14px;font-weight:800;color:#065f46">${esc(c.etiqueta)}</span>
              <span style="float:right;font-size:13px;font-weight:800;color:#065f46">${c.count}</span>
            </div>
            <table width="100%" cellpadding="0" cellspacing="0">${filas}</table>
            ${extra}
          </div>
        </td></tr>`;
    }).join('');

    return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:Arial,Helvetica,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8;padding:24px 16px"><tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.10)">
      <tr><td style="background:#1a7a3f;padding:24px 28px;text-align:center">
        <p style="margin:0 0 6px;font-size:11px;color:#bbf7d0;letter-spacing:2px;text-transform:uppercase;font-weight:700">Bóveda LOLS — Resumen de Novedades</p>
        <p style="margin:0;font-size:22px;color:#ffffff;font-weight:900">${total} novedades · ${esc(rango.label)}</p>
      </td></tr>
      ${secciones}
      <tr><td style="padding:18px 28px 24px;border-top:1px solid #f3f4f6">
        <p style="margin:0;font-size:11px;color:#9ca3af;text-align:center">Resumen automático del día anterior. Se configura en Configuración → Sistema → Avisos.</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

function renderText({ rango, categorias, total }) {
    const lines = [`Resumen de Novedades — ${rango.label} (${total} novedades)`, ''];
    for (const c of categorias) {
        lines.push(`• ${c.etiqueta}: ${c.count}`);
        c.muestras.forEach(m => lines.push(`   - ${m.label} (${m.usuario})`));
        if (c.count > c.muestras.length) lines.push(`   …y ${c.count - c.muestras.length} más`);
    }
    return lines.join('\n');
}

/** Destinatarios: `to` explícito > tabla avisos_suscriptores (activo=1) > env AVISOS_TO/REPORTE_TO. */
async function resolveRecipients(db, cliTo) {
    if (cliTo) {
        const arr = Array.isArray(cliTo) ? cliTo : String(cliTo).split(',');
        return arr.map(s => String(s).trim()).filter(Boolean);
    }
    try {
        const [rows] = await db.query('SELECT email FROM avisos_suscriptores WHERE activo = 1 ORDER BY email');
        const emails = rows.map(r => r.email).filter(Boolean);
        if (emails.length) return emails;
    } catch (err) {
        if (err && err.errno !== 1146) throw err;
        logger.warn('Tabla avisos_suscriptores no existe todavía — usando env.');
    }
    return (process.env.AVISOS_TO || process.env.REPORTE_TO || '').split(',').map(s => s.trim()).filter(Boolean);
}

/**
 * Orquesta el resumen diario. Si no hay novedades que crucen umbral, NO envía
 * (evita correos vacíos), salvo dry (que siempre devuelve el preview).
 * @returns {Promise<object>} dry → {dry:true, html, text, subject, resumen};
 *   sin novedades → {sent:false, reason, resumen};
 *   envío → {sent:true, subject, recipients, messageId, total}.
 */
async function enviarResumen({ db, to = null, fecha = null, dry = false, forzar = false } = {}) {
    const rango = getDiaPrevio(fecha || undefined);
    const resumen = await construirResumen(db, rango);
    const subject = `Resumen de Novedades — ${rango.label}`;
    const html = renderHtml(resumen);
    const text = renderText(resumen);

    if (dry) return { dry: true, html, text, subject, resumen };

    // Sin novedades: el cron NO envía (evita correos vacíos). "Enviar prueba" pasa
    // forzar=true para igual mandar el formato y validar SMTP.
    if (resumen.total === 0 && !forzar) {
        return { sent: false, reason: 'sin-novedades', resumen };
    }

    const recipients = await resolveRecipients(db, to);
    if (!recipients.length) {
        throw Object.assign(new Error('Sin destinatarios: define suscriptores activos, AVISOS_TO/REPORTE_TO, o pasa "to".'), { statusCode: 400 });
    }

    const res = await emailService.sendSystemEmail({ to: recipients, subject, html, text, fromName: 'Bóveda LOLS — Novedades' });
    return {
        sent: true,
        subject,
        recipients,
        total: resumen.total,
        messageId: res.messageId,
        accepted: res.accepted || [],
        rejected: res.rejected || [],
    };
}

module.exports = {
    getDiaPrevio,
    construirResumen,
    resolveRecipients,
    enviarResumen,
    renderHtml,
    renderText,
    _internals: { QUERY_MAP, esc, ymd },
};
