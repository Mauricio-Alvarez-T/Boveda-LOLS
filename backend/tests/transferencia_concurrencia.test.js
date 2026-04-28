/**
 * Tests Sprint 1 auditoría: race conditions y audit trail.
 *
 * Estrategia: inspeccionamos el código fuente de transferencia.service.js
 * para verificar que cada transición de estado:
 *   1. Usa SELECT ... FOR UPDATE en el SELECT inicial.
 *   2. Setea la columna de audit correspondiente en el UPDATE.
 *
 * Inspección estática es más robusta que mocks de db.getConnection() para
 * cadenas largas de queries — los mocks rompen cuando la lógica del service
 * cambia y dan falsos positivos/negativos. Acá garantizamos que el SQL que
 * llega a MySQL contiene los locks y audit columns esperados.
 */

const fs = require('fs');
const path = require('path');

const SERVICE_PATH = path.join(__dirname, '..', 'src', 'services', 'transferencia.service.js');
const SOURCE = fs.readFileSync(SERVICE_PATH, 'utf8');

/**
 * Extrae el cuerpo de un método del service por nombre.
 * Encuentra `async methodName(` y devuelve hasta el siguiente `},\n    async ` o EOF.
 */
function getMethodBody(methodName) {
    const startRegex = new RegExp(`async ${methodName}\\s*\\(`);
    const startMatch = SOURCE.match(startRegex);
    if (!startMatch) return null;
    const startIdx = startMatch.index;
    // Encontrar el fin: siguiente `    async ` o final del módulo
    const rest = SOURCE.slice(startIdx + startMatch[0].length);
    const endMatch = rest.match(/\n    async \w+\s*\(/);
    const endIdx = endMatch ? endMatch.index : rest.length;
    return SOURCE.slice(startIdx, startIdx + startMatch[0].length + endIdx);
}

describe('Race conditions: SELECT FOR UPDATE en transiciones de estado', () => {
    test('aprobar() usa FOR UPDATE en el SELECT inicial', () => {
        const body = getMethodBody('aprobar');
        expect(body).toBeTruthy();
        expect(body).toMatch(/SELECT\s+estado\s+FROM\s+transferencias\s+WHERE\s+id\s*=\s*\?\s*FOR\s+UPDATE/i);
    });

    test('despachar() usa FOR UPDATE en el SELECT inicial', () => {
        const body = getMethodBody('despachar');
        expect(body).toBeTruthy();
        expect(body).toMatch(/SELECT\s+estado\s+FROM\s+transferencias\s+WHERE\s+id\s*=\s*\?\s*FOR\s+UPDATE/i);
    });

    test('recibir() usa FOR UPDATE en el SELECT inicial', () => {
        const body = getMethodBody('recibir');
        expect(body).toBeTruthy();
        expect(body).toMatch(/SELECT\s+\*\s+FROM\s+transferencias\s+WHERE\s+id\s*=\s*\?\s*FOR\s+UPDATE/i);
    });

    test('rechazar() pasa SQL con FOR UPDATE a _selectForStatusChange', () => {
        const body = getMethodBody('rechazar');
        expect(body).toBeTruthy();
        expect(body).toMatch(/FROM\s+transferencias\s+WHERE\s+id\s*=\s*\?\s*FOR\s+UPDATE/i);
    });

    test('cancelar() pasa SQL con FOR UPDATE a _selectForStatusChange', () => {
        const body = getMethodBody('cancelar');
        expect(body).toBeTruthy();
        expect(body).toMatch(/FROM\s+transferencias\s+WHERE\s+id\s*=\s*\?\s*FOR\s+UPDATE/i);
    });
});

describe('Audit trail: columnas creado_por, aprobado_por, despachado_por, recibido_por, rechazado_por, cancelado_por', () => {
    test('aprobar() UPDATE setea aprobado_por', () => {
        const body = getMethodBody('aprobar');
        expect(body).toMatch(/UPDATE transferencias[\s\S]*?aprobado_por\s*=\s*\?/);
    });

    test('despachar() UPDATE setea despachado_por', () => {
        const body = getMethodBody('despachar');
        expect(body).toMatch(/UPDATE transferencias[\s\S]*?despachado_por\s*=\s*\?/);
    });

    test('recibir() UPDATE setea recibido_por', () => {
        const body = getMethodBody('recibir');
        expect(body).toMatch(/UPDATE transferencias[\s\S]*?recibido_por\s*=\s*\?/);
    });

    test('rechazar() UPDATE setea rechazado_por', () => {
        const body = getMethodBody('rechazar');
        expect(body).toMatch(/UPDATE transferencias[\s\S]*?rechazado_por\s*=\s*\?/);
    });

    test('cancelar() UPDATE setea cancelado_por', () => {
        const body = getMethodBody('cancelar');
        expect(body).toMatch(/UPDATE transferencias[\s\S]*?cancelado_por\s*=\s*\?/);
    });

    test('crear() INSERT incluye creado_por', () => {
        const body = getMethodBody('crear');
        expect(body).toMatch(/INSERT INTO transferencias[\s\S]*?creado_por/);
    });

    test('pushDirecto() INSERT incluye creado_por, aprobado_por y despachado_por', () => {
        const body = getMethodBody('pushDirecto');
        expect(body).toMatch(/creado_por/);
        expect(body).toMatch(/aprobado_por/);
        expect(body).toMatch(/despachado_por/);
    });

    test('intraBodega() INSERT incluye los 4 audit columns (transferencia ya recibida)', () => {
        const body = getMethodBody('intraBodega');
        expect(body).toMatch(/creado_por/);
        expect(body).toMatch(/aprobado_por/);
        expect(body).toMatch(/despachado_por/);
        expect(body).toMatch(/recibido_por/);
    });

    test('ordenGerencia() INSERT incluye creado_por, aprobado_por y despachado_por', () => {
        const body = getMethodBody('ordenGerencia');
        expect(body).toMatch(/creado_por/);
        expect(body).toMatch(/aprobado_por/);
        expect(body).toMatch(/despachado_por/);
    });
});
