#!/usr/bin/env node
/**
 * Snapshot diario de KPIs del Resumen Ejecutivo.
 *
 * Contexto: Sprint 3 roadmap Resumen Ejecutivo (Fase 2.3 + 2.4). Graba los
 * 5 KPIs del dashboard en `dashboard_kpi_snapshots` para alimentar:
 *   - Sparklines (últimos 7 días).
 *   - Comparativa vs mes anterior.
 *
 * Corre vía cron diario (00:05 server time). Idempotente: la PK (fecha, kpi)
 * + INSERT ... ON DUPLICATE KEY UPDATE permite re-correr sin duplicar.
 *
 * USO:
 *   node scripts/snapshot_dashboard.js            # Snapshot de hoy
 *   node scripts/snapshot_dashboard.js 2026-04-23 # Snapshot de fecha específica
 *
 * En cPanel: Cron Jobs → "00 05 * * *" →
 *   cd ~/test-boveda && /usr/bin/node scripts/snapshot_dashboard.js
 */
require('dotenv').config();
const mysql = require('mysql2/promise');

// Timeout por query (ms). Si una query tarda más, abortamos para no bloquear el cron.
const QUERY_TIMEOUT_MS = Number(process.env.SNAPSHOT_QUERY_TIMEOUT_MS) || 30000;

// Wrap pool.query en una carrera contra un timeout. Si el timeout dispara primero
// rechaza con un Error etiquetado para que el catch global pueda distinguirlo.
function queryWithTimeout(pool, sql, params = []) {
    return Promise.race([
        pool.query(sql, params),
        new Promise((_, reject) =>
            setTimeout(
                () => reject(new Error(`Query timeout (>${QUERY_TIMEOUT_MS}ms): ${sql.slice(0, 80).replace(/\s+/g, ' ').trim()}…`)),
                QUERY_TIMEOUT_MS
            )
        ),
    ]);
}

async function main() {
    const fechaArg = process.argv[2];
    const fecha = fechaArg || new Date().toISOString().slice(0, 10);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
        console.error(`❌ Fecha inválida: "${fecha}". Usa formato YYYY-MM-DD.`);
        process.exit(1);
    }

    console.log(`📊 Snapshot dashboard KPIs para ${fecha}...`);

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
        const [
            [pendientesRows],
            [transitoRows],
            [estancadosRows],
            [discrepRows],
            [valorRows],
        ] = await Promise.all([
            queryWithTimeout(pool, "SELECT COUNT(*) as count FROM transferencias WHERE activo = 1 AND estado = 'pendiente'"),
            queryWithTimeout(pool, "SELECT COUNT(*) as count FROM transferencias WHERE activo = 1 AND estado = 'en_transito'"),
            queryWithTimeout(pool, `
                SELECT COUNT(*) as count
                FROM transferencias
                WHERE activo = 1 AND estado = 'en_transito'
                  AND DATEDIFF(NOW(), fecha_despacho) >= 7
            `),
            queryWithTimeout(pool, `
                SELECT COUNT(DISTINCT d.transferencia_id) as count
                FROM transferencia_discrepancias d
                JOIN transferencias t ON t.id = d.transferencia_id
                WHERE t.activo = 1 AND d.estado = 'pendiente'
            `),
            queryWithTimeout(pool, `
                SELECT COALESCE(SUM(neto), 0) as valor_total FROM (
                    SELECT o.id,
                           COALESCE(SUM(us.cantidad * COALESCE(us.valor_arriendo_override, i.valor_arriendo)), 0)
                               * (1 - COALESCE(d.porcentaje, 0) / 100) AS neto
                    FROM obras o
                    LEFT JOIN ubicaciones_stock us ON us.obra_id = o.id
                    LEFT JOIN items_inventario i ON i.id = us.item_id AND i.activo = 1
                    LEFT JOIN descuentos_obra d ON d.obra_id = o.id
                    WHERE o.activa = 1 AND o.participa_inventario = 1
                    GROUP BY o.id, d.porcentaje
                ) sub
            `),
        ]);

        const kpis = {
            pendientes: Number(pendientesRows[0]?.count) || 0,
            en_transito: Number(transitoRows[0]?.count) || 0,
            estancados: Number(estancadosRows[0]?.count) || 0,
            discrepancias: Number(discrepRows[0]?.count) || 0,
            valor_obras: Number(valorRows[0]?.valor_total) || 0,
        };

        console.log('  KPIs:', kpis);

        for (const [kpi, valor] of Object.entries(kpis)) {
            await queryWithTimeout(
                pool,
                `INSERT INTO dashboard_kpi_snapshots (fecha, kpi, valor)
                 VALUES (?, ?, ?)
                 ON DUPLICATE KEY UPDATE valor = VALUES(valor), updated_at = CURRENT_TIMESTAMP`,
                [fecha, kpi, valor]
            );
        }

        console.log(`✅ Snapshot ${fecha} guardado (5 KPIs).`);
    } finally {
        await pool.end().catch(() => {}); // No bloquear el exit code si el pool falla cerrando
    }
}

// Catch-all global: cualquier error (timeout, conexión, query) propaga exit(1)
// para que cron de cPanel lo detecte y alerte por mail.
main().catch((err) => {
    console.error('❌ Error creando snapshot:', err && err.message ? err.message : err);
    if (err && err.stack) console.error(err.stack);
    process.exit(1);
});

// Última línea de defensa: rejections no atadas a la promesa de main().
process.on('unhandledRejection', (reason) => {
    console.error('❌ Unhandled rejection:', reason);
    process.exit(1);
});
