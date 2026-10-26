/**
 * Migración 140 (Marcos 2026-10-26): el rol «Administrador» (solo Leonardo desde la 139) se renombra «Coordinador de
 * Obra»: mismo id, mismos permisos, la misma gente. Si ya existiera un «Coordinador de Obra», UPDATE IGNORE salta el
 * renombre y ese rol queda con los permisos del Administrador y Leonardo pasa a él. Re-login, nunca el rol 1.
 * Aquí se cuida el texto del .sql; la corrida real (normal y respaldo, dos veces) fue sobre MySQL 5.7.
 */
const fs = require('fs');
const path = require('path');

const SQL = fs.readFileSync(path.resolve(__dirname, '../db/migrations/140_rol_coordinador_de_obra.sql'), 'utf8');
const sentencias = SQL.split(/\r?\n/).filter(l => !l.trim().startsWith('--')).join('\n');
const lista = sentencias.split(';').map(s => s.trim()).filter(Boolean);

describe('migración 140_rol_coordinador_de_obra.sql', () => {
    test('cinco sentencias, en orden: renombrar → permisos del respaldo → versión → mover a Leonardo', () => {
        expect(lista).toHaveLength(5);
        expect(lista[0]).toMatch(/^UPDATE IGNORE roles\s+SET nombre = 'Coordinador de Obra'/);
        expect(lista[1]).toMatch(/^DELETE pr\s+FROM permisos_rol_v2 pr/);
        expect(lista[2]).toMatch(/^INSERT IGNORE INTO permisos_rol_v2/);
        expect(lista[3]).toMatch(/^UPDATE roles\s+SET version = version \+ 1/);
        expect(lista[4]).toMatch(/^UPDATE usuarios u/);
    });

    test('renombra solo el rol «Administrador» (no RR.HH, Supervisor ni Gerente)', () => {
        expect(lista[0]).toMatch(/WHERE nombre = 'Administrador'$/);
        expect(sentencias).not.toMatch(/'RR\.HH'|'Supervisor'|'Gerente'/);
    });

    test('respaldo: el «Coordinador de Obra» que ya existiera copia exactamente al Administrador', () => {
        for (const s of [lista[1], lista[2]]) {
            expect(s).toMatch(/adm\.nombre = 'Administrador'/);
            expect(s).toMatch(/r\.nombre = 'Coordinador de Obra'/);
        }
        expect(lista[1]).toMatch(/base\.rol_id IS NULL/);
    });

    test('re-login: nunca el rol 1; la subconsulta no lee roles (MySQL 1093); va antes de mover a Leonardo', () => {
        const version = lista[3];
        expect(version).toMatch(/WHERE id <> 1/);
        const sub = version.slice(version.indexOf('SELECT'));
        expect(sub).not.toMatch(/\broles\b/);
        expect(sub).toMatch(/u\.email = 'leonardolopez@lols\.cl'/);
    });

    test('solo Leonardo, por correo, y solo si está en «Administrador»', () => {
        expect(lista[4]).toMatch(/WHERE u\.email = 'leonardolopez@lols\.cl'\s+AND actual\.nombre = 'Administrador'/);
        expect(new Set(SQL.match(/[a-z]+@lols\.cl/g))).toEqual(new Set(['leonardolopez@lols.cl']));
    });

    test('sin DDL (idempotente)', () => {
        expect(sentencias).not.toMatch(/\b(CREATE|ALTER|DROP|TRUNCATE)\b/i);
    });
});
