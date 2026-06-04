#!/usr/bin/env node
/**
 * Script de alertas de vehículos — envía emails y genera mensajes WhatsApp
 * para seguros, revisiones técnicas y mantenciones que vencen en los
 * próximos N días (default: 30).
 *
 * USO:
 *   node scripts/alertas_vehiculos.js           # Alertas próximos 30 días
 *   node scripts/alertas_vehiculos.js --dias 60 # Alertas próximos 60 días
 *   node scripts/alertas_vehiculos.js --test    # Muestra qué enviaría sin enviar
 *
 * En cPanel: Setup Node.js App → Run JS script → alertas-vehiculos
 * Cron diario: 0 8 * * * cd ~/test-boveda && node scripts/alertas_vehiculos.js
 */
require('dotenv').config();
const mysql    = require('mysql2/promise');
const emailSvc = require('./src/services/email.service');

const args      = process.argv.slice(2);
const diasArg   = args.includes('--dias') ? Number(args[args.indexOf('--dias') + 1]) : 30;
const testMode  = args.includes('--test');
const forzar    = args.includes('--forzar'); // Envía aunque no sea el día exacto (solo pruebas)
const dias      = isNaN(diasArg) ? 30 : diasArg;

const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

/** Genera el HTML del email con una estructura limpia y consistente. */
function emailHtml({ titulo, subtitulo, filas, nota }) {
    const filasHtml = filas
        .filter(Boolean)
        .map(([label, valor]) => `
            <tr>
                <td style="padding:8px 12px;background:#f9fafb;font-size:13px;color:#6b7280;font-weight:600;width:40%;border-bottom:1px solid #e5e7eb">${label}</td>
                <td style="padding:8px 12px;font-size:13px;color:#111827;border-bottom:1px solid #e5e7eb">${valor}</td>
            </tr>`).join('');

    return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 0">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)">

        <!-- Cabecera verde -->
        <tr>
          <td style="background:#1a7a3f;padding:24px 32px">
            <p style="margin:0;font-size:11px;color:#bbf7d0;letter-spacing:2px;text-transform:uppercase;font-weight:600">Bóveda LOLS — Gestión Vehicular</p>
            <h1 style="margin:8px 0 0;font-size:22px;color:#ffffff;font-weight:700">${titulo}</h1>
            <p style="margin:6px 0 0;font-size:14px;color:#d1fae5;font-weight:500">${subtitulo}</p>
          </td>
        </tr>

        <!-- Tabla de datos -->
        <tr>
          <td style="padding:24px 32px 0">
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
              ${filasHtml}
            </table>
          </td>
        </tr>

        <!-- Nota de acción -->
        <tr>
          <td style="padding:20px 32px">
            <div style="background:#fefce8;border:1px solid #fde047;border-radius:8px;padding:16px">
              <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#854d0e">📋 Acción requerida</p>
              <p style="margin:0;font-size:13px;color:#713f12;line-height:1.5">${nota}</p>
            </div>
          </td>
        </tr>

        <!-- Pie -->
        <tr>
          <td style="padding:16px 32px 24px;border-top:1px solid #e5e7eb">
            <p style="margin:0;font-size:11px;color:#9ca3af;text-align:center">Este mensaje fue generado automáticamente por <b>Bóveda LOLS</b>.<br>No responder a este correo.</p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
function fmtFecha(s) {
    if (!s) return '—';
    const [y, m, d] = String(s).split('T')[0].split('-');
    return `${d} ${MESES[Number(m)-1]} ${y}`;
}

async function main() {
    console.log(`\n🔔 Alertas Vehículos — vencimientos en los próximos ${dias} días${testMode ? ' [MODO TEST]' : ''}\n`);

    const pool = mysql.createPool({
        host: process.env.DB_HOST || 'localhost', user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '', database: process.env.DB_NAME || 'sgdl',
        port: process.env.DB_PORT || 3306, charset: 'utf8mb4', connectTimeout: 15000, connectionLimit: 3,
    });

    // ── Consultar items con alerta configurada que vencen pronto ──────────────
    // Modo normal: solo envía cuando faltan EXACTAMENTE los días configurados → 1 aviso por evento.
    // Modo --forzar: envía todo lo que tenga email_alerta (para pruebas).
    const condSeguro   = forzar ? 'AND s.email_alerta IS NOT NULL' : 'AND s.email_alerta IS NOT NULL AND s.dias_alerta IS NOT NULL AND DATEDIFF(s.fecha_vencimiento, CURDATE()) = s.dias_alerta';
    const condRevision = forzar ? 'AND r.email_alerta IS NOT NULL' : 'AND r.email_alerta IS NOT NULL AND r.dias_alerta IS NOT NULL AND DATEDIFF(r.fecha_vencimiento, CURDATE()) = r.dias_alerta';
    const condMant     = forzar ? 'AND m.email_alerta IS NOT NULL AND m.fecha_proxima IS NOT NULL' : 'AND m.email_alerta IS NOT NULL AND m.fecha_proxima IS NOT NULL AND m.dias_alerta IS NOT NULL AND DATEDIFF(m.fecha_proxima, CURDATE()) = m.dias_alerta';

    if (forzar) console.log('⚠️  Modo --forzar: enviando TODAS las alertas con email configurado.\n');

    const [seguros] = await pool.query(`
        SELECT s.*, v.patente, v.marca, v.modelo,
               DATEDIFF(s.fecha_vencimiento, CURDATE()) AS dias_restantes
        FROM vehiculo_seguros s JOIN vehiculos v ON v.id = s.vehiculo_id
        WHERE s.activo = 1 AND v.activo = 1 ${condSeguro}
    `, []);

    const [revisiones] = await pool.query(`
        SELECT r.*, v.patente, v.marca, v.modelo,
               DATEDIFF(r.fecha_vencimiento, CURDATE()) AS dias_restantes
        FROM vehiculo_revisiones r JOIN vehiculos v ON v.id = r.vehiculo_id
        WHERE r.activo = 1 AND v.activo = 1 ${condRevision}
    `, []);

    const [mantenciones] = await pool.query(`
        SELECT m.*, v.patente, v.marca, v.modelo,
               DATEDIFF(m.fecha_proxima, CURDATE()) AS dias_restantes
        FROM vehiculo_mantenciones m JOIN vehiculos v ON v.id = m.vehiculo_id
        WHERE m.activo = 1 AND v.activo = 1 ${condMant}
    `, []);

    const total = seguros.length + revisiones.length + mantenciones.length;
    console.log(`📋 Encontrados: ${seguros.length} seguros, ${revisiones.length} revisiones, ${mantenciones.length} mantenciones\n`);

    if (total === 0) {
        console.log('✅ Sin alertas pendientes para enviar.\n');
        await pool.end().catch(() => {});
        return;
    }

    let enviados = 0, errores = 0;

    // ── Función para enviar un email ──────────────────────────────────────────
    async function enviarEmail(dest, asunto, html, whatsapp, waMensaje) {
        if (testMode) {
            console.log(`  📧 [TEST] Enviaría a ${dest}: "${asunto}"`);
            if (whatsapp) { console.log(`  📱 [TEST] WhatsApp ${whatsapp}:`); console.log(waMensaje || asunto); }
            return;
        }
        try {
            await emailSvc.sendSystemEmail({ to: dest, subject: asunto, html, fromName: 'Bóveda LOLS — Vehículos' });
            console.log(`  ✅ Email enviado → ${dest}`);
            enviados++;
        } catch (err) {
            console.error(`  ❌ Error enviando a ${dest}: ${err.message}`);
            errores++;
        }
        if (whatsapp && waMensaje) {
            // El mensaje de WhatsApp se muestra en el log del servidor.
            // Para envío automático real se requiere WhatsApp Business API.
            console.log(`\n  📱 Mensaje WhatsApp para ${whatsapp}:\n${'─'.repeat(50)}\n${waMensaje}\n${'─'.repeat(50)}`);
        }
    }

    // ── Seguros ───────────────────────────────────────────────────────────────
    for (const s of seguros) {
        const asunto = `⚠️ ¡Atención! Quedan ${s.dias_restantes} días — Seguro ${s.tipo} · ${s.patente}`;
        const waMensaje = `⚠️ *¡Atención! Quedan ${s.dias_restantes} días*\n\nEl seguro *${s.tipo}* del vehículo *${s.patente}* (${s.marca} ${s.modelo}) vence el *${fmtFecha(s.fecha_vencimiento)}*.\n${s.compania ? `🏢 Compañía: ${s.compania}` : ''}${s.numero_poliza ? `\n📋 Póliza: ${s.numero_poliza}` : ''}\n\n_Favor agendar la renovación con anticipación._\n\n_Bóveda LOLS_`;
        const html = emailHtml({
            titulo: `⚠️ ¡Atención! Quedan <span style="color:#dc2626">${s.dias_restantes} días</span>`,
            subtitulo: `Seguro ${s.tipo} por vencer`,
            filas: [
                ['Vehículo', `${s.marca} ${s.modelo}`],
                ['Patente', s.patente],
                ['Tipo de seguro', s.tipo],
                s.compania    ? ['Compañía',  s.compania]    : null,
                s.numero_poliza ? ['N° Póliza', s.numero_poliza] : null,
                ['Fecha de vencimiento', fmtFecha(s.fecha_vencimiento)],
            ],
            nota: 'Favor agendar la renovación del seguro con anticipación. La hora y el lugar deberán ser coordinados directamente con la compañía aseguradora.',
        });
        await enviarEmail(s.email_alerta, asunto, html, s.tel_alerta, waMensaje);
    }

    // ── Revisiones ────────────────────────────────────────────────────────────
    for (const r of revisiones) {
        const tipoLabel = r.tipo === 'tecnica' ? 'Revisión Técnica' : r.tipo === 'gases' ? 'Control de Gases' : 'Revisión Mecánica';
        const asunto = `⚠️ ¡Atención! Quedan ${r.dias_restantes} días — ${tipoLabel} · ${r.patente}`;
        const waMensaje = `⚠️ *¡Atención! Quedan ${r.dias_restantes} días*\n\n*${tipoLabel}* del vehículo *${r.patente}* (${r.marca} ${r.modelo}).\n\n📅 Fecha programada: *${fmtFecha(r.fecha_vencimiento)}*\n${r.planta ? `🏭 Planta: ${r.planta}` : ''}${r.direccion ? `\n📍 Dirección: ${r.direccion}` : ''}\n\n_Favor agendar el turno y coordinar el traslado del vehículo._\n\n_Bóveda LOLS_`;
        const html = emailHtml({
            titulo: `⚠️ ¡Atención! Quedan <span style="color:#dc2626">${r.dias_restantes} días</span>`,
            subtitulo: tipoLabel,
            filas: [
                ['Vehículo', `${r.marca} ${r.modelo}`],
                ['Patente', r.patente],
                ['Tipo de revisión', tipoLabel],
                r.planta    ? ['Planta / Taller', r.planta]      : null,
                r.direccion ? ['Dirección',        r.direccion]  : null,
                ['Fecha programada', fmtFecha(r.fecha_vencimiento)],
                ['Hora del turno', '⚠️ Por agendar manualmente'],
            ],
            nota: 'Favor agendar el turno directamente en la planta de revisión técnica y coordinar el traslado del vehículo con anticipación.',
        });
        await enviarEmail(r.email_alerta, asunto, html, r.tel_alerta, waMensaje);
    }

    // ── Mantenciones ──────────────────────────────────────────────────────────
    for (const m of mantenciones) {
        const asunto = `⚠️ ¡Atención! Quedan ${m.dias_restantes} días — Mantención: ${m.tipo} · ${m.patente}`;
        const waMensaje = `⚠️ *¡Atención! Quedan ${m.dias_restantes} días*\n\nMantención *${m.tipo}* del vehículo *${m.patente}* (${m.marca} ${m.modelo}).\n\n📅 Fecha programada: *${fmtFecha(m.fecha_proxima)}*\n${m.taller ? `🔧 Taller: ${m.taller}` : ''}\n\n_Favor agendar el turno con el taller y coordinar el traslado._\n\n_Bóveda LOLS_`;
        const html = emailHtml({
            titulo: `⚠️ ¡Atención! Quedan <span style="color:#dc2626">${m.dias_restantes} días</span>`,
            subtitulo: `Mantención: ${m.tipo}`,
            filas: [
                ['Vehículo', `${m.marca} ${m.modelo}`],
                ['Patente', m.patente],
                ['Tipo de mantención', m.tipo],
                m.taller ? ['Taller', m.taller] : null,
                ['Fecha programada', fmtFecha(m.fecha_proxima)],
                ['Hora del turno', '⚠️ Por agendar manualmente'],
            ],
            nota: 'Favor agendar el turno directamente con el taller y coordinar el traslado del vehículo con anticipación.',
        });
        await enviarEmail(m.email_alerta, asunto, html, m.tel_alerta, waMensaje);
    }

    console.log(`\n📊 Resultado: ${enviados} enviados, ${errores} errores.\n`);
    await pool.end().catch(() => {});
}

main().catch(err => {
    console.error('❌ Error:', err.message || err);
    process.exit(1);
});
