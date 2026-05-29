#!/usr/bin/env node
/**
 * Reporte Semanal RRHH — script standalone para cron de cPanel.
 *
 * Primera automatización de Bóveda LOLS. Corre lunes 08:00 (cron cPanel, NO
 * node-cron — ver RUNBOOK §4.1). Abre y cierra su propia conexión a DB.
 *
 * USO:
 *   node scripts/reporte_semanal.js                       # semana anterior → suscriptores activos
 *   node scripts/reporte_semanal.js --dry                 # arma + previsualiza, NO envía
 *   node scripts/reporte_semanal.js --to a@b.cl,c@d.cl    # fuerza destinatarios (preview real)
 *   node scripts/reporte_semanal.js --fecha 2026-05-25    # usa esa fecha como "hoy" (ventana = su semana previa)
 *
 * En cPanel: Cron Jobs → "0 8 * * 1" →
 *   cd ~/test-boveda && /home/lolscl/nodevenv/test-boveda/20/bin/node scripts/reporte_semanal.js >> ~/reporte.log 2>&1
 *
 * Destinatarios: tabla `reportes_suscriptores` (activo=1). Si la tabla aún no
 * existe (Slice A previo a la migración), cae a la env REPORTE_TO (lista CSV).
 * El flag --to siempre tiene prioridad.
 *
 * Exit codes: 0 OK · 1 error (cron de cPanel alerta por mail al detectar !=0).
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const reporteService = require('../src/services/reporteSemanal.service');
const emailService = require('../src/services/email.service');

// ── Parse de argumentos (soporta "--k v" y "--k=v") ──
function parseArgs(argv) {
    const out = { dry: false, to: null, fecha: null };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--dry') out.dry = true;
        else if (a === '--to' || a === '--fecha') {
            out[a.slice(2)] = argv[++i];
        } else if (a.startsWith('--to=')) out.to = a.slice(5);
        else if (a.startsWith('--fecha=')) out.fecha = a.slice(8);
    }
    return out;
}

/** Resuelve destinatarios: --to > tabla suscriptores > env REPORTE_TO. */
async function resolveRecipients(pool, cliTo) {
    if (cliTo) {
        return cliTo.split(',').map(s => s.trim()).filter(Boolean);
    }
    try {
        const [rows] = await pool.query(
            'SELECT email FROM reportes_suscriptores WHERE activo = 1 ORDER BY email'
        );
        const emails = rows.map(r => r.email).filter(Boolean);
        if (emails.length) return emails;
    } catch (err) {
        // ER_NO_SUCH_TABLE (1146): tabla aún no creada (Slice A). Cae a env.
        if (err && err.errno !== 1146) throw err;
        console.warn('⚠️  Tabla reportes_suscriptores no existe todavía — usando REPORTE_TO.');
    }
    const envTo = (process.env.REPORTE_TO || '').split(',').map(s => s.trim()).filter(Boolean);
    return envTo;
}

/** Logo CID si existe el archivo; si no, render usa header de texto. */
function resolveLogo() {
    const candidate = process.env.REPORTE_LOGO_PATH || path.join(__dirname, '..', 'assets', 'logo-lols-green.png');
    if (fs.existsSync(candidate)) {
        return {
            attachments: [{ filename: 'logo-lols.png', path: candidate, cid: 'logoLols' }],
            logoCid: 'logoLols',
        };
    }
    return { attachments: [], logoCid: null };
}

async function main() {
    const args = parseArgs(process.argv.slice(2));

    if (args.fecha && !/^\d{4}-\d{2}-\d{2}$/.test(args.fecha)) {
        console.error(`❌ --fecha inválida: "${args.fecha}". Formato YYYY-MM-DD.`);
        process.exit(1);
    }

    const rango = reporteService.getSemanaPrevia(args.fecha || undefined);
    console.log(`📅 Reporte semanal — ventana ${rango.desde} a ${rango.hasta}${args.dry ? ' [DRY-RUN]' : ''}`);

    const pool = mysql.createPool({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'sgdl',
        port: process.env.DB_PORT || 3306,
        charset: 'utf8mb4',
        connectTimeout: 10000,
        connectionLimit: 5,
    });

    try {
        const data = await reporteService.buildReportData(pool, {
            desde: rango.desde,
            hasta: rango.hasta,
            ref: args.fecha || undefined,
        });
        console.log('  Totales:', JSON.stringify(data.totales));

        const { attachments, logoCid } = resolveLogo();
        const html = reporteService.renderHtml(data, { logoCid });
        const text = reporteService.renderText(data);
        const subject = `Reporte Semanal RRHH — ${reporteService._internals.fmtFecha(rango.desde)} al ${reporteService._internals.fmtFecha(rango.hasta)}`;

        // DRY-RUN: escribe preview a archivo y NO envía.
        if (args.dry) {
            const outDir = path.join(__dirname, '..', 'tmp');
            fs.mkdirSync(outDir, { recursive: true });
            const outFile = path.join(outDir, 'reporte_preview.html');
            fs.writeFileSync(outFile, html, 'utf8');
            console.log(`📝 DRY-RUN: HTML escrito en ${outFile} (${html.length} bytes). No se envió correo.`);
            console.log(logoCid ? '   Logo: CID embebido.' : '   Logo: header de texto (no se encontró PNG).');
            return;
        }

        const recipients = await resolveRecipients(pool, args.to);
        if (!recipients.length) {
            console.error('❌ Sin destinatarios. Define suscriptores activos, REPORTE_TO en .env, o usa --to.');
            process.exit(1);
        }

        const res = await emailService.sendSystemEmail({ to: recipients, subject, html, text, attachments });
        console.log(`✅ Enviado a ${recipients.length} destinatario(s): ${recipients.join(', ')}`);
        console.log(`   messageId=${res.messageId} aceptados=${(res.accepted || []).length} rechazados=${(res.rejected || []).length}`);
    } finally {
        await pool.end().catch(() => {});
    }
}

main().catch((err) => {
    console.error('❌ Error en reporte semanal:', err && err.message ? err.message : err);
    if (err && err.stack) console.error(err.stack);
    process.exit(1);
});

process.on('unhandledRejection', (reason) => {
    console.error('❌ Unhandled rejection:', reason);
    process.exit(1);
});
