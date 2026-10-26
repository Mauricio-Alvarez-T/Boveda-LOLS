/**
 * Migración 142 (Marcos 2026-10-26, vuelta por los perfiles): quita tres permisos heredados al separar los roles.
 *   · `usuarios.ver` (Configuración) de Supervisor de Obra y Prevencionista;
 *   · `costos.gestionar` (Presupuestos) de RR.HH y Coordinador de Obra (quedan Rodrigo y don Luis);
 *   · `trabajadores.financiero.ver` (sueldos) del Coordinador de Obra.
 * Del rol y del permiso propio («grant») de quien hoy está en ese rol; nunca el rol 1. Aquí se cuida el texto del .sql;
 * la corrida real fue sobre MySQL 5.7.
 */
const fs = require('fs');
const path = require('path');

const SQL = fs.readFileSync(path.resolve(__dirname, '../db/migrations/142_ajustes_permisos_por_cargo.sql'), 'utf8');
const sentencias = SQL.split(/\r?\n/).filter(l => !l.trim().startsWith('--')).join('\n');
const lista = sentencias.split(';').map(s => s.trim()).filter(Boolean);

const CASOS = [
    "(r.nombre IN ('Supervisor de Obra', 'Prevencionista') AND {c} = 'usuarios.ver')",
    "(r.nombre IN ('RR.HH', 'Coordinador de Obra') AND {c} = 'costos.gestionar')",
    "(r.nombre = 'Coordinador de Obra' AND {c} = 'trabajadores.financiero.ver')",
];

describe('migración 142_ajustes_permisos_por_cargo.sql', () => {
    test('tres sentencias: del rol, del permiso propio, re-login', () => {
        expect(lista).toHaveLength(3);
        expect(lista[0]).toMatch(/^DELETE pr\s+FROM permisos_rol_v2 pr/);
        expect(lista[1]).toMatch(/^DELETE o\s+FROM permisos_usuario_override o/);
        expect(lista[2]).toMatch(/^UPDATE roles\s+SET version = version \+ 1/);
    });

    test('cada decisión, exactamente, en el rol y en el permiso propio', () => {
        for (const caso of CASOS) {
            expect(lista[0]).toContain(caso.replace('{c}', 'pr.permiso_clave'));
            expect(lista[1]).toContain(caso.replace('{c}', 'o.permiso_clave'));
        }
        // Supervisor (Rodrigo) y Gerente (don Luis) conservan Presupuestos.
        expect(sentencias).not.toMatch(/'Supervisor'(?! de Obra)|'Gerente'/);
    });

    test('solo «grant» y nunca el rol 1', () => {
        expect(lista[1]).toMatch(/o\.tipo = 'grant'/);
        for (const s of lista) expect(s).toMatch(/r\.id <> 1|WHERE id <> 1/);
    });

    test('re-login de los cuatro roles que cambian', () => {
        expect(lista[2]).toMatch(/nombre IN \('Supervisor de Obra', 'Prevencionista', 'RR\.HH', 'Coordinador de Obra'\)/);
    });

    test('sin DDL (idempotente)', () => {
        expect(sentencias).not.toMatch(/\b(CREATE|ALTER|DROP|TRUNCATE)\b/i);
    });
});
