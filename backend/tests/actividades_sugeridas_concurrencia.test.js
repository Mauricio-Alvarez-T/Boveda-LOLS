/**
 * Auditoría estática del módulo "Lista de trabajadores en actividades sugeridas"
 * (antes sábados extra; renombrado por jefatura 2026-09-21, mig 116).
 *
 * Verifica vía inspección del código fuente que las transiciones de estado usan
 * `SELECT ... FOR UPDATE`, que las validaciones críticas están presentes, que el
 * RBAC granular sigue en las rutas y que la migración 116 es idempotente. Patrón
 * heredado de `transferencia_concurrencia.test.js`.
 */

const fs = require('fs');
const path = require('path');

const SERVICE_PATH = path.resolve(__dirname, '../src/services/actividadesSugeridas.service.js');
const SOURCE = fs.readFileSync(SERVICE_PATH, 'utf8');

function getMethodBody(methodName) {
    const idx = SOURCE.indexOf(`async ${methodName}(`);
    if (idx === -1) throw new Error(`No se encontró método ${methodName}`);
    let parenDepth = 0;
    let bodyStart = -1;
    for (let i = idx; i < SOURCE.length; i++) {
        const ch = SOURCE[i];
        if (ch === '(') parenDepth++;
        else if (ch === ')') {
            parenDepth--;
            if (parenDepth === 0) { bodyStart = i + 1; break; }
        }
    }
    if (bodyStart === -1) throw new Error(`Params no cerrados en ${methodName}`);
    let braceDepth = 0, started = false;
    for (let i = bodyStart; i < SOURCE.length; i++) {
        const ch = SOURCE[i];
        if (ch === '{') { braceDepth++; started = true; }
        else if (ch === '}') {
            braceDepth--;
            if (started && braceDepth === 0) return SOURCE.slice(idx, i + 1);
        }
    }
    throw new Error(`Cierre de método ${methodName} no encontrado`);
}

describe('ActividadesSugeridas — concurrencia (SELECT FOR UPDATE)', () => {
    test('crearLista lockea (obra, semana) con FOR UPDATE', () => {
        const body = getMethodBody('crearLista');
        expect(body).toMatch(/SELECT[\s\S]*?FROM actividades_sugeridas[\s\S]*?WHERE obra_id = \? AND semana = \? FOR UPDATE/i);
    });

    test.each(['editarLista', 'registrarAsistencia', 'cancelar'])('%s lockea cabecera con FOR UPDATE', (m) => {
        const body = getMethodBody(m);
        expect(body).toMatch(/SELECT[\s\S]*?FROM actividades_sugeridas[\s\S]*?WHERE id = \? FOR UPDATE/i);
    });

    test('todas las transiciones llaman beginTransaction + commit/rollback', () => {
        for (const m of ['crearLista', 'editarLista', 'registrarAsistencia', 'cancelar']) {
            const body = getMethodBody(m);
            expect(body).toMatch(/beginTransaction\(\)/);
            expect(body).toMatch(/commit\(\)/);
            expect(body).toMatch(/rollback\(\)/);
        }
    });
});

describe('ActividadesSugeridas — audit trail en mutaciones', () => {
    test('INSERT cabecera setea creado_por y actualizado_por', () => {
        const body = getMethodBody('crearLista');
        expect(body).toMatch(/INSERT INTO actividades_sugeridas[\s\S]*?creado_por[\s\S]*?actualizado_por/);
    });

    test('INSERT detalle (crear) setea estado y actualizado_por', () => {
        const body = getMethodBody('crearLista');
        expect(body).toMatch(/INSERT INTO actividades_sugeridas_trabajadores[\s\S]*?estado[\s\S]*?actualizado_por/);
    });

    test('UPDATE editarLista setea actualizado_por', () => {
        const body = getMethodBody('editarLista');
        expect(body).toMatch(/UPDATE actividades_sugeridas[\s\S]*?actualizado_por/);
    });

    test('UPDATE registrarAsistencia setea actualizado_por en cabecera y detalle', () => {
        const body = getMethodBody('registrarAsistencia');
        const updates = body.match(/UPDATE actividades_sugeridas[_a-z]*[\s\S]*?actualizado_por/g);
        expect(updates).not.toBeNull();
        expect(updates.length).toBeGreaterThanOrEqual(2);
    });

    test('cancelar setea actualizado_por en cabecera y trabajadores', () => {
        const body = getMethodBody('cancelar');
        expect(body).toMatch(/UPDATE actividades_sugeridas[\s\S]*?actualizado_por/);
        expect(body).toMatch(/UPDATE actividades_sugeridas_trabajadores[\s\S]*?estado = 'cancelado'[\s\S]*?actualizado_por/);
    });
});

describe('ActividadesSugeridas — validaciones críticas presentes', () => {
    test('validarSemana exige lunes y rechaza semana pasada', () => {
        expect(SOURCE).toMatch(/getDay\(\) !== MONDAY/);
        expect(SOURCE).toMatch(/semanaOnly < lunesActual/);
        expect(SOURCE).toMatch(/No se permite una semana pasada/);
    });

    test('validarSemana rechaza más de 1 año adelante', () => {
        expect(SOURCE).toMatch(/ONE_YEAR_DAYS/);
        expect(SOURCE).toMatch(/demasiado lejana/i);
    });

    test('crearLista valida obra activa y NO consulta feriados (la semana no es un día)', () => {
        const body = getMethodBody('crearLista');
        expect(body).toMatch(/validarObraYTrabajadores/);
        expect(body).not.toMatch(/feriado/i);
        expect(SOURCE).not.toMatch(/FROM feriados/);
    });

    test('listar usa GROUP BY (no subqueries correlacionadas N+1) y rango plano por semana', () => {
        const body = getMethodBody('listar');
        expect(body).toMatch(/GROUP BY s\.id/);
        expect(body).not.toMatch(/\(SELECT COUNT\([^)]+\) FROM actividades_sugeridas_trabajadores t WHERE t\.actividad_id = s\.id/);
        expect(body).toMatch(/s\.semana BETWEEN \? AND \?/);
    });

    test('sin rastro del nombre viejo ni de sábado en service y rutas', () => {
        const routes = fs.readFileSync(path.resolve(__dirname, '../src/routes/actividades-sugeridas.routes.js'), 'utf8');
        for (const src of [SOURCE, routes]) {
            expect(src).not.toMatch(/sabados?_extra/i);
            expect(src).not.toMatch(/s[aá]bado/i);
            expect(src).not.toMatch(/\bfecha\b/);
        }
    });
});

describe('ActividadesSugeridas — RBAC granular', () => {
    const ROUTES_PATH = path.resolve(__dirname, '../src/routes/actividades-sugeridas.routes.js');
    const ROUTES_SRC = fs.readFileSync(ROUTES_PATH, 'utf8');

    test('PUT /:id/lista requiere permiso editar (no crear)', () => {
        expect(ROUTES_SRC).toMatch(/router\.put\('\/:id\/lista'[\s\S]*?asistencia\.actividades_sugeridas\.editar/);
    });

    test('DELETE /:id requiere permiso cancelar (no crear)', () => {
        expect(ROUTES_SRC).toMatch(/router\.delete\('\/:id'[\s\S]*?asistencia\.actividades_sugeridas\.cancelar/);
    });

    test('POST / sigue requiriendo permiso crear', () => {
        expect(ROUTES_SRC).toMatch(/router\.post\('\/'[\s\S]*?asistencia\.actividades_sugeridas\.crear/);
    });

    test('las 7 claves existen en permisos.config.js y ninguna vieja', () => {
        const cfg = fs.readFileSync(path.resolve(__dirname, '../src/config/permisos.config.js'), 'utf8');
        for (const k of ['ver', 'crear', 'editar', 'cancelar', 'registrar', 'enviar_whatsapp', 'informe']) {
            expect(cfg).toContain(`'asistencia.actividades_sugeridas.${k}'`);
        }
        expect(cfg).not.toMatch(/sabados_extra/);
    });

    test('el informe Excel exige su propio permiso, no el de ver', () => {
        expect(ROUTES_SRC).toMatch(/router\.get\('\/informe-excel'[\s\S]*?asistencia\.actividades_sugeridas\.informe/);
    });

    test('las rutas estáticas se registran ANTES de /:id (o Express las toma como id)', () => {
        const iResumen = ROUTES_SRC.indexOf("router.get('/resumen-semana'");
        const iInforme = ROUTES_SRC.indexOf("router.get('/informe-excel'");
        const iId = ROUTES_SRC.indexOf("router.get('/:id'");
        expect(iResumen).toBeGreaterThan(-1);
        expect(iInforme).toBeGreaterThan(-1);
        expect(iResumen).toBeLessThan(iId);
        expect(iInforme).toBeLessThan(iId);
    });

    test('la migración 117 da de alta el permiso del informe con INSERT IGNORE', () => {
        const sql = fs.readFileSync(path.resolve(__dirname, '../db/migrations/117_permiso_informe_actividades.sql'), 'utf8');
        expect(sql).toMatch(/INSERT IGNORE INTO permisos_catalogo/);
        expect(sql).toContain("'asistencia.actividades_sugeridas.informe'");
        // FK permisos_rol_v2.permiso_clave → permisos_catalogo.clave: el catálogo va primero.
        // Se comparan los INSERT, no menciones sueltas (los comentarios nombran ambas tablas).
        const iCat = sql.indexOf('INSERT IGNORE INTO permisos_catalogo');
        const iRol = sql.indexOf('INSERT IGNORE INTO permisos_rol_v2');
        expect(iCat).toBeGreaterThan(-1);
        expect(iRol).toBeGreaterThan(iCat);
    });
});

describe('Migración 116 — rename idempotente', () => {
    const SQL = fs.readFileSync(path.resolve(__dirname, '../db/migrations/116_actividades_sugeridas.sql'), 'utf8');

    test('renombra ambas tablas y las dos columnas con guardas information_schema', () => {
        expect(SQL).toMatch(/RENAME TABLE sabados_extra TO actividades_sugeridas/);
        expect(SQL).toMatch(/RENAME TABLE sabados_extra_trabajadores TO actividades_sugeridas_trabajadores/);
        expect(SQL).toMatch(/CHANGE COLUMN fecha semana DATE NOT NULL/);
        expect(SQL).toMatch(/CHANGE COLUMN sabado_id actividad_id INT NOT NULL/);
        // Cada DDL va dentro de un IF(...) preparado: nunca un RENAME/ALTER "pelado".
        const ddlLines = SQL.split('\n').filter(l => /^\s*(RENAME TABLE|ALTER TABLE)/.test(l));
        expect(ddlLines).toEqual([]);
        expect((SQL.match(/PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;/g) || []).length).toBeGreaterThan(20);
    });

    test('mueve los sábados históricos al lunes de su semana de forma idempotente', () => {
        expect(SQL).toMatch(/SET semana = DATE_SUB\(semana, INTERVAL WEEKDAY\(semana\) DAY\)\s*WHERE WEEKDAY\(semana\) <> 0/);
    });

    test('permisos: INSERT nuevas → UPDATE hijos (rol_v2 y override) → DELETE viejas → roles.version', () => {
        const iIns = SQL.indexOf('INSERT IGNORE INTO permisos_catalogo');
        const iRol = SQL.indexOf('UPDATE IGNORE permisos_rol_v2');
        const iOvr = SQL.indexOf('UPDATE IGNORE permisos_usuario_override');
        const iDel = SQL.indexOf("DELETE FROM permisos_catalogo WHERE clave LIKE 'asistencia.sabados_extra.%'");
        const iVer = SQL.indexOf('UPDATE roles SET version = version + 1');
        expect(iIns).toBeGreaterThan(-1);
        expect(iIns).toBeLessThan(iRol);
        expect(iRol).toBeLessThan(iOvr);
        expect(iOvr).toBeLessThan(iDel);
        expect(iDel).toBeLessThan(iVer);
        for (const k of ['ver', 'crear', 'editar', 'cancelar', 'registrar', 'enviar_whatsapp']) {
            expect(SQL).toContain(`'asistencia.actividades_sugeridas.${k}'`);
            expect(SQL).toContain(`WHERE permiso_clave = 'asistencia.sabados_extra.${k}'`);
        }
    });
});
