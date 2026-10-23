/**
 * Migración 133 «solo Leonardo aprueba, en TODOS los roles» (decisión del dueño 2026-10-23: «Sí, a todos»).
 * Sigue a la 131 (que lo quitó solo del rol «Administrador»; su prueba está en transferencias_diferencias_ver.test.js).
 *   · Re-login PRIMERO: roles.version + 1 de quien pierde 'aprobar', mirado ANTES de borrarlo.
 *   · Nunca el rol 1 (Super Administrador): ni se le sube la versión ni se le borra el permiso.
 *   · La única excepción entre las personas es el correo de Leonardo.
 *   · Idempotente: sin DDL, sin INSERT que duplique, y el UPDATE solo sube a quien todavía tiene 'aprobar'.
 *   · MySQL 1093: las subconsultas del UPDATE no leen `roles`.
 * La ejecución de verdad (MySQL 5.7 desechable, dos pasadas) se hizo aparte; aquí se cuida el texto del .sql.
 */
const fs = require('fs');
const path = require('path');

const APROBAR = 'inventario.transferencias.aprobar';
const LEO = 'leonardolopez@lols.cl';
const SQL = fs.readFileSync(path.resolve(__dirname, '../db/migrations/133_solo_leonardo_aprueba_todos.sql'), 'utf8');
// Solo las sentencias (los comentarios nombran tablas, roles y personas).
const sentencias = SQL.split(/\r?\n/).filter(l => !l.trim().startsWith('--')).join('\n');
const lista = sentencias.split(';').map(s => s.trim()).filter(Boolean);
const una = (re) => {
    const hallada = lista.filter(s => re.test(s));
    expect(hallada).toHaveLength(1);
    return hallada[0];
};

describe('migración 133_solo_leonardo_aprueba_todos.sql', () => {
    test('cuatro sentencias, en orden: versión → rol → permisos propios → Leonardo', () => {
        expect(lista).toHaveLength(4);
        expect(lista[0]).toMatch(/^UPDATE roles\s+SET version = version \+ 1/);
        expect(lista[1]).toMatch(/^DELETE FROM permisos_rol_v2/);
        expect(lista[2]).toMatch(/^DELETE o\s+FROM permisos_usuario_override o/);
        expect(lista[3]).toMatch(/^INSERT INTO permisos_usuario_override/);
        // La versión sube ANTES de cualquier DELETE (después ya no se sabe quién tenía 'aprobar').
        const iVer = sentencias.indexOf('UPDATE roles');
        const iDel = sentencias.indexOf('DELETE');
        expect(iVer).toBeGreaterThan(-1);
        expect(iDel).toBeGreaterThan(iVer);
    });

    test('re-login: sube solo los roles (salvo el 1) que tienen aprobar o con alguien que lo tiene propio, sin leer roles', () => {
        const upd = una(/^UPDATE roles/);
        expect(upd).toMatch(/WHERE id <> 1\s+AND \(/);
        // (a) rol con 'aprobar'
        expect(upd).toMatch(/id IN \(\s*SELECT pr\.rol_id FROM permisos_rol_v2 pr\s+WHERE pr\.permiso_clave = 'inventario\.transferencias\.aprobar'\s*\)/);
        // (b) rol de quien lo tiene propio 'grant', salvo Leonardo
        expect(upd).toMatch(/OR id IN \(\s*SELECT u\.rol_id FROM permisos_usuario_override o\s+JOIN usuarios u ON u\.id = o\.usuario_id/);
        expect(upd).toMatch(/o\.permiso_clave = 'inventario\.transferencias\.aprobar'\s+AND o\.tipo = 'grant'\s+AND u\.email <> 'leonardolopez@lols\.cl'/);
        // MySQL 1093: nada de `roles` dentro de las subconsultas.
        const subconsultas = upd.slice(upd.indexOf('SET'));
        expect(subconsultas).not.toMatch(/\b(FROM|JOIN)\s+roles\b/i);
        // Una sola subida de versión en todo el archivo (sin otro UPDATE que la repita).
        expect(sentencias.match(/version = version \+ 1/g)).toHaveLength(1);
    });

    test('quita aprobar de todos los roles menos el 1, y solo esa clave', () => {
        const del = una(/^DELETE FROM permisos_rol_v2/);
        expect(del).toMatch(/WHERE permiso_clave = 'inventario\.transferencias\.aprobar'\s+AND rol_id <> 1$/);
        // Nunca se toca el rol 1 ni se borra el catálogo.
        expect(sentencias).not.toMatch(/\b(rol_)?id\s*=\s*1\b/);
        expect(sentencias).not.toMatch(/DELETE[\s\S]*FROM permisos_catalogo/);
    });

    test('quita el aprobar propio (solo grant) a todos menos Leonardo; los deny quedan', () => {
        const del = una(/^DELETE o\s+FROM permisos_usuario_override/);
        expect(del).toMatch(/JOIN usuarios u ON u\.id = o\.usuario_id/);
        expect(del).toMatch(/o\.permiso_clave = 'inventario\.transferencias\.aprobar'\s+AND o\.tipo = 'grant'\s+AND u\.email <> 'leonardolopez@lols\.cl'$/);
        // Sin filtro por rol: vale para TODOS los roles (la 131 lo limitaba a «Administrador»).
        expect(del).not.toMatch(/roles|nombre/);
    });

    test('Leonardo queda con aprobar propio, por correo y sin duplicar', () => {
        const ins = una(/^INSERT INTO permisos_usuario_override/);
        expect(ins).toMatch(/SELECT u\.id, p\.clave, 'grant'/);
        expect(ins).toMatch(/JOIN permisos_catalogo p ON p\.clave = 'inventario\.transferencias\.aprobar'/);
        expect(ins).toMatch(/WHERE u\.email = 'leonardolopez@lols\.cl'/);
        expect(ins).toMatch(/ON DUPLICATE KEY UPDATE tipo = 'grant'$/);
    });

    test('la única persona nombrada es Leonardo y el único permiso, aprobar', () => {
        const correos = [...new Set(sentencias.match(/'[^']+@[^']+'/g))];
        expect(correos).toEqual([`'${LEO}'`]);
        const claves = [...new Set(sentencias.match(/'[a-z_]+(\.[a-z_]+)+'/g).filter(c => !c.includes('@')))];
        expect(claves).toEqual([`'${APROBAR}'`]);
    });

    test('idempotente: sin DDL ni INSERT que duplique', () => {
        expect(sentencias).not.toMatch(/\b(CREATE|ALTER|DROP|TRUNCATE|RENAME)\b/i);
        lista.filter(s => /^INSERT/i.test(s)).forEach(s => expect(s).toMatch(/INSERT IGNORE|ON DUPLICATE KEY UPDATE/));
    });
});
