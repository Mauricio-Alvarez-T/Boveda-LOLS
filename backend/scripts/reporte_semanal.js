#!/usr/bin/env node
/**
 * Reporte Semanal RRHH — script standalone para cron de cPanel.
 *
 * Primera automatización de Bóveda LOLS. Corre lunes 08:00 (cron cPanel, NO
 * node-cron — ver RUNBOOK §4.1). Abre y cierra su propia conexión a DB.
 *
 * La orquestación (armar datos → renderizar → enviar) vive en el servicio
 * `reporteSemanal.service.enviarReporteSemanal()`, compartida con el endpoint
 * "enviar prueba" del API. Este script solo aporta: parseo de args, pool propio
 * (el cron corre fuera de Passenger), escritura del preview en --dry, exit codes.
 *
 * USO:
 *   node scripts/reporte_semanal.js                       # semana anterior → suscriptores activos / REPORTE_TO
 *   node scripts/reporte_semanal.js --dry                 # arma + previsualiza, NO envía
 *   node scripts/reporte_semanal.js --to a@b.cl,c@d.cl    # fuerza destinatarios (preview real)
 *   node scripts/reporte_semanal.js --fecha 2026-05-25    # usa esa fecha como "hoy" (ventana = su semana previa)
 *
 * En cPanel: Cron Jobs → "0 8 * * 1" →
 *   cd ~/test-boveda && /home/lolscl/nodevenv/test-boveda/20/bin/node scripts/reporte_semanal.js >> ~/reporte.log 2>&1
 *
 * Destinatarios: tabla `reportes_suscriptores` (activo=1). Si la tabla está vacía
 * o no existe, cae a la env REPORTE_TO (CSV). El flag --to siempre tiene prioridad.
 *
 * Exit codes: 0 OK · 1 error (cron de cPanel alerta por mail al detectar !=0).
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const reporteService = require('../src/services/reporteSemanal.service');

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
        const result = await reporteService.enviarReporteSemanal({
            db: pool,
            to: args.to,
            fecha: args.fecha || undefined,
            dry: args.dry,
        });
        console.log('  Totales:', JSON.stringify(result.totales || {}));

        if (result.dry) {
            const outDir = path.join(__dirname, '..', 'tmp');
            fs.mkdirSync(outDir, { recursive: true });
            const outFile = path.join(outDir, 'reporte_preview.html');
            fs.writeFileSync(outFile, result.html, 'utf8');
            console.log(`📝 DRY-RUN: HTML escrito en ${outFile} (${result.html.length} bytes). No se envió correo.`);
            return;
        }

        console.log(`✅ Enviado a ${result.recipients.length} destinatario(s): ${result.recipients.join(', ')}`);
        console.log(`   messageId=${result.messageId} aceptados=${result.accepted.length} rechazados=${result.rejected.length}`);
        // Rechazo PARCIAL: el envío resolvió OK pero el servidor rechazó algún buzón → visible en el log.
        if (result.rejected && result.rejected.length) {
            const dirs = result.rejected.map(r => (typeof r === 'string' ? r : (r && r.address) || JSON.stringify(r)));
            console.warn(`⚠️  ${result.rejected.length} destinatario(s) RECHAZADO(s) por el servidor: ${dirs.join(', ')}`);
            console.warn('   Verificá que sean buzones válidos:  npm run reporte-doctor -- --probe <email>');
        }
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
