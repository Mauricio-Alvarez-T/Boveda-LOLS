#!/usr/bin/env node
/**
 * Auditoría de períodos Licencia Médica (LM) y celdas FDS mal contadas en Excel mensual.
 *
 * Reporta:
 *  1) Cantidad de períodos LM activos
 *  2) Períodos LM con weekends/feriados dentro (rango >= 4 días)
 *  3) Estimación de FDS mal contados por mes/obra
 *
 * USO:
 *   node scripts/audit_lm_fds.js
 *   node scripts/audit_lm_fds.js --remote     # contra DB prod (lolscl_boveda)
 *   node scripts/audit_lm_fds.js --mes 2026-04
 */
require('dotenv').config({ path: __dirname + '/../.env' });
const mysql = require('mysql2/promise');

const args = process.argv.slice(2);
const useRemote = args.includes('--remote');
const mesIdx = args.indexOf('--mes');
const mesArg = mesIdx >= 0 ? args[mesIdx + 1] : null;

async function main() {
    const conn = await mysql.createConnection(useRemote ? {
        host: 'www.lols.cl',
        user: process.env.DB_REMOTE_USER || 'lolscl_boveda',
        password: process.env.DB_REMOTE_PASSWORD || process.env.DB_PASSWORD,
        database: 'lolscl_boveda',
        port: 3306,
        connectTimeout: 10000,
    } : {
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'sgdl',
        port: process.env.DB_PORT || 3306,
    });

    console.log(`\n🔍 Auditoría LM/FDS — DB: ${useRemote ? 'REMOTE' : 'LOCAL'}\n`);

    // 1. Total períodos LM activos
    const [[t1]] = await conn.query(`
        SELECT COUNT(*) AS total
        FROM periodos_ausencia p
        JOIN estados_asistencia e ON e.id = p.estado_id
        WHERE e.codigo = 'LM' AND p.activo = TRUE
    `);
    console.log(`📋 Períodos LM activos: ${t1.total}`);

    // 2. Períodos LM con rango >= 4 días (probable que incluya weekend)
    const [largos] = await conn.query(`
        SELECT p.id, p.trabajador_id, t.nombre AS trabajador, o.nombre AS obra,
               p.fecha_inicio, p.fecha_fin,
               DATEDIFF(p.fecha_fin, p.fecha_inicio) + 1 AS dias_rango
        FROM periodos_ausencia p
        JOIN estados_asistencia e ON e.id = p.estado_id
        JOIN trabajadores t ON t.id = p.trabajador_id
        LEFT JOIN obras o ON o.id = p.obra_id
        WHERE e.codigo = 'LM' AND p.activo = TRUE
          AND DATEDIFF(p.fecha_fin, p.fecha_inicio) >= 3
        ORDER BY p.fecha_inicio DESC
        LIMIT 30
    `);
    console.log(`\n📅 Períodos LM con ≥4 días (top 30):`);
    if (largos.length === 0) {
        console.log('   (ninguno)');
    } else {
        console.table(largos.map(r => ({
            id: r.id,
            trabajador: r.trabajador,
            obra: r.obra,
            inicio: fmtDate(r.fecha_inicio),
            fin: fmtDate(r.fecha_fin),
            dias: r.dias_rango,
        })));
    }

    // 3. Estimación FDS mal contados: por cada LM activo, contar weekends + feriados en rango
    // Cargar feriados activos
    const [feriados] = await conn.query(`SELECT fecha FROM feriados WHERE activo = TRUE`);
    const feriadosSet = new Set(feriados.map(f => fmtDate(f.fecha)));

    const [todosLM] = await conn.query(`
        SELECT p.trabajador_id, p.fecha_inicio, p.fecha_fin
        FROM periodos_ausencia p
        JOIN estados_asistencia e ON e.id = p.estado_id
        WHERE e.codigo = 'LM' AND p.activo = TRUE
    `);

    let totalFDSenLM = 0;
    let periodosAfectados = 0;
    for (const p of todosLM) {
        const fds = contarFDSenRango(p.fecha_inicio, p.fecha_fin, feriadosSet);
        if (fds > 0) {
            totalFDSenLM += fds;
            periodosAfectados++;
        }
    }

    console.log(`\n📊 Impacto estimado del bug:`);
    console.log(`   - Períodos LM con ≥1 FDS dentro: ${periodosAfectados} de ${todosLM.length}`);
    console.log(`   - Total FDS mal contados (todos los períodos LM): ${totalFDSenLM} días`);

    // 4. Si se especificó --mes, filtrar a ese mes
    if (mesArg && /^\d{4}-\d{2}$/.test(mesArg)) {
        const inicioMes = `${mesArg}-01`;
        const finMes = ultimoDiaMes(mesArg);
        console.log(`\n📆 Filtrado para mes ${mesArg} (${inicioMes} a ${finMes}):`);

        const [delMes] = await conn.query(`
            SELECT p.trabajador_id, t.nombre AS trabajador, p.fecha_inicio, p.fecha_fin
            FROM periodos_ausencia p
            JOIN estados_asistencia e ON e.id = p.estado_id
            JOIN trabajadores t ON t.id = p.trabajador_id
            WHERE e.codigo = 'LM' AND p.activo = TRUE
              AND p.fecha_inicio <= ? AND p.fecha_fin >= ?
        `, [finMes, inicioMes]);

        let totalMes = 0;
        for (const p of delMes) {
            const inicio = maxDate(fmtDate(p.fecha_inicio), inicioMes);
            const fin = minDate(fmtDate(p.fecha_fin), finMes);
            const fds = contarFDSenRango(inicio, fin, feriadosSet);
            totalMes += fds;
        }
        console.log(`   - Períodos LM activos en ${mesArg}: ${delMes.length}`);
        console.log(`   - FDS mal contados en ${mesArg}: ${totalMes} días`);
    }

    await conn.end();
}

function fmtDate(d) {
    if (!d) return '';
    if (typeof d === 'string') return d.split('T')[0];
    return d.toISOString().split('T')[0];
}

function contarFDSenRango(inicio, fin, feriadosSet) {
    const start = new Date(fmtDate(inicio));
    const end = new Date(fmtDate(fin));
    let count = 0;
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dow = d.getDay();
        const fStr = d.toISOString().split('T')[0];
        const isWeekend = dow === 0 || dow === 6;
        const isFeriado = feriadosSet.has(fStr);
        if (isWeekend || isFeriado) count++;
    }
    return count;
}

function ultimoDiaMes(yyyymm) {
    const [y, m] = yyyymm.split('-').map(Number);
    const d = new Date(y, m, 0);
    return d.toISOString().split('T')[0];
}

function maxDate(a, b) { return a > b ? a : b; }
function minDate(a, b) { return a < b ? a : b; }

main().catch(err => {
    console.error('❌ Error:', err.message);
    process.exit(1);
});
