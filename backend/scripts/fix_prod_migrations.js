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
            // Actualizar schema_migrations con el tiempo real de ejecución
            await conn.query(
                `UPDATE schema_migrations SET applied_at = NOW(), duration_ms = ? WHERE name = ?`,
                [ms, file]
            );
            console.log(`   ✅ OK (${ms}ms)`);
        } catch (err) {
            // Si la tabla ya existe, continuar
            if (err.errno === 1050) { // ER_TABLE_EXISTS_ERROR
                console.log(`   ⚠️  Tabla ya existe, saltando: ${err.message}`);
                continue;
            }
            // Si el índice ya existe, continuar
            if (err.errno === 1061) { // ER_DUP_KEYNAME
                console.log(`   ⚠️  Índice ya existe, saltando: ${err.message}`);
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
