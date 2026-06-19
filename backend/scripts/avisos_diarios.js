#!/usr/bin/env node
/**
 * Resumen diario de Novedades — script standalone para cron de cPanel.
 *
 * Corre cada mañana (ej. 08:00) y manda por email el resumen de novedades del DÍA
 * ANTERIOR (lee `logs_actividad`). NO usa node-cron (ver RUNBOOK §4.1): el cron de
 * cPanel lo dispara. Abre y cierra su propia conexión a DB. La lógica vive en el
 * servicio `avisosDiarios.service.enviarResumen()`, compartido con el endpoint
 * "enviar prueba" del API.
 *
 * USO:
 *   node scripts/avisos_diarios.js                    # día anterior → suscriptores activos / AVISOS_TO
 *   node scripts/avisos_diarios.js --dry              # arma + previsualiza, NO envía
 *   node scripts/avisos_diarios.js --to a@b.cl        # fuerza destinatario(s)
 *   node scripts/avisos_diarios.js --fecha 2026-06-19 # usa esa fecha como "hoy" (resume su día anterior)
 *
 * En cPanel: Cron Jobs → "0 8 * * *" →
 *   cd ~/test-boveda && /home/lolscl/nodevenv/test-boveda/20/bin/node scripts/avisos_diarios.js >> ~/avisos.log 2>&1
 *
 * Exit codes: 0 OK · 1 error (cron de cPanel alerta por mail al detectar !=0).
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const avisosService = require('../src/services/avisosDiarios.service');

function parseArgs(argv) {
    const out = { dry: false, to: null, fecha: null };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--dry') out.dry = true;
        else if (a === '--to' || a === '--fecha') out[a.slice(2)] = argv[++i];
        else if (a.startsWith('--to=')) out.to = a.slice(5);
        else if (a.startsWith('--fecha=')) out.fecha = a.slice(8);
    }
    return out;
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    if (args.fecha && !/^\d{4}-\d{2}-\d{2}$/.test(args.fecha)) {
        console.error(`❌ --fecha inválida: "${args.fecha}". Formato YYYY-MM-DD.`);
        process.exit(1);
    }

    const rango = avisosService.getDiaPrevio(args.fecha || undefined);
    console.log(`🔔 Resumen de Novedades — día ${rango.label}${args.dry ? ' [DRY-RUN]' : ''}`);

    const pool = mysql.createPool({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'sgdl',
        port: process.env.DB_PORT || 3306,
        charset: 'utf8mb4', connectTimeout: 10000, connectionLimit: 5,
    });

    try {
        const result = await avisosService.enviarResumen({
            db: pool, to: args.to, fecha: args.fecha || undefined, dry: args.dry,
        });

        if (result.dry) {
            const outDir = path.join(__dirname, '..', 'tmp');
            fs.mkdirSync(outDir, { recursive: true });
            const outFile = path.join(outDir, 'avisos_preview.html');
            fs.writeFileSync(outFile, result.html, 'utf8');
            console.log(`📝 DRY-RUN: ${result.resumen.total} novedades, ${result.resumen.categorias.length} categorías. HTML en ${outFile}. No se envió.`);
            return;
        }

        if (!result.sent) {
            console.log(`✅ Sin novedades que superen el umbral — no se envió correo (${result.reason}).`);
            return;
        }

        console.log(`✅ Enviado a ${result.recipients.length} destinatario(s): ${result.recipients.join(', ')}`);
        console.log(`   total=${result.total} messageId=${result.messageId}`);
    } finally {
        await pool.end().catch(() => {});
    }
}

main().catch((err) => {
    console.error('❌ Error en avisos diarios:', err && err.message ? err.message : err);
    if (err && err.stack) console.error(err.stack);
    process.exit(1);
});

process.on('unhandledRejection', (reason) => {
    console.error('❌ Unhandled rejection:', reason);
    process.exit(1);
});
