#!/usr/bin/env node
/**
 * FIX: aplica la migración 060 (bodegas.responsable_nombre) cuando el runner
 * de migraciones la marcó como aplicada en `schema_migrations` pero el SQL
 * nunca se ejecutó realmente.
 *
 * Síntoma que motivó este script: `npm run migrate` reporta
 *   "60 archivos / No hay migraciones pendientes / 60 registradas"
 * pero al editar una bodega la API devuelve 500:
 *   "Unknown column 'responsable_nombre' in 'SET'".
 *
 * Causa probable: schema_migrations llegó al servidor con 060 ya registrada
 * (snapshot, import desde otra BD, o ejecución parcial anterior). El runner
 * confía en esa marca y omite el archivo.
 *
 * Este script ejecuta el SQL idempotentemente, tolera el caso "ya existe la
 * columna" (errno 1060) y refresca el timestamp en schema_migrations.
 *
 * USO: node scripts/fix_bodega_responsable_nombre.js
 *      o desde cPanel: Run JS script → migrate:fix-bodega-responsable → Run
 * Idempotente: correr dos veces es seguro.
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mysql = require('mysql2/promise');

const MIGRATION_NAME = '060_bodegas_responsable_nombre.sql';

async function main() {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        port: process.env.DB_PORT || 3306,
        multipleStatements: false,
        charset: 'utf8mb4',
    });

    console.log('🔧 Fix mig 060: bodegas.responsable_nombre\n');
    console.log(`📦 DB activa: ${process.env.DB_NAME}\n`);

    const start = Date.now();

    // 1. Agregar la columna (idempotente)
    try {
        console.log('🔹 ALTER TABLE bodegas ADD COLUMN responsable_nombre...');
        await conn.query(`
            ALTER TABLE bodegas
              ADD COLUMN responsable_nombre VARCHAR(255) NULL
              AFTER responsable_id
        `);
        console.log('   ✅ Columna agregada.');
    } catch (err) {
        if (err.errno === 1060) { // ER_DUP_FIELDNAME
            console.log('   ⚠️  Columna ya existe — saltando ALTER.');
        } else {
            console.error(`   ❌ Error en ALTER: ${err.message}`);
            await conn.end();
            process.exit(1);
        }
    }

    // 2. Verificar que la columna realmente existe ahora
    const [colCheck] = await conn.query(`
        SELECT COUNT(*) AS n FROM information_schema.columns
        WHERE table_schema = DATABASE()
          AND table_name = 'bodegas'
          AND column_name = 'responsable_nombre'
    `);
    if (colCheck[0].n === 0) {
        console.error('❌ La columna NO existe después del ALTER. Abortando backfill.');
        await conn.end();
        process.exit(1);
    }
    console.log('   ✅ Verificado: la columna existe en bodegas.\n');

    // 3. Backfill desde responsable_id si la columna texto está vacía
    try {
        console.log('🔹 Backfill desde responsable_id...');
        const [result] = await conn.query(`
            UPDATE bodegas b
            LEFT JOIN usuarios u ON u.id = b.responsable_id
            SET b.responsable_nombre = u.nombre
            WHERE b.responsable_id IS NOT NULL
              AND (b.responsable_nombre IS NULL OR b.responsable_nombre = '')
        `);
        console.log(`   ✅ ${result.affectedRows} bodega(s) actualizada(s) con responsable derivado.\n`);
    } catch (err) {
        console.error(`   ❌ Error en backfill: ${err.message}`);
        await conn.end();
        process.exit(1);
    }

    // 4. Asegurar que schema_migrations refleje el estado real
    const totalMs = Date.now() - start;
    const [exists] = await conn.query(
        'SELECT 1 FROM schema_migrations WHERE name = ?',
        [MIGRATION_NAME]
    );
    if (exists.length > 0) {
        await conn.query(
            'UPDATE schema_migrations SET applied_at = NOW(), duration_ms = ? WHERE name = ?',
            [totalMs, MIGRATION_NAME]
        );
        console.log(`🔹 schema_migrations: actualizada entrada existente (duration ${totalMs}ms).`);
    } else {
        await conn.query(
            'INSERT INTO schema_migrations (name, duration_ms) VALUES (?, ?)',
            [MIGRATION_NAME, totalMs]
        );
        console.log(`🔹 schema_migrations: insertada nueva entrada (duration ${totalMs}ms).`);
    }

    // 5. Resumen
    const [rows] = await conn.query(`
        SELECT id, nombre, responsable_nombre FROM bodegas ORDER BY nombre LIMIT 20
    `);
    console.log('\n📋 Estado actual (primeras 20 bodegas):');
    for (const r of rows) {
        const resp = r.responsable_nombre ? ` (${r.responsable_nombre})` : '';
        console.log(`   • [${r.id}] ${r.nombre}${resp}`);
    }

    console.log('\n✅ Fix completo. Probá editar la bodega de nuevo desde la UI.');
    await conn.end();
}

main().catch(err => {
    console.error('❌ Error fatal:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
