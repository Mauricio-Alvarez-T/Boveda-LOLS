/**
 * Migración 147 (Sitio web, plan 4.1): cuatro tablas nuevas y los tres permisos, solo para el rol 1.
 * Aquí se cuida el texto del .sql: idempotente (CREATE TABLE IF NOT EXISTS + INSERT IGNORE), sin DDL que toque
 * tablas existentes, sin GRANT, y los permisos con los MISMOS textos que permisos.config.js (el arranque los
 * sincroniza desde ahí: si difieren, el catálogo cambia de nombre al reiniciar).
 */
const fs = require('fs');
const path = require('path');
const MAESTRO = require('../src/config/permisos.config');

const SQL = fs.readFileSync(path.resolve(__dirname, '../db/migrations/147_sitio_web_obras.sql'), 'utf8');
const sentencias = SQL.split(/\r?\n/).filter(l => !l.trim().startsWith('--')).join('\n');
const lista = sentencias.split(';').map(s => s.trim()).filter(Boolean);
const tabla = (nombre) => lista.find(s => s.startsWith(`CREATE TABLE IF NOT EXISTS ${nombre} `)) || '';

describe('migración 147_sitio_web_obras.sql', () => {
    test('seis sentencias: cuatro CREATE TABLE IF NOT EXISTS y dos INSERT IGNORE', () => {
        expect(lista).toHaveLength(6);
        expect(lista.slice(0, 4).map(s => s.match(/^CREATE TABLE IF NOT EXISTS (\w+)/)?.[1]))
            .toEqual(['sitio_obras', 'sitio_obra_fotos', 'sitio_publicaciones', 'sitio_web_historial']);
        expect(lista[4]).toMatch(/^INSERT IGNORE INTO permisos_catalogo \(clave, modulo, nombre, descripcion, orden\)/);
        expect(lista[5]).toMatch(/^INSERT IGNORE INTO permisos_rol_v2 \(rol_id, permiso_clave\)/);
    });

    test('nada que toque lo existente: sin ALTER, DROP, DELETE, UPDATE, TRUNCATE ni GRANT', () => {
        // «ON DELETE …» de las FK no cuenta: es parte del CREATE.
        expect(sentencias).not.toMatch(/\b(ALTER|DROP|TRUNCATE|GRANT|REVOKE)\b|(?<!ON )\bDELETE\b|\bUPDATE\s+\w+\s+SET\b/i);
    });

    test('los permisos van SOLO al rol 1', () => {
        const roles = [...lista[5].matchAll(/\((\d+),\s*'([^']+)'\)/g)].map(m => [Number(m[1]), m[2]]);
        expect(roles).toEqual([[1, 'sitio_web.ver'], [1, 'sitio_web.editar'], [1, 'sitio_web.publicar']]);
    });

    test('catálogo idéntico a permisos.config.js (clave, módulo, nombre, descripción y orden)', () => {
        const filas = [...lista[4].matchAll(/\('([^']*)',\s*'([^']*)',\s*'([^']*)',\s*'([^']*)',\s*(\d+)\)/g)]
            .map(m => [m[1], m[2], m[3], m[4], Number(m[5])]);
        const delConfig = MAESTRO.filter(p => p[0].startsWith('sitio_web.'));
        expect(filas).toEqual(delConfig);
        expect(filas.map(f => f[0])).toEqual(['sitio_web.ver', 'sitio_web.editar', 'sitio_web.publicar']);
    });

    test('sitio_obras sigue el contrato de lols.cl: dirección y referencia sí; rol, plazo, cifra y video no', () => {
        const t = tabla('sitio_obras');
        for (const c of ['slug', 'direccion', 'referencia', 'superficie_m2 INT', 'incluir', 'publicado_hash', 'publicado_json', 'mandante_autoriza']) {
            expect(t).toContain(c);
        }
        expect(t).not.toMatch(/\b(rol|plazo|cifra_valor|cifra_etiqueta|video)\b/);
        expect(t).toMatch(/UNIQUE KEY uk_sitio_obras_slug \(slug\)/);
        expect(t).toMatch(/UNIQUE KEY uk_sitio_obras_obra \(obra_id\)/);
        expect(t).toMatch(/REFERENCES obras\(id\) ON DELETE SET NULL/);
        // La versión que compara la edición lleva milisegundos.
        expect(t).toMatch(/updated_at DATETIME\(3\) NOT NULL DEFAULT CURRENT_TIMESTAMP\(3\) ON UPDATE CURRENT_TIMESTAMP\(3\)/);
    });

    test('fotos: dos llaves atadas al hash, heredada del sitio y CASCADE con su obra', () => {
        const t = tabla('sitio_obra_fotos');
        for (const c of ['hash CHAR(64) NOT NULL', 'sin_personas_confirmado', 'confirmado_at', 'aprobada_hash CHAR(64)', 'rechazada_at', 'heredada_src', 'ruta VARCHAR(255) NOT NULL']) {
            expect(t).toContain(c);
        }
        expect(t).toMatch(/REFERENCES sitio_obras\(id\) ON DELETE CASCADE/);
    });

    test('publicaciones guardan commit y manifiesto; el modo admite la importación', () => {
        const t = tabla('sitio_publicaciones');
        for (const c of ['commit_sha CHAR(40)', 'manifiesto_previsto', 'manifiesto MEDIUMTEXT', 'obras_json', 'error_codigo', 'build_estado', 'en_linea_at']) {
            expect(t).toContain(c);
        }
        expect(t).toMatch(/modo VARCHAR\(12\)[^,]*importacion/);
    });

    test('ningún COMMENT con punto y coma (el runner y este test parten por «;»)', () => {
        expect(SQL.split(/\r?\n/).filter(l => !l.trim().startsWith('--') && /COMMENT '[^']*;/.test(l))).toEqual([]);
    });
});
