#!/usr/bin/env node
/**
 * FIX PRODUCCIÓN: Ejecuta migraciones 017-025 que el bootstrap saltó incorrectamente.
 *
 * El bootstrap asumió que todas las migraciones hasta 023 ya estaban en la BD,
 * pero producción no tenía las tablas de inventario (017-023).
 *
 * USO: node scripts/fix_prod_migrations.js
 * EJECUTAR SOLO UNA VEZ en producción.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'db', 'migrations');

// Migraciones que el bootstrap marcó pero NO ejecutó
const MISSING = [
    '017_inventario_base.sql',
    '018_inventario_transferencias.sql',
    '019_inventario_facturas.sql',
    '020_inventario_bombas.sql',
    '021_inventario_discrepancias.sql',
    '022_inventario_permisos_seed.sql',
    '023_items_imagen.sql',
    '024_transferencia_discrepancias.sql',
    '025_asistencia_performance_indexes.sql',
];

async function main() {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        port: process.env.DB_PORT || 3306,
        multipleStatements: true,
        charset: 'utf8mb4',
    });

    console.log('🔧 Fix producción: ejecutando migraciones faltantes de inventario\n');

    for (const file of MISSING) {
        const filePath = path.join(MIGRATIONS_DIR, file);
        if (!fs.existsSync(filePath)) {
            console.error(`❌ Archivo no encontrado: ${file}`);
            process.exit(1);
        }

        const sql = fs.readFileSync(filePath, 'utf8').trim();
        if (!sql) continue;

        console.log(`🔹 Ejecutando ${file}...`);
        const start = Date.now();
        try {
            await conn.query(sql);
            const ms = Date.now() - start;
            // Marcar como aplicada en schema_migrations. INSERT ... ON DUPLICATE
            // cubre el caso en que el bootstrap incorrecto NO la haya
            // pre-marcado (024/025+) y también cuando sí (017-023).
            await conn.query(
                `INSERT INTO schema_migrations (name, applied_at, duration_ms)
                 VALUES (?, NOW(), ?)
                 ON DUPLICATE KEY UPDATE applied_at = VALUES(applied_at), duration_ms = VALUES(duration_ms)`,
                [file, ms]
            );
            console.log(`   ✅ OK (${ms}ms)`);
        } catch (err) {
            // Errores idempotentes esperables — schema ya tiene el cambio
            // aplicado manualmente o por bootstrap incorrecto. Marcar la
            // migración como aplicada igual y continuar con la siguiente.
            const idempotentErrors = {
                1050: 'Tabla ya existe',          // ER_TABLE_EXISTS_ERROR
                1060: 'Columna ya existe',        // ER_DUP_FIELDNAME
                1061: 'Índice ya existe',         // ER_DUP_KEYNAME
                1062: 'Registro ya insertado',    // ER_DUP_ENTRY
                1826: 'FK ya existe',             // ER_FK_DUP_NAME
            };
            if (idempotentErrors[err.errno]) {
                console.log(`   ⚠️  ${idempotentErrors[err.errno]}, saltando y marcando como aplicada: ${err.message}`);
                // Marcar como aplicada para que `migrate` no la re-intente
                await conn.query(
                    `INSERT INTO schema_migrations (name, applied_at, duration_ms)
                     VALUES (?, NOW(), 0)
                     ON DUPLICATE KEY UPDATE applied_at = VALUES(applied_at)`,
                    [file]
                );
                continue;
            }
            console.error(`   ❌ Error: ${err.message}`);
            await conn.end();
            process.exit(1);
        }
    }

    console.log('\n✅ Todas las migraciones faltantes aplicadas correctamente.');
    await conn.end();
}

main().catch(err => {
    console.error('❌ Error fatal:', err.message);
    process.exit(1);
});
