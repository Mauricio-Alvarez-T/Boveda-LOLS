/**
 * Migración 137 (decisiones del dueño 2026-10-26):
 *   · «Ver Parámetros de Sueldo» (`cargos.sueldo.ver`) sale del rol «Administrador»; quien ve Configuración
 *     (`usuarios.ver`, sin «deny») lo conserva como permiso PROPIO, y eso se hace ANTES de borrarlo del rol.
 *   · «Cancelar en tránsito» como permiso propio de Leonardo y Daphne (por correo).
 *   · Re-login: roles.version + 1 del Administrador y del rol de ellos, nunca el rol 1; el UPDATE no lee `roles`.
 * Aquí se cuida el texto del .sql (como la prueba de la 133).
 */
const fs = require('fs');
const path = require('path');

const SQL = fs.readFileSync(
    path.resolve(__dirname, '../db/migrations/137_sueldos_solo_configuracion_y_cancelar_en_transito.sql'), 'utf8');
const sentencias = SQL.split(/\r?\n/).filter(l => !l.trim().startsWith('--')).join('\n');
const lista = sentencias.split(';').map(s => s.trim()).filter(Boolean);

describe('migración 137_sueldos_solo_configuracion_y_cancelar_en_transito.sql', () => {
    test('cuatro sentencias, en orden: propios de sueldo → rol → cancelar en tránsito → versión', () => {
        expect(lista).toHaveLength(4);
        expect(lista[0]).toMatch(/^INSERT IGNORE INTO permisos_usuario_override/);
        expect(lista[0]).toContain("'cargos.sueldo.ver'");
        expect(lista[1]).toMatch(/^DELETE pr\s+FROM permisos_rol_v2 pr/);
        expect(lista[2]).toMatch(/^INSERT INTO permisos_usuario_override/);
        expect(lista[3]).toMatch(/^UPDATE roles\s+SET version = version \+ 1/);
    });

    test('sueldo: solo a Administradores que ven Configuración (usuarios.ver sin deny), sin pisar lo que ya tengan', () => {
        const [propios] = lista;
        expect(propios).toMatch(/r\.nombre = 'Administrador'/);
        expect(propios).toMatch(/o\.permiso_clave = 'usuarios\.ver' AND o\.tipo = 'grant'/);
        expect(propios).toMatch(/pr\.permiso_clave = 'usuarios\.ver'/);
        expect(propios).toMatch(/NOT EXISTS[\s\S]*'usuarios\.ver' AND o\.tipo = 'deny'/);
        // INSERT IGNORE: un permiso propio (o un deny puesto a mano) que ya exista se respeta.
        expect(propios).not.toMatch(/ON DUPLICATE KEY/);
    });

    test('el rol que pierde el sueldo es solo el Administrador, y solo ese permiso', () => {
        const borrar = lista[1];
        expect(borrar).toMatch(/r\.nombre = 'Administrador'/);
        expect(borrar).toMatch(/pr\.permiso_clave = 'cargos\.sueldo\.ver'/);
        expect(borrar).not.toMatch(/cargos\.sueldo\.editar/);
    });

    test('cancelar en tránsito: solo Leonardo y Daphne, por correo, queda «grant»', () => {
        const cancelar = lista[2];
        expect(cancelar).toMatch(/'inventario\.transferencias\.cancelar_en_transito'/);
        expect(cancelar).toMatch(/u\.email IN \('leonardolopez@lols\.cl', 'daphnelazcano@lols\.cl'\)/);
        expect(cancelar).toMatch(/ON DUPLICATE KEY UPDATE tipo = 'grant'/);
        const correos = SQL.match(/[a-z]+@lols\.cl/g) || [];
        expect(new Set(correos)).toEqual(new Set(['leonardolopez@lols.cl', 'daphnelazcano@lols.cl']));
    });

    test('re-login: nunca el rol 1, y la subconsulta no lee roles (MySQL 1093)', () => {
        const version = lista[3];
        expect(version).toMatch(/WHERE id <> 1/);
        expect(version).toMatch(/nombre = 'Administrador'/);
        const sub = version.slice(version.indexOf('SELECT'));
        expect(sub).not.toMatch(/\broles\b/);
        expect(sub).toMatch(/u\.rol_id <> 1/);
    });

    test('sin DDL (idempotente)', () => {
        expect(sentencias).not.toMatch(/\b(CREATE|ALTER|DROP|TRUNCATE)\b/i);
    });
});
