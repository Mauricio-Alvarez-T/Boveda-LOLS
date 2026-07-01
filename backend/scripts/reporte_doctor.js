#!/usr/bin/env node
/**
 * Reporte Doctor — diagnóstico de la configuración de envío de correos de sistema.
 *
 * Verifica, SIN enviar ningún correo, que el entorno está listo para que el cron
 * del Reporte Semanal RRHH funcione. Pensado para correr en cPanel (Run JS script
 * o Terminal) cuando hay dudas de "¿por qué no llega el reporte?".
 *
 * Chequea:
 *   1. Variables de entorno MAIL_* (requeridas: HOST/USER/PASS; info: PORT/SECURE) + REPORTE_TO.
 *      NUNCA imprime el valor de MAIL_PASS (solo si está presente y su largo).
 *   2. Conexión SMTP real (emailService.verifyTransport → transporter.verify, handshake).
 *   2b. (--probe <email>) Envío REAL mínimo → ejercita RCPT y detecta buzón inexistente (550).
 *       verify() por sí solo NO ve ese error; el 550 ocurre recién al enviar.
 *   3. Destinatarios efectivos: suscriptores activos o fallback REPORTE_TO.
 *
 * USO:
 *   node scripts/reporte_doctor.js                       # solo diagnóstico (no envía)
 *   node scripts/reporte_doctor.js --probe tu@correo.cl  # + envío real de prueba a esa dirección
 *
 * En cPanel: Setup Node.js App → Run JS script → `reporte-doctor`, o Terminal:
 *   cd ~/boveda && /home/lolscl/nodevenv/boveda/20/bin/node scripts/reporte_doctor.js --probe tu@correo.cl
 *
 * Exit codes: 0 = listo (env + SMTP + destinatarios OK; y si hubo --probe, entregado) · 1 = falta algo.
 */
require('dotenv').config();
const mysql = require('mysql2/promise');

const emailService = require('../src/services/email.service');
const reporteService = require('../src/services/reporteSemanal.service');

const OK = '✅';
const BAD = '❌';
const INFO = 'ℹ️ ';

function line(estado, txt) { console.log(`  ${estado} ${txt}`); }

/** Parse simple de `--probe <email>` / `--probe=email`. */
function parseProbe(argv) {
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === '--probe') return argv[i + 1] || null;
        if (argv[i].startsWith('--probe=')) return argv[i].slice(8);
    }
    return null;
}

async function main() {
    const probe = parseProbe(process.argv.slice(2));
    console.log('🩺 Reporte Doctor — diagnóstico de envío de correos de sistema\n');

    // ── 1) Variables de entorno ──
    console.log('1) Variables de entorno (MAIL_*)');
    const host = process.env.MAIL_HOST;
    const user = process.env.MAIL_USER;
    const pass = process.env.MAIL_PASS;
    const port = process.env.MAIL_PORT;
    const secure = process.env.MAIL_SECURE;
    const reporteTo = process.env.REPORTE_TO;

    line(host ? OK : BAD, `MAIL_HOST: ${host || '(falta)'}`);
    line(user ? OK : BAD, `MAIL_USER: ${user || '(falta)'}`);
    line(pass ? OK : BAD, `MAIL_PASS: ${pass ? `presente (${pass.length} chars)` : '(falta)'}`);
    line(INFO, `MAIL_PORT: ${port || '(no def — usa 465)'}`);
    line(INFO, `MAIL_SECURE: ${secure != null && secure !== '' ? secure : '(no def — inferido del puerto)'}`);
    line(INFO, `REPORTE_TO: ${reporteTo ? reporteTo : '(no def — depende de suscriptores)'}`);
    const envOk = Boolean(host && user && pass);
    console.log(`  → ${envOk ? OK + ' variables requeridas presentes' : BAD + ' faltan variables requeridas'}\n`);

    // ── 2) Conexión SMTP (verify, sin enviar) ──
    console.log('2) Conexión SMTP (handshake, sin enviar correo)');
    let smtpOk = false;
    try {
        const info = await emailService.verifyTransport();
        smtpOk = true;
        line(OK, `SMTP conecta — ${info.host}:${info.port} secure=${info.secure} user=${info.user}`);
    } catch (err) {
        line(BAD, `SMTP NO conecta — ${err && err.message ? err.message : err}`);
    }
    console.log('');

    // ── 2b) Envío de prueba REAL (solo con --probe) ──
    // verify() NO detecta buzones inexistentes (el 550 ocurre en RCPT, al enviar). Con
    // --probe hacemos un envío real mínimo que ejercita RCPT y expone ese rechazo.
    let probeOk = null; // null = no se pidió
    if (probe) {
        console.log(`2b) Envío de prueba REAL a ${probe} (ejercita RCPT → detecta buzón inexistente)`);
        try {
            const info = await emailService.sendSystemEmail({
                to: probe,
                subject: 'Prueba reporte-doctor — Bóveda LOLS',
                text: 'Correo de prueba de reporte-doctor. Si lo recibiste, el envío funciona correctamente.',
            });
            const rejected = Array.isArray(info.rejected) ? info.rejected : [];
            if (rejected.length) {
                probeOk = false;
                line(BAD, `Rechazado — el servidor no aceptó: ${rejected.join(', ')}`);
            } else {
                probeOk = true;
                line(OK, `Enviado — messageId=${info.messageId} aceptados=${(info.accepted || []).join(', ') || '(sin lista)'}`);
            }
        } catch (err) {
            probeOk = false;
            const motivo = (err && (err.response || err.message)) || String(err);
            line(BAD, `Rechazado por el servidor — ${motivo}`);
        }
        console.log('');
    } else {
        line(INFO, 'Tip: `reporte-doctor -- --probe tu@correo.cl` hace un ENVÍO real (verify() solo prueba conexión, no entrega).');
        console.log('');
    }

    // ── 3) Destinatarios efectivos ──
    console.log('3) Destinatarios efectivos (suscriptores activos o fallback REPORTE_TO)');
    let recipientsOk = false;
    const pool = mysql.createPool({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'sgdl',
        port: process.env.DB_PORT || 3306,
        charset: 'utf8mb4',
        connectTimeout: 10000,
        connectionLimit: 2,
    });
    try {
        // Conteo de suscriptores activos (tolera tabla inexistente: errno 1146).
        try {
            const [rows] = await pool.query('SELECT COUNT(*) AS n FROM reportes_suscriptores WHERE activo = 1');
            line(INFO, `Suscriptores activos en BD: ${rows[0].n}`);
        } catch (err) {
            if (err && err.errno === 1146) line(INFO, 'Tabla reportes_suscriptores no existe — se usará REPORTE_TO.');
            else throw err;
        }
        const recipients = await reporteService.resolveRecipients(pool);
        recipientsOk = recipients.length > 0;
        line(recipientsOk ? OK : BAD,
            recipientsOk
                ? `${recipients.length} destinatario(s): ${recipients.join(', ')}`
                : 'Sin destinatarios — agrega suscriptores activos o define REPORTE_TO.');
    } catch (err) {
        const detalle = (err && (err.code || err.message)) || String(err);
        line(BAD, `No se pudo resolver destinatarios (¿DB?) — ${detalle}`);
    } finally {
        await pool.end().catch(() => {});
    }
    console.log('');

    // ── Veredicto ── (el probe solo cuenta si se pidió: probeOk===false lo reprueba)
    const allOk = envOk && smtpOk && recipientsOk && probeOk !== false;
    console.log(allOk
        ? `${OK} TODO LISTO — el reporte puede enviarse.${probe ? '' : ' Verificá ENTREGA real con: reporte-doctor -- --probe tu@correo.cl'}`
        : `${BAD} HAY PENDIENTES — revisa los ${BAD} de arriba antes de confiar en el cron.`);
    process.exit(allOk ? 0 : 1);
}

main().catch((err) => {
    console.error('❌ Error inesperado en reporte-doctor:', err && err.message ? err.message : err);
    if (err && err.stack) console.error(err.stack);
    process.exit(1);
});
