/**
 * Tests Sprint 1 — auditoría Sábados Extra.
 *
 * Verifica vía inspección estática del código fuente que los métodos
 * de transición de estado usan `SELECT ... FOR UPDATE` y que las
 * validaciones críticas están presentes. Patrón heredado de
 * `transferencia_concurrencia.test.js` — más estable que mocks
 * encadenados que rompen al refactorizar.
 */

const fs = require('fs');
const path = require('path');

const SERVICE_PATH = path.resolve(__dirname, '../src/services/sabadosExtra.service.js');
const SOURCE = fs.readFileSync(SERVICE_PATH, 'utf8');

/**
 * Extrae el cuerpo de un método del objeto sabadosExtraService.
 * Match desde `methodName(...)` hasta el cierre de su llave (best-effort
 * con balance de llaves, suficiente para detectar tokens).
 */
function getMethodBody(methodName) {
    const idx = SOURCE.indexOf(`async ${methodName}(`);
    if (idx === -1) throw new Error(`No se encontró método ${methodName}`);
    // Saltar el paréntesis de parámetros (puede contener {} de destructuring)
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

    // Buscar { de cuerpo del método tras los params
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

describe('SabadosExtra — concurrencia (SELECT FOR UPDATE)', () => {
    test('crearCitacion lockea (obra,fecha) con FOR UPDATE', () => {
        const body = getMethodBody('crearCitacion');
        expect(body).toMatch(/SELECT[\s\S]*?FROM sabados_extra[\s\S]*?WHERE obra_id = \? AND fecha = \? FOR UPDATE/i);
    });

    test('editarCitacion lockea cabecera con FOR UPDATE', () => {
        const body = getMethodBody('editarCitacion');
        expect(body).toMatch(/SELECT[\s\S]*?FROM sabados_extra[\s\S]*?WHERE id = \? FOR UPDATE/i);
    });

    test('registrarAsistencia lockea cabecera con FOR UPDATE', () => {
        const body = getMethodBody('registrarAsistencia');
        expect(body).toMatch(/SELECT[\s\S]*?FROM sabados_extra[\s\S]*?WHERE id = \? FOR UPDATE/i);
    });

    test('cancelar lockea cabecera con FOR UPDATE', () => {
        const body = getMethodBody('cancelar');
        expect(body).toMatch(/SELECT[\s\S]*?FROM sabados_extra[\s\S]*?WHERE id = \? FOR UPDATE/i);
    });

    test('todas las transiciones llaman beginTransaction + commit/rollback', () => {
        for (const m of ['crearCitacion', 'editarCitacion', 'registrarAsistencia', 'cancelar']) {
            const body = getMethodBody(m);
            expect(body).toMatch(/beginTransaction\(\)/);
            expect(body).toMatch(/commit\(\)/);
            expect(body).toMatch(/rollback\(\)/);
        }
    });
});

describe('SabadosExtra — audit trail en mutaciones', () => {
    test('INSERT cabecera setea creado_por y actualizado_por', () => {
        const body = getMethodBody('crearCitacion');
        expect(body).toMatch(/INSERT INTO sabados_extra[\s\S]*?creado_por[\s\S]*?actualizado_por/);
    });

    test('INSERT detalle (crear) setea estado y actualizado_por', () => {
        const body = getMethodBody('crearCitacion');
        expect(body).toMatch(/INSERT INTO sabados_extra_trabajadores[\s\S]*?estado[\s\S]*?actualizado_por/);
    });

    test('UPDATE editarCitacion setea actualizado_por', () => {
        const body = getMethodBody('editarCitacion');
        expect(body).toMatch(/UPDATE sabados_extra[\s\S]*?actualizado_por/);
    });

    test('UPDATE registrarAsistencia setea actualizado_por en cabecera y detalle', () => {
        const body = getMethodBody('registrarAsistencia');
        const updates = body.match(/UPDATE sabados_extra[_a-z]*[\s\S]*?actualizado_por/g);
        expect(updates).not.toBeNull();
        expect(updates.length).toBeGreaterThanOrEqual(2);
    });

    test('cancelar setea actualizado_por en cabecera y trabajadores', () => {
        const body = getMethodBody('cancelar');
        expect(body).toMatch(/UPDATE sabados_extra[\s\S]*?actualizado_por/);
        expect(body).toMatch(/UPDATE sabados_extra_trabajadores[\s\S]*?estado = 'cancelado'[\s\S]*?actualizado_por/);
    });
});

describe('SabadosExtra — validaciones críticas presentes', () => {
    test('validarFechaSabado rechaza fecha pasada', () => {
        expect(SOURCE).toMatch(/dateOnly < today/);
        expect(SOURCE).toMatch(/No se permite fecha pasada/);
    });

    test('validarFechaSabado rechaza fecha más de 1 año adelante', () => {
        expect(SOURCE).toMatch(/ONE_YEAR_DAYS/);
        expect(SOURCE).toMatch(/demasiado lejana/i);
    });

    test('crearCitacion valida obra activa', () => {
        const body = getMethodBody('crearCitacion');
        expect(body).toMatch(/validarObraYTrabajadores/);
    });

    test('crearCitacion valida feriado opt-in', () => {
        const body = getMethodBody('crearCitacion');
        expect(body).toMatch(/validarFeriado/);
    });

    test('listar usa GROUP BY (no subqueries correlacionadas N+1)', () => {
        const body = getMethodBody('listar');
        expect(body).toMatch(/GROUP BY s\.id/);
        // No debe haber subqueries correlacionadas con WHERE t.sabado_id = s.id
        expect(body).not.toMatch(/\(SELECT COUNT\([^)]+\) FROM sabados_extra_trabajadores t WHERE t\.sabado_id = s\.id/);
    });

    test('listar filtra por rango de fecha plano (no MONTH/YEAR)', () => {
        const body = getMethodBody('listar');
        expect(body).toMatch(/s\.fecha BETWEEN \? AND \?/);
    });
});

describe('SabadosExtra — RBAC granular', () => {
    const ROUTES_PATH = path.resolve(__dirname, '../src/routes/sabados-extra.routes.js');
    const ROUTES_SRC = fs.readFileSync(ROUTES_PATH, 'utf8');

    test('PUT /:id/citacion requiere permiso editar (no crear)', () => {
        expect(ROUTES_SRC).toMatch(/router\.put\('\/:id\/citacion'[\s\S]*?asistencia\.sabados_extra\.editar/);
    });

    test('DELETE /:id requiere permiso cancelar (no crear)', () => {
        expect(ROUTES_SRC).toMatch(/router\.delete\('\/:id'[\s\S]*?asistencia\.sabados_extra\.cancelar/);
    });

    test('POST / sigue requiriendo permiso crear', () => {
        expect(ROUTES_SRC).toMatch(/router\.post\('\/'[\s\S]*?asistencia\.sabados_extra\.crear/);
    });
});
