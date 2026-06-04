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
        const asunto = `🔔 Recordatorio — Seguro ${s.tipo} vehículo ${s.patente} vence en ${s.dias_restantes} días`;
        const waMensaje = `🔔 *Recordatorio Bóveda LOLS*\n\nEl seguro *${s.tipo}* del vehículo *${s.patente}* (${s.marca} ${s.modelo}) vence el *${fmtFecha(s.fecha_vencimiento)}* — quedan *${s.dias_restantes} días*.\n${s.compania ? `Compañía: ${s.compania}` : ''}\n\n_Favor gestionar la renovación con anticipación._`;
        const html = `
            <div style="font-family:sans-serif;max-width:500px;margin:0 auto">
            <h2 style="color:#1a7a3f;border-bottom:2px solid #1a7a3f;padding-bottom:8px">🚗 Recordatorio de Seguro Vehicular</h2>
            <p><b>Vehículo:</b> ${s.patente} — ${s.marca} ${s.modelo}</p>
            <p><b>Tipo de seguro:</b> ${s.tipo}</p>
            ${s.compania ? `<p><b>Compañía:</b> ${s.compania}</p>` : ''}
            ${s.numero_poliza ? `<p><b>N° Póliza:</b> ${s.numero_poliza}</p>` : ''}
            <p><b>Fecha de vencimiento:</b> ${fmtFecha(s.fecha_vencimiento)}</p>
            <div style="background:#fef3c7;border-left:4px solid #d97706;padding:12px;margin:16px 0;border-radius:4px">
                <b style="color:#92400e">⏰ Quedan ${s.dias_restantes} días para el vencimiento.</b><br>
                <span style="color:#78350f">Favor gestionar la renovación con anticipación.</span>
            </div>
            <hr style="border:none;border-top:1px solid #e5e7eb"/>
            <p style="font-size:0.8em;color:#9ca3af">Bóveda LOLS — Sistema de Gestión Vehicular</p>
            </div>`;
        await enviarEmail(s.email_alerta, asunto, html, s.tel_alerta, waMensaje);
    }

    // ── Revisiones ────────────────────────────────────────────────────────────
    for (const r of revisiones) {
        const tipoLabel = r.tipo === 'tecnica' ? 'Revisión Técnica' : r.tipo === 'gases' ? 'Control de Gases' : 'Revisión Mecánica';
        const asunto = `🔔 Recordatorio — ${tipoLabel} vehículo ${r.patente} en ${r.dias_restantes} días`;
        const waMensaje = `🔔 *Recordatorio Bóveda LOLS*\n\n*${tipoLabel}* del vehículo *${r.patente}* (${r.marca} ${r.modelo}).\n\n📅 Fecha: *${fmtFecha(r.fecha_vencimiento)}* — quedan *${r.dias_restantes} días*\n${r.planta ? `🏭 Planta: ${r.planta}` : ''}${r.direccion ? `\n📍 Dirección: ${r.direccion}` : ''}\n\n_Favor coordinar el traslado del vehículo._`;
        const html = `
            <div style="font-family:sans-serif;max-width:500px;margin:0 auto">
            <h2 style="color:#1a7a3f;border-bottom:2px solid #1a7a3f;padding-bottom:8px">🚗 Recordatorio de Revisión Técnica</h2>
            <p><b>Vehículo:</b> ${r.patente} — ${r.marca} ${r.modelo}</p>
            <p><b>Tipo:</b> ${tipoLabel}</p>
            ${r.planta ? `<p><b>Planta:</b> ${r.planta}</p>` : ''}
            ${r.direccion ? `<p><b>Dirección:</b> ${r.direccion}</p>` : ''}
            <p><b>Fecha programada:</b> ${fmtFecha(r.fecha_vencimiento)}</p>
            <div style="background:#fef3c7;border-left:4px solid #d97706;padding:12px;margin:16px 0;border-radius:4px">
                <b style="color:#92400e">⏰ Quedan ${r.dias_restantes} días para la revisión.</b><br>
                <span style="color:#78350f">Favor coordinar el traslado del vehículo con anticipación.</span>
            </div>
            <hr style="border:none;border-top:1px solid #e5e7eb"/>
            <p style="font-size:0.8em;color:#9ca3af">Bóveda LOLS — Sistema de Gestión Vehicular</p>
            </div>`;
        await enviarEmail(r.email_alerta, asunto, html, r.tel_alerta, waMensaje);
    }

    // ── Mantenciones ──────────────────────────────────────────────────────────
    for (const m of mantenciones) {
        const asunto = `🔔 Recordatorio — Mantención "${m.tipo}" vehículo ${m.patente} en ${m.dias_restantes} días`;
        const waMensaje = `🔔 *Recordatorio Bóveda LOLS*\n\nMantención *${m.tipo}* del vehículo *${m.patente}* (${m.marca} ${m.modelo}).\n\n📅 Fecha programada: *${fmtFecha(m.fecha_proxima)}* — quedan *${m.dias_restantes} días*\n${m.taller ? `🔧 Taller: ${m.taller}` : ''}\n\n_Favor coordinar con anticipación._`;
        const html = `
            <div style="font-family:sans-serif;max-width:500px;margin:0 auto">
            <h2 style="color:#1a7a3f;border-bottom:2px solid #1a7a3f;padding-bottom:8px">🔧 Recordatorio de Mantención Programada</h2>
            <p><b>Vehículo:</b> ${m.patente} — ${m.marca} ${m.modelo}</p>
            <p><b>Tipo de mantención:</b> ${m.tipo}</p>
            ${m.taller ? `<p><b>Taller:</b> ${m.taller}</p>` : ''}
            <p><b>Fecha programada:</b> ${fmtFecha(m.fecha_proxima)}</p>
            <div style="background:#fef3c7;border-left:4px solid #d97706;padding:12px;margin:16px 0;border-radius:4px">
                <b style="color:#92400e">⏰ Quedan ${m.dias_restantes} días para la mantención.</b><br>
                <span style="color:#78350f">Favor coordinar con el taller con anticipación.</span>
            </div>
            <hr style="border:none;border-top:1px solid #e5e7eb"/>
            <p style="font-size:0.8em;color:#9ca3af">Bóveda LOLS — Sistema de Gestión Vehicular</p>
            </div>`;
        await enviarEmail(m.email_alerta, asunto, html, m.tel_alerta, waMensaje);
    }

    console.log(`\n📊 Resultado: ${enviados} enviados, ${errores} errores.\n`);
    await pool.end().catch(() => {});
}

main().catch(err => {
    console.error('❌ Error:', err.message || err);
    process.exit(1);
});
