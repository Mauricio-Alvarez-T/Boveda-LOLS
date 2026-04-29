#!/usr/bin/env node
/**
 * Reconciliación de stock para transferencias legacy (Ola 2).
 *
 * Contexto: hasta Ola 1, el stock del origen se decrementaba al aprobar. En
 * Ola 2 pasa a decrementarse al recibir. Transferencias que al momento del
 * deploy estaban en estado 'aprobada' o 'en_transito' YA descontaron stock
 * bajo el régimen viejo — si al recibirse bajo el nuevo código el servicio
 * intenta descontar de nuevo, se duplicaría el decremento.
 *
 * Este script:
 *   1. Busca transferencias con `stock_reconciliado = FALSE` y estado
 *      aprobada|en_transito.
 *   2. Re-incrementa el stock origen con lo que se había descontado
 *      (usando transferencia_item_origenes como fuente de verdad; fallback
 *      a transferencia_items.origen_* si no hay splits).
 *   3. Flipa `stock_reconciliado = TRUE` para evitar re-ejecución.
 *   4. Tras esto, al recibirse la transferencia el servicio nuevo descontará
 *      origen + incrementará destino → neto correcto.
 *
 * USO: node scripts/fix_stock_transferencias_aprobadas.js
 * IDEMPOTENTE: seguro de correr múltiples veces. Solo procesa filas con
 * stock_reconciliado=FALSE.
 *
 * Ejecutar UNA vez en staging y UNA vez en producción después de aplicar
 * la migración 036.
 */
require('dotenv').config();
const mysql = require('mysql2/promise');

async function main() {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
    });

    try {
        // Verificar que la columna exista (migración 036 ya aplicada)
        const [cols] = await conn.query(
            `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = 'transferencias'
               AND COLUMN_NAME = 'stock_reconciliado'`
        );
        if (!cols[0].c) {
            console.error('ERROR: columna transferencias.stock_reconciliado no existe. Corre la migración 036 antes.');
            process.exit(1);
        }

        const [pending] = await conn.query(
            `SELECT id, codigo, estado, origen_obra_id, origen_bodega_id
             FROM transferencias
             WHERE stock_reconciliado = FALSE
               AND estado IN ('aprobada', 'en_transito')
             ORDER BY id`
        );

        console.log(`Encontradas ${pending.length} transferencias para reconciliar.`);
        if (pending.length === 0) {
            console.log('Nada que hacer. Saliendo.');
            return;
        }

        let ok = 0;
        let fail = 0;

        for (const trf of pending) {
            try {
                await conn.beginTransaction();

                const [items] = await conn.query(
                    `SELECT id, item_id, cantidad_enviada, origen_obra_id, origen_bodega_id
                     FROM transferencia_items WHERE transferencia_id = ?`,
                    [trf.id]
                );

                for (const item of items) {
                    const [splits] = await conn.query(
                        `SELECT origen_obra_id, origen_bodega_id, cantidad_enviada
                         FROM transferencia_item_origenes WHERE transferencia_item_id = ?`,
                        [item.id]
                    );

                    if (splits.length > 0) {
                        for (const s of splits) {
                            if (s.cantidad_enviada > 0) {
                                await conn.query(
                                    `INSERT INTO ubicaciones_stock (item_id, obra_id, bodega_id, cantidad)
                                     VALUES (?, ?, ?, ?)
                                     ON DUPLICATE KEY UPDATE cantidad = cantidad + VALUES(cantidad)`,
                                    [item.item_id, s.origen_obra_id, s.origen_bodega_id, s.cantidad_enviada]
                                );
                            }
                        }
                    } else if ((item.cantidad_enviada || 0) > 0) {
                        const obraId = item.origen_obra_id ?? trf.origen_obra_id;
                        const bodegaId = item.origen_bodega_id ?? trf.origen_bodega_id;
                        await conn.query(
                            `INSERT INTO ubicaciones_stock (item_id, obra_id, bodega_id, cantidad)
                             VALUES (?, ?, ?, ?)
                             ON DUPLICATE KEY UPDATE cantidad = cantidad + VALUES(cantidad)`,
                            [item.item_id, obraId, bodegaId, item.cantidad_enviada]
                        );
                    }
                }

                await conn.query(
                    `UPDATE transferencias SET stock_reconciliado = TRUE WHERE id = ?`,
                    [trf.id]
                );

                await conn.commit();
                ok++;
                console.log(`  ✓ ${trf.codigo} (id=${trf.id}, estado=${trf.estado}) — reconciliada`);
            } catch (err) {
                await conn.rollback();
                fail++;
                console.error(`  ✗ ${trf.codigo} (id=${trf.id}) — ERROR: ${err.message}`);
            }
        }

        console.log(`\nReconciliación completa: ${ok} OK, ${fail} fallidas.`);
        if (fail > 0) process.exit(2);
    } finally {
        await conn.end();
    }
}

main().catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
});
