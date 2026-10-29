/**
 * Guard de CI contra prefijos de migración repetidos (plan Sitio web 4.1, 2026-10-29).
 *
 * `migrate.js` aborta TODAS las migraciones si encuentra un prefijo NNN_ repetido fuera de la lista histórica
 * (`findUnexpectedDuplicates`). Eso pasa cuando dos trabajos en paralelo toman el mismo número (la 146 se la
 * llevó otro trabajo mientras se planificaba la 147). Este test lee la carpeta REAL, con el mismo filtro del
 * runner, para que el choque se vea en la suite y no en el deploy.
 */
const { listMigrationFiles, findUnexpectedDuplicates } = require('../scripts/migrate');

describe('db/migrations sin prefijos repetidos', () => {
    const archivos = listMigrationFiles();

    test('el runner ve las migraciones (filtro NNN_*.sql)', () => {
        expect(archivos.length).toBeGreaterThan(100);
        expect(archivos.every(f => /^\d{3}_.+\.sql$/i.test(f))).toBe(true);
        expect(archivos).not.toContain('run_all.sql');
    });

    test('ningún prefijo nuevo repetido (fuera de los 6 históricos)', () => {
        expect(findUnexpectedDuplicates(archivos)).toEqual([]);
    });
});
