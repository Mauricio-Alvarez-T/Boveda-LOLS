#!/usr/bin/env node
/**
 * Script de alertas de vehículos — envía emails automáticos para seguros,
 * revisiones técnicas y mantenciones que vencen en los próximos N días
 * (default: 30).
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
const emailSvc = require('../src/services/email.service');

const args      = process.argv.slice(2);
const diasArg   = args.includes('--dias') ? Number(args[args.indexOf('--dias') + 1]) : 30;
const testMode  = args.includes('--test');
const forzar    = args.includes('--forzar'); // Envía aunque no sea el día exacto (solo pruebas)
const dias      = isNaN(diasArg) ? 30 : diasArg;

const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

// Frase de urgencia según los días restantes (0 = vence hoy, 1 = queda 1 día, …).
function fraseAtencion(d) {
    if (d <= 0) return '¡Atención! Vence hoy';
    if (d === 1) return '¡Atención! Queda 1 día';
    return `¡Atención! Quedan ${d} días`;
}

/**
 * Genera el HTML del email — responsive mobile.
 * La cabecera solo muestra "¡ATENCIÓN! Quedan X días" en grande.
 * El tipo/detalle van en la tabla de datos.
 */
function emailHtml({ diasRestantes, filas, nota }) {
    const filasHtml = filas
        .filter(Boolean)
        .map(([label, valor]) => `
            <tr>
              <td style="padding:10px 16px;background:#f9fafb;font-size:12px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:.5px;white-space:nowrap;vertical-align:top">${label}</td>
              <td style="padding:10px 16px;font-size:14px;color:#111827;border-bottom:1px solid #e5e7eb;word-break:break-word">${valor}</td>
            </tr>`).join('');

    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>
    @media only screen and (max-width:600px){
      .wrapper{width:100%!important;padding:0!important}
      .card{border-radius:0!important;margin:0!important}
      .header{padding:24px 20px!important}
      .body{padding:16px 20px 0!important}
      .footer{padding:12px 20px 20px!important}
      .dias{font-size:42px!important}
      td{font-size:13px!important}
    }
  </style>
</head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:Arial,Helvetica,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" class="wrapper" style="background:#f0f4f8;padding:24px 16px">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" class="card" style="max-width:560px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.10)">

        <!-- CABECERA — solo "¡ATENCIÓN! Quedan X días" -->
        <tr>
          <td class="header" style="background:#1a7a3f;padding:28px 36px;text-align:center">
            <p style="margin:0 0 10px;font-size:11px;color:#bbf7d0;letter-spacing:3px;text-transform:uppercase;font-weight:700">Bóveda LOLS — Gestión Vehicular</p>
            <p class="dias" style="margin:0;font-size:28px;color:#fde047;font-weight:900;line-height:1.3">${fraseAtencion(diasRestantes)}</p>
          </td>
        </tr>

        <!-- TABLA DE DATOS -->
        <tr>
          <td class="body" style="padding:20px 28px 0">
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden">
              ${filasHtml}
            </table>
          </td>
        </tr>

        <!-- NOTA ACCIÓN -->
        <tr>
          <td style="padding:16px 28px">
            <div style="background:#fefce8;border-left:4px solid #f59e0b;border-radius:8px;padding:14px 16px">
              <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#92400e">Acción requerida</p>
              <p style="margin:0;font-size:13px;color:#78350f;line-height:1.6">${nota}</p>
            </div>
          </td>
        </tr>

        <!-- PIE -->
        <tr>
          <td class="footer" style="padding:12px 28px 24px;border-top:1px solid #f3f4f6">
            <p style="margin:0;font-size:11px;color:#9ca3af;text-align:center">Generado automáticamente por <b>Bóveda LOLS</b>. No responder a este correo.</p>
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
    // MySQL puede devolver Date object o string — normalizar a 'YYYY-MM-DD'
    const iso = s instanceof Date ? s.toISOString().split('T')[0] : String(s).split('T')[0];
    const [y, m, d] = iso.split('-');
    if (!y || !m || !d) return String(s);
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
    // Filtro de HORA: solo envía si la hora actual coincide con hora_alerta (default 08:00).
    // Requiere que el cron corra cada hora (0 * * * *) para que las horas personalizadas
    // funcionen. Si corre 1 vez al día, solo dispararán los registros cuya hora = la del cron.
    const horaCond = (al) => `AND HOUR(NOW()) = COALESCE(HOUR(${al}.hora_alerta), 8)`;
    const condSeguro   = forzar ? 'AND s.email_alerta IS NOT NULL' : `AND s.email_alerta IS NOT NULL AND s.dias_alerta IS NOT NULL AND DATEDIFF(s.fecha_vencimiento, CURDATE()) = s.dias_alerta ${horaCond('s')}`;
    // Revisiones: alerta basada en la fecha de VENCIMIENTO del certificado.
    const condRevision = forzar ? 'AND r.email_alerta IS NOT NULL' : `AND r.email_alerta IS NOT NULL AND r.dias_alerta IS NOT NULL AND r.fecha_vencimiento IS NOT NULL AND DATEDIFF(r.fecha_vencimiento, CURDATE()) = r.dias_alerta ${horaCond('r')}`;
    // Mantenciones: alerta basada en la fecha próxima (vencimiento de la mantención).
    const condMant     = forzar ? 'AND m.email_alerta IS NOT NULL' : `AND m.email_alerta IS NOT NULL AND m.dias_alerta IS NOT NULL AND m.fecha_proxima IS NOT NULL AND DATEDIFF(m.fecha_proxima, CURDATE()) = m.dias_alerta ${horaCond('m')}`;

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
    async function enviarEmail(dest, asunto, html) {
        if (testMode) {
            console.log(`  📧 [TEST] Enviaría a ${dest}: "${asunto}"`);
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
    }

    // ── Seguros ───────────────────────────────────────────────────────────────
    for (const s of seguros) {
        const asunto = `⚠️ ${fraseAtencion(s.dias_restantes)} — Seguro ${s.tipo} · ${s.patente}`;
        const html = emailHtml({
            diasRestantes: s.dias_restantes,
            filas: [
                ['Tipo de seguro',       s.tipo],
                ['Vehículo',             `${s.marca} ${s.modelo}`],
                ['Fecha vencimiento',    fmtFecha(s.fecha_vencimiento)],
                ['Patente',              s.patente],
                s.compania      ? ['Compañía',  s.compania]      : null,
                s.numero_poliza ? ['N° Póliza', s.numero_poliza] : null,
            ],
            nota: 'Favor gestionar la renovación del seguro con anticipación. Coordinar directamente con la compañía aseguradora.',
        });
        await enviarEmail(s.email_alerta, asunto, html);
    }

    // ── Revisiones ────────────────────────────────────────────────────────────
    for (const r of revisiones) {
        const tipoLabel = r.tipo === 'tecnica' ? 'Revisión Técnica' : r.tipo === 'gases' ? 'Control de Gases' : 'Revisión Mecánica';
        const asunto = `⚠️ ${fraseAtencion(r.dias_restantes)} — ${tipoLabel} · ${r.patente}`;
        const html = emailHtml({
            diasRestantes: r.dias_restantes,
            filas: [
                ['Tipo de revisión', tipoLabel],
                ['Vehículo',         `${r.marca} ${r.modelo}`],
                ['Fecha programada', fmtFecha(r.fecha)],
                ['Patente',          r.patente],
                r.planta    ? ['Planta / Taller', r.planta]     : null,
                r.direccion ? ['Dirección',       r.direccion]  : null,
                ['Hora del turno',   'Por agendar manualmente'],
            ],
            nota: 'Favor agendar el turno directamente en la planta de revisión técnica y coordinar el traslado del vehículo con anticipación.',
        });
        await enviarEmail(r.email_alerta, asunto, html);
    }

    // ── Mantenciones ──────────────────────────────────────────────────────────
    for (const m of mantenciones) {
        const asunto = `⚠️ ${fraseAtencion(m.dias_restantes)} — Próxima mantención: ${m.tipo} · ${m.patente}`;
        const html = emailHtml({
            diasRestantes: m.dias_restantes,
            filas: [
                ['Tipo de mantención', m.tipo],
                ['Vehículo',           `${m.marca} ${m.modelo}`],
                ['Fecha por realizar', fmtFecha(m.fecha)],
                ['Patente',            m.patente],
                m.taller ? ['Taller', m.taller] : null,
                m.descripcion ? ['Detalle / Dirección', m.descripcion] : null,
                ['Hora del turno',     'Por agendar manualmente'],
            ],
            nota: 'Favor agendar el turno directamente con el taller y coordinar el traslado del vehículo con anticipación.',
        });
        await enviarEmail(m.email_alerta, asunto, html);
    }

    console.log(`\n📊 Resultado: ${enviados} enviados, ${errores} errores.\n`);
    await pool.end().catch(() => {});
}

main().catch(err => {
    console.error('❌ Error:', err.message || err);
    process.exit(1);
});
