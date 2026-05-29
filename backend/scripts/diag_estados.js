#!/usr/bin/env node
/**
 * Diagnóstico READ-ONLY de estados_asistencia.
 *
 * Contexto: el reporte de WhatsApp clasifica a cada trabajador como "presente"
 * (es_presente=1 → va al desglose por cargo) o "ausencia" (es_presente=0 → va a
 * la sección "AUSENCIAS Y MOVIMIENTOS" con nombre + días + rango de fechas).
 * Si un estado de ausencia (V, F, PSG, LM, DF, NAC, MT, AL, PR) quedó con
 * es_presente=1, ese trabajador se cuenta como presente y NO aparece en la
 * sección de ausencias → es el síntoma reportado en producción.
 *
 * Este script SOLO LEE: imprime la tabla de estados con sus flags y marca los
 * estados de ausencia que tengan es_presente=1 (sospechosos). No modifica nada.
 *
 * USO local:   node scripts/diag_estados.js
 * En cPanel:   Setup Node.js App → Run JS script → diag-estados
 */
require('dotenv').config();
const mysql = require('mysql2/promise');

// Códigos que semánticamente son AUSENCIA (el trabajador NO estuvo físicamente
// presente). Todos estos DEBERÍAN tener es_presente = 0.
const AUSENCIA_CODES = ['F', 'V', 'LM', 'PSG', 'DF', 'NAC', 'MT', 'AL', 'PR', 'NC', 'DEF', 'MAT'];

async function main() {
    const pool = mysql.createPool({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'sgdl',
        port: process.env.DB_PORT || 3306,
        charset: 'utf8mb4',
        connectTimeout: 10000,
        connectionLimit: 3,
    });

    try {
        const [rows] = await pool.query(
            `SELECT id, codigo, nombre, es_presente, cuenta_dia_trabajado, activo
             FROM estados_asistencia
             ORDER BY codigo`
        );

        console.log(`\n📋 estados_asistencia (${rows.length} filas) — BD: ${process.env.DB_NAME}\n`);
        console.log('  ID  CÓDIGO  PRESENTE  DÍA_TRAB  ACTIVO  NOMBRE');
        console.log('  ──  ──────  ────────  ────────  ──────  ────────────────────');

        const sospechosos = [];
        for (const r of rows) {
            const pres = Number(r.es_presente);
            const esAusencia = AUSENCIA_CODES.includes(r.codigo);
            // Sospechoso: estado de ausencia marcado como presente (y activo).
            const flag = (esAusencia && pres === 1 && Number(r.activo) === 1) ? '  ⚠️ <- ES PRUEBA: debería ser 0' : '';
            if (flag) sospechosos.push(r.codigo);

            const id = String(r.id).padStart(4);
            const cod = String(r.codigo || '').padEnd(6);
            const p = String(pres).padStart(8);
            const d = String(Number(r.cuenta_dia_trabajado)).padStart(8);
            const a = String(Number(r.activo)).padStart(6);
            console.log(`  ${id}  ${cod}  ${p}  ${d}  ${a}  ${r.nombre}${flag}`);
        }

        console.log('');
        if (sospechosos.length > 0) {
            console.log(`🔴 PROBLEMA DETECTADO: estado(s) de ausencia con es_presente=1 → ${sospechosos.join(', ')}`);
            console.log('   Estos trabajadores se cuentan como PRESENTES y desaparecen de la');
            console.log('   sección "AUSENCIAS Y MOVIMIENTOS" del reporte de WhatsApp.');
            console.log('   Fix sugerido (próxima ronda): UPDATE estados_asistencia SET es_presente = 0');
            console.log(`   WHERE codigo IN (${sospechosos.map(c => `'${c}'`).join(', ')});`);
        } else {
            console.log('✅ Ningún estado de ausencia tiene es_presente=1. La causa estaría en otro lado.');
        }
        console.log('');
    } finally {
        await pool.end().catch(() => {});
    }
}

main().catch((err) => {
    console.error('❌ Error en diagnóstico:', err && err.message ? err.message : err);
    if (err && err.stack) console.error(err.stack);
    process.exit(1);
});

process.on('unhandledRejection', (reason) => {
    console.error('❌ Unhandled rejection:', reason);
    process.exit(1);
});
