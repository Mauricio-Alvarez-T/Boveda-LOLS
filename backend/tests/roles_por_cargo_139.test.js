/**
 * Migración 139 (decisión del dueño 2026-10-26): un rol por cargo y «Super Administrador» solo para Marcos y Mauricio.
 *   · Oficina por CORREO: Leonardo → Administrador; Paula, Matías, Daphne → RR.HH; Rodrigo → Supervisor; Luis → Gerente.
 *   · Terreno solo desde «En Terreno»: Cristoffer Bolados, Héctor Gómez, Jhoan Vásquez → Prevencionista; el resto de la
 *     lista → Supervisor de Obra.
 *   · Permisos: oficina = Administrador (Gerente + inicio.gerencia); terreno = En Terreno.
 *   · Re-login: versión + 1 del rol que cada persona deja (la subconsulta lee la tabla temporal, no roles: MySQL 1093).
 * Aquí se cuida el texto del .sql (como la prueba de la 137); la corrida real, dos veces, fue sobre MySQL 5.7.
 */
const fs = require('fs');
const path = require('path');

const SQL = fs.readFileSync(path.resolve(__dirname, '../db/migrations/139_roles_por_cargo.sql'), 'utf8');
const sentencias = SQL.split(/\r?\n/).filter(l => !l.trim().startsWith('--')).join('\n');
const lista = sentencias.split(';').map(s => s.trim()).filter(Boolean);
const buscar = (re) => {
    const i = lista.findIndex(s => re.test(s));
    if (i < 0) throw new Error(`no está la sentencia ${re}`);
    return i;
};

const OFICINA = {
    'leonardolopez@lols.cl': 'Administrador',
    'paulamartinez@lols.cl': 'RR.HH',
    'matiasmillanao@lols.cl': 'RR.HH',
    'daphnelazcano@lols.cl': 'RR.HH',
    'rodrigoriquelme@lols.cl': 'Supervisor',
    'luislazcano@lols.cl': 'Gerente',
};
const TERRENO = ['alfonsocastilla@lols.cl', 'francogutierrez@lols.cl', 'hectorherrera@lols.cl',
    'hectorgomez@lols.cl', 'jhoanvasquez@lols.cl'];

describe('migración 139_roles_por_cargo.sql', () => {
    test('crea los cinco roles sin pisar uno que ya exista', () => {
        const roles = lista[buscar(/^INSERT IGNORE INTO roles/)];
        for (const n of ['RR.HH', 'Supervisor', 'Gerente', 'Supervisor de Obra', 'Prevencionista']) {
            expect(roles).toContain(`('${n}',`);
        }
        expect(sentencias).not.toMatch(/Super Administrador'/);
    });

    test('oficina: cada correo a su rol, de cualquier rol de origen', () => {
        const oficina = lista[buscar(/CASE u\.email/)];
        for (const [correo, rol] of Object.entries(OFICINA)) {
            expect(oficina).toMatch(new RegExp(`WHEN '${correo.replace(/\./g, '\\.')}'\\s+THEN '${rol.replace(/\./g, '\\.')}'`));
        }
        expect(oficina).not.toMatch(/actual\.nombre/);
    });

    test('terreno: solo quien hoy está en «En Terreno»; prevencionistas = Héctor Gómez, Jhoan Vásquez y Bolados', () => {
        const terreno = lista[buscar(/actual\.nombre = 'En Terreno'/)];
        for (const correo of TERRENO) expect(terreno).toContain(`'${correo}'`);
        expect(terreno).toMatch(/WHEN u\.email IN \('hectorgomez@lols\.cl', 'jhoanvasquez@lols\.cl'\) OR u\.nombre LIKE '%Bolados%'\s+THEN 'Prevencionista'/);
        expect(terreno).toMatch(/ELSE 'Supervisor de Obra'/);
        for (const apellido of ['%Escobar%', '%Man_illa%', '%Bolados%']) expect(terreno).toContain(`LIKE '${apellido}'`);
    });

    test('nadie más: solo esos correos y nunca los de Marcos o Mauricio', () => {
        const correos = new Set(SQL.match(/[a-z]+@lols\.cl/g) || []);
        expect(correos).toEqual(new Set([...Object.keys(OFICINA), ...TERRENO]));
    });

    test('permisos: oficina copia el Administrador (Gerente + inicio.gerencia); terreno copia En Terreno', () => {
        const oficina = lista.filter(s => /adm\.nombre = 'Administrador'/.test(s));
        expect(oficina).toHaveLength(2); // borrar lo que sobra + copiar
        for (const s of oficina) expect(s).toMatch(/r\.nombre IN \('RR\.HH', 'Supervisor', 'Gerente'\)/);
        expect(oficina[0]).toMatch(/NOT \(r\.nombre = 'Gerente' AND pr\.permiso_clave = 'inicio\.gerencia'\)/);
        expect(lista[buscar(/p\.clave = 'inicio\.gerencia'/)]).toMatch(/WHERE r\.nombre = 'Gerente'/);
        const terreno = lista.filter(s => /terreno\.nombre = 'En Terreno'/.test(s));
        expect(terreno).toHaveLength(2);
        for (const s of terreno) expect(s).toMatch(/r\.nombre IN \('Supervisor de Obra', 'Prevencionista'\)/);
    });

    test('orden: lista → quitar a quien ya está → re-login → cambio → sueldo propio → borrar la lista', () => {
        const crear = buscar(/^CREATE TEMPORARY TABLE _mig139_destino/);
        const oficina = buscar(/CASE u\.email/);
        const terreno = buscar(/actual\.nombre = 'En Terreno'/);
        const yaEsta = buscar(/^DELETE FROM _mig139_destino\s+WHERE rol_anterior = rol_nuevo/);
        const version = buscar(/^UPDATE roles\s+SET version = version \+ 1/);
        const cambio = buscar(/^UPDATE usuarios u\s+JOIN _mig139_destino/);
        const sueldo = buscar(/'cargos\.sueldo\.ver', 'grant'/);
        const borrar = lista.length - 1;
        expect([crear, oficina, terreno, yaEsta, version, cambio, sueldo, borrar])
            .toEqual([...[crear, oficina, terreno, yaEsta, version, cambio, sueldo, borrar]].sort((a, b) => a - b));
        expect(lista[borrar]).toMatch(/^DROP TEMPORARY TABLE IF EXISTS _mig139_destino$/);
    });

    test('re-login: el rol que dejan y los cinco nuevos; la subconsulta no lee roles (MySQL 1093)', () => {
        const version = lista[buscar(/^UPDATE roles\s+SET version = version \+ 1/)];
        const sub = version.slice(version.indexOf('SELECT'), version.indexOf(')'));
        expect(sub).toMatch(/FROM _mig139_destino/);
        expect(sub).not.toMatch(/\broles\b/);
        expect(version).toMatch(/OR nombre IN \('RR\.HH', 'Supervisor', 'Gerente', 'Supervisor de Obra', 'Prevencionista'\)/);
    });

    test('sueldo propio solo para roles de oficina que ven Configuración, sin pisar (ni un deny)', () => {
        const sueldo = lista[buscar(/'cargos\.sueldo\.ver', 'grant'/)];
        expect(sueldo).toMatch(/^INSERT IGNORE INTO permisos_usuario_override/);
        expect(sueldo).toMatch(/r\.nombre IN \('Administrador', 'RR\.HH', 'Supervisor', 'Gerente'\)/);
        expect(sueldo).toMatch(/'usuarios\.ver' AND o\.tipo = 'grant'/);
        expect(sueldo).toMatch(/NOT EXISTS[\s\S]*'usuarios\.ver' AND o\.tipo = 'deny'/);
    });

    test('solo DDL de la tabla temporal (idempotente)', () => {
        const ddl = sentencias.match(/\b(CREATE|ALTER|DROP|TRUNCATE)\b[^;]*/gi) || [];
        expect(ddl.map(s => s.split('(')[0].trim().replace(/\s+/g, ' '))).toEqual([
            'DROP TEMPORARY TABLE IF EXISTS _mig139_destino',
            'CREATE TEMPORARY TABLE _mig139_destino',
            'DROP TEMPORARY TABLE IF EXISTS _mig139_destino',
        ]);
    });
});
