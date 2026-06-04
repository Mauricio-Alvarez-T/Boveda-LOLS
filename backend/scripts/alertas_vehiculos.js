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
    const [seguros] = await pool.query(`
        SELECT s.*, v.patente, v.marca, v.modelo,
               DATEDIFF(s.fecha_vencimiento, CURDATE()) AS dias_restantes
        FROM vehiculo_seguros s JOIN vehiculos v ON v.id = s.vehiculo_id
        WHERE s.activo = 1 AND v.activo = 1
          AND s.email_alerta IS NOT NULL
          AND s.fecha_vencimiento BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL ? DAY)
          AND (s.dias_alerta IS NULL OR DATEDIFF(s.fecha_vencimiento, CURDATE()) <= s.dias_alerta)
    `, [dias]);

    const [revisiones] = await pool.query(`
        SELECT r.*, v.patente, v.marca, v.modelo,
               DATEDIFF(r.fecha_vencimiento, CURDATE()) AS dias_restantes
        FROM vehiculo_revisiones r JOIN vehiculos v ON v.id = r.vehiculo_id
        WHERE r.activo = 1 AND v.activo = 1
          AND r.email_alerta IS NOT NULL
          AND r.fecha_vencimiento BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL ? DAY)
          AND (r.dias_alerta IS NULL OR DATEDIFF(r.fecha_vencimiento, CURDATE()) <= r.dias_alerta)
    `, [dias]);

    const [mantenciones] = await pool.query(`
        SELECT m.*, v.patente, v.marca, v.modelo,
               DATEDIFF(m.fecha_proxima, CURDATE()) AS dias_restantes
        FROM vehiculo_mantenciones m JOIN vehiculos v ON v.id = m.vehiculo_id
        WHERE m.activo = 1 AND v.activo = 1
          AND m.email_alerta IS NOT NULL
          AND m.fecha_proxima IS NOT NULL
          AND m.fecha_proxima BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL ? DAY)
          AND (m.dias_alerta IS NULL OR DATEDIFF(m.fecha_proxima, CURDATE()) <= m.dias_alerta)
    `, [dias]);

    const total = seguros.length + revisiones.length + mantenciones.length;
    console.log(`📋 Encontrados: ${seguros.length} seguros, ${revisiones.length} revisiones, ${mantenciones.length} mantenciones\n`);

    if (total === 0) {
        console.log('✅ Sin alertas pendientes para enviar.\n');
        await pool.end().catch(() => {});
        return;
    }

    let enviados = 0, errores = 0;

    // ── Función para enviar un email ──────────────────────────────────────────
    async function enviarEmail(dest, asunto, html, whatsapp) {
        if (testMode) {
            console.log(`  📧 [TEST] Enviaría a ${dest}: "${asunto}"`);
            if (whatsapp) console.log(`  📱 [TEST] WhatsApp ${whatsapp}: "${asunto}"`);
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
        // WhatsApp: genera mensaje (en producción se integraría con API de WA Business)
        if (whatsapp) {
            console.log(`  📱 WhatsApp ${whatsapp}: "${asunto}"`);
        }
    }

    // ── Seguros ───────────────────────────────────────────────────────────────
    for (const s of seguros) {
        const urgencia = s.dias_restantes <= 0 ? '🔴 VENCIDO' : s.dias_restantes <= 7 ? '🔴 URGENTE' : '🟡 POR VENCER';
        const asunto = `${urgencia} — Seguro ${s.tipo} vehículo ${s.patente}`;
        const html = `
            <h2 style="color:#1a7a3f">🚗 Alerta de Seguro Vehicular</h2>
            <p><b>Vehículo:</b> ${s.patente} — ${s.marca} ${s.modelo}</p>
            <p><b>Tipo de seguro:</b> ${s.tipo}</p>
            ${s.compania ? `<p><b>Compañía:</b> ${s.compania}</p>` : ''}
            ${s.numero_poliza ? `<p><b>N° Póliza:</b> ${s.numero_poliza}</p>` : ''}
            <p><b>Vencimiento:</b> ${fmtFecha(s.fecha_vencimiento)}</p>
            <p style="font-size:1.2em;color:${s.dias_restantes <= 0 ? '#dc2626' : '#d97706'}">
                <b>${s.dias_restantes <= 0 ? `Venció hace ${Math.abs(s.dias_restantes)} días` : `Vence en ${s.dias_restantes} días`}</b>
            </p>
            <hr/><p style="font-size:0.85em;color:#888">Enviado por Bóveda LOLS</p>`;
        await enviarEmail(s.email_alerta, asunto, html, s.tel_alerta);
    }

    // ── Revisiones ────────────────────────────────────────────────────────────
    for (const r of revisiones) {
        const tipoLabel = r.tipo === 'tecnica' ? 'Revisión Técnica' : r.tipo === 'gases' ? 'Control de Gases' : 'Revisión Mecánica';
        const urgencia = r.dias_restantes <= 0 ? '🔴 VENCIDO' : r.dias_restantes <= 7 ? '🔴 URGENTE' : '🟡 POR VENCER';
        const asunto = `${urgencia} — ${tipoLabel} vehículo ${r.patente}`;
        const html = `
            <h2 style="color:#1a7a3f">🚗 Alerta de Revisión Técnica</h2>
            <p><b>Vehículo:</b> ${r.patente} — ${r.marca} ${r.modelo}</p>
            <p><b>Tipo:</b> ${tipoLabel}</p>
            <p><b>Resultado actual:</b> ${r.resultado}</p>
            ${r.planta ? `<p><b>Planta:</b> ${r.planta}</p>` : ''}
            ${r.direccion ? `<p><b>Dirección:</b> ${r.direccion}</p>` : ''}
            <p><b>Vencimiento:</b> ${fmtFecha(r.fecha_vencimiento)}</p>
            <p style="font-size:1.2em;color:${r.dias_restantes <= 0 ? '#dc2626' : '#d97706'}">
                <b>${r.dias_restantes <= 0 ? `Venció hace ${Math.abs(r.dias_restantes)} días` : `Vence en ${r.dias_restantes} días`}</b>
            </p>
            <hr/><p style="font-size:0.85em;color:#888">Enviado por Bóveda LOLS</p>`;
        await enviarEmail(r.email_alerta, asunto, html, r.tel_alerta);
    }

    // ── Mantenciones ──────────────────────────────────────────────────────────
    for (const m of mantenciones) {
        const urgencia = m.dias_restantes <= 0 ? '🔴 ATRASADA' : m.dias_restantes <= 7 ? '🔴 URGENTE' : '🟡 PRÓXIMA';
        const asunto = `${urgencia} — Mantención: ${m.tipo} vehículo ${m.patente}`;
        const html = `
            <h2 style="color:#1a7a3f">🔧 Alerta de Mantención Programada</h2>
            <p><b>Vehículo:</b> ${m.patente} — ${m.marca} ${m.modelo}</p>
            <p><b>Mantención:</b> ${m.tipo}</p>
            ${m.taller ? `<p><b>Taller:</b> ${m.taller}</p>` : ''}
            <p><b>Fecha programada:</b> ${fmtFecha(m.fecha_proxima)}</p>
            <p style="font-size:1.2em;color:${m.dias_restantes <= 0 ? '#dc2626' : '#d97706'}">
                <b>${m.dias_restantes <= 0 ? `Atrasada ${Math.abs(m.dias_restantes)} días` : `Faltan ${m.dias_restantes} días`}</b>
            </p>
            <hr/><p style="font-size:0.85em;color:#888">Enviado por Bóveda LOLS</p>`;
        await enviarEmail(m.email_alerta, asunto, html, m.tel_alerta);
    }

    console.log(`\n📊 Resultado: ${enviados} enviados, ${errores} errores.\n`);
    await pool.end().catch(() => {});
}

main().catch(err => {
    console.error('❌ Error:', err.message || err);
    process.exit(1);
});
