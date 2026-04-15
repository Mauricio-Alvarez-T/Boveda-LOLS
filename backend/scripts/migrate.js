/**
 * ============================================================
 *  RUNNER DE MIGRACIONES — Boveda LOLS
 * ============================================================
 *
 *  ¿Cómo usarlo?
 *    Localmente:   npm run migrate
 *    En cPanel:    Node.js app → Run JS script → "migrate" → Run
 *
 *  ¿Cómo agregar una nueva migración?
 *    1. Crea un archivo numerado en:
 *         backend/db/migrations/NNN_descripcion.sql
 *       donde NNN es el siguiente número disponible (025, 026, …).
 *    2. Commit + push. Cuando el código llegue al servidor,
 *       simplemente corre "migrate" desde cPanel.
 *    3. El runner detectará los archivos nuevos, los ejecutará
 *       en orden, y los marcará como aplicados en
 *       `schema_migrations` para que no se repitan.
 *
 *  Reglas para escribir migraciones nuevas (importante):
 *    ✔ Usar `CREATE TABLE IF NOT EXISTS`
 *    ✔ Usar `ADD COLUMN IF NOT EXISTS` (MySQL 8+)
 *    ✔ Usar `INSERT IGNORE` o `ON DUPLICATE KEY UPDATE` para seeds
 *    ✔ Evitar `DELETE FROM` / `DROP` sin `IF EXISTS`
 *    Razón: si algo falla a mitad de camino, queremos poder
 *    re-correrlas sin miedo.
 *
 *  Bootstrap en BD ya existente:
 *    Si detecta que la BD ya está poblada (tabla `usuarios`
 *    existe) pero `schema_migrations` no existe, marca las
 *    migraciones 001–024 como aplicadas sin ejecutarlas.
 *    A partir de la 025 todo corre normal.
 * ============================================================
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const MIGRATIONS_DIR = path.resolve(__dirname, '../db/migrations');
const BOOTSTRAP_CUTOFF = '024'; // migraciones ≤ esta se marcan como aplicadas en BD existente

/* ──────────────────────── helpers ──────────────────────── */

const log = {
    info: (msg) => console.log(`ℹ️  ${msg}`),
    ok:   (msg) => console.log(`✅ ${msg}`),
    warn: (msg) => console.log(`⚠️  ${msg}`),
    err:  (msg) => console.error(`❌ ${msg}`),
    step: (msg) => console.log(`\n🔹 ${msg}`),
};

function listMigrationFiles() {
    return fs.readdirSync(MIGRATIONS_DIR)
        .filter(f => /^\d{3}_.+\.sql$/i.test(f))  // solo NNN_xxx.sql
        .sort();  // 001, 002, ..., 099 alfabético
}

function getMigrationNumber(filename) {
    const match = filename.match(/^(\d{3})_/);
    return match ? match[1] : null;
}

async function ensureSchemaMigrationsTable(conn) {
    await conn.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
            name VARCHAR(255) NOT NULL PRIMARY KEY,
            applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            duration_ms INT DEFAULT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
}

async function isExistingDatabase(conn) {
    // Si la tabla `usuarios` ya existe, asumimos que es una BD en uso
    const [rows] = await conn.query(`
        SELECT COUNT(*) AS n
        FROM information_schema.tables
        WHERE table_schema = DATABASE() AND table_name = 'usuarios'
    `);
    return rows[0].n > 0;
}

async function getAppliedMigrations(conn) {
    const [rows] = await conn.query('SELECT name FROM schema_migrations');
    return new Set(rows.map(r => r.name));
}

async function bootstrapExistingDatabase(conn, files) {
    const toMark = files.filter(f => {
        const num = getMigrationNumber(f);
        return num && num <= BOOTSTRAP_CUTOFF;
    });
    if (toMark.length === 0) return;

    log.warn(`BD existente detectada. Marcando ${toMark.length} migraciones como aplicadas sin ejecutarlas (bootstrap).`);
    for (const f of toMark) {
        await conn.query(
            'INSERT IGNORE INTO schema_migrations (name, duration_ms) VALUES (?, 0)',
            [f]
        );
    }
    log.ok(`Bootstrap completo. Solo se ejecutarán migraciones posteriores a ${BOOTSTRAP_CUTOFF}.`);
}

async function applyMigration(conn, file) {
    const full = path.join(MIGRATIONS_DIR, file);
    const sql = fs.readFileSync(full, 'utf8');

    // Omitir archivos vacíos o solo con comentarios
    const meaningful = sql
        .split('\n')
        .filter(l => l.trim() && !l.trim().startsWith('--'))
        .join('\n')
        .trim();
    if (!meaningful) {
        log.warn(`${file} está vacía/sin SQL — marcando como aplicada sin ejecutar.`);
        await conn.query('INSERT INTO schema_migrations (name, duration_ms) VALUES (?, 0)', [file]);
        return;
    }

    log.step(`Aplicando ${file}…`);
    const t0 = Date.now();
    try {
        await conn.query(sql);
        const duration = Date.now() - t0;
        await conn.query(
            'INSERT INTO schema_migrations (name, duration_ms) VALUES (?, ?)',
            [file, duration]
        );
        log.ok(`${file} aplicada (${duration}ms)`);
    } catch (err) {
        log.err(`Falló ${file}: ${err.message}`);
        throw err;
    }
}

async function runMaintenanceTasks(conn) {
    log.step('Ejecutando tareas de mantenimiento idempotentes…');

    // a) columna fecha_desvinculacion en trabajadores
    await conn.query(`ALTER TABLE trabajadores ADD COLUMN IF NOT EXISTS fecha_desvinculacion DATE NULL DEFAULT NULL`);

    // b) versioning en roles
    await conn.query(`ALTER TABLE roles ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1`);

    // c) permiso trabajadores.depurar (ex purgar)
    await conn.query(`
        INSERT IGNORE INTO permisos_catalogo (clave, modulo, nombre, descripcion, orden)
        VALUES ('trabajadores.depurar', 'Trabajadores', 'Depurar Trabajador',
                'Eliminar permanentemente trabajadores finiquitados', 6)
    `);
    await conn.query(`UPDATE permisos_rol_v2 SET permiso_clave = 'trabajadores.depurar' WHERE permiso_clave = 'trabajadores.purgar'`);
    await conn.query(`UPDATE permisos_usuario_override SET permiso_clave = 'trabajadores.depurar' WHERE permiso_clave = 'trabajadores.purgar'`);
    await conn.query(`DELETE FROM permisos_catalogo WHERE clave = 'trabajadores.purgar'`);

    log.ok('Esquema verificado');

    // d) sincronizar catálogo maestro de permisos
    try {
        const permisosService = require('../src/services/permisos.service');
        await permisosService.syncCatalogoEnArranque();
        log.ok('Catálogo de permisos sincronizado');
    } catch (err) {
        log.warn(`No se pudo sincronizar catálogo de permisos: ${err.message}`);
    }
}

/* ──────────────────────── main ──────────────────────── */

(async () => {
    log.info('🚀 Iniciando runner de migraciones…');

    if (!fs.existsSync(MIGRATIONS_DIR)) {
        log.err(`No existe el directorio ${MIGRATIONS_DIR}`);
        process.exit(1);
    }

    const conn = await mysql.createConnection({
        host:     process.env.DB_HOST || 'localhost',
        user:     process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'sgdl',
        port:     process.env.DB_PORT || 3306,
        multipleStatements: true,  // necesario: los .sql tienen múltiples statements
        charset: 'utf8mb4',
    });

    try {
        const files = listMigrationFiles();
        log.info(`Encontrados ${files.length} archivos en db/migrations/`);

        // 1. Asegurar tabla de control
        const schemaExisted = (await conn.query(`
            SELECT COUNT(*) AS n FROM information_schema.tables
            WHERE table_schema = DATABASE() AND table_name = 'schema_migrations'
        `))[0][0].n > 0;

        await ensureSchemaMigrationsTable(conn);

        // 2. Primera vez en BD con datos → bootstrap
        if (!schemaExisted && await isExistingDatabase(conn)) {
            await bootstrapExistingDatabase(conn, files);
        }

        // 3. Aplicar migraciones pendientes
        const applied = await getAppliedMigrations(conn);
        const pending = files.filter(f => !applied.has(f));

        if (pending.length === 0) {
            log.ok('No hay migraciones pendientes.');
        } else {
            log.info(`${pending.length} migración(es) pendiente(s): ${pending.join(', ')}`);
            for (const f of pending) {
                await applyMigration(conn, f);
            }
        }

        // 4. Tareas de mantenimiento
        await runMaintenanceTasks(conn);

        // 5. Resumen final
        const [total] = await conn.query('SELECT COUNT(*) AS n FROM schema_migrations');
        log.ok(`🎉 Base de datos al día. ${total[0].n} migraciones registradas.`);

    } catch (err) {
        log.err(`Proceso abortado: ${err.message}`);
        if (err.stack) console.error(err.stack);
        process.exit(1);
    } finally {
        await conn.end();
        process.exit(0);
    }
})();
