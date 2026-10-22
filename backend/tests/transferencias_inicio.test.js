jest.mock('../src/config/db', () => ({
    query: jest.fn(),
    getConnection: jest.fn(),
}));

const fs = require('fs');
const path = require('path');
const db = require('../src/config/db');
const transferenciaService = require('../src/services/transferencia.service');

/**
 * Tarjeta «Inventario» del Inicio (dueño 2026-10-20): GET /api/transferencias/inicio devuelve lo que le
 * toca a cada perfil; lo que el perfil no puede hacer llega null y la tarjeta no lo muestra.
 */
describe('transferenciaService.resumenInicio', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        db.query.mockImplementation(async (sql) => {
            if (sql.includes('transferencia_discrepancias')) return [[{ n: 2, dias: 4 }]];
            if (sql.includes("t.estado = 'pendiente'")) return [[{ n: 3, dias: 6 }]];
            if (sql.includes("t.estado = 'aprobada'")) return [[{ n: 1, dias: 2 }]];
            if (sql.includes('t.solicitante_id = ?') && sql.includes("'pendiente', 'aprobada'")) return [[{ n: 5, dias: 9 }]];
            if (sql.includes("IN ('en_transito', 'recepcion_parcial')")) return [[{ n: 4, dias: 1 }]];
            return [[{ n: 0, dias: null }]];
        });
    });

    test('aprobador con visión global: por aprobar y discrepancias, sin filtro de alcance', async () => {
        const r = await transferenciaService.resumenInicio({
            id: 7, p: ['inventario.ver', 'inventario.transferencias.aprobar', 'inventario.transferencias.ver_todas'],
        });
        expect(r.por_aprobar).toEqual({ total: 3, dias: 6 });
        expect(r.discrepancias).toEqual({ total: 2, dias: 4 });
        expect(r.por_despachar).toBeNull();
        expect(r.por_recibir).toBeNull();
        expect(r.mis_solicitudes).toEqual({ total: 5, dias: 9 });
        // Las pruebas y obras finalizadas no cuentan.
        db.query.mock.calls.forEach(([sql]) => expect(sql).toMatch(/es_prueba = 1 OR finalizada = 1/));
    });

    test('bodeguero sin ver_todas: despachar y recibir con el alcance del listado (propias + su bodega)', async () => {
        const r = await transferenciaService.resumenInicio({
            id: 9, bodega_id: 2, p: ['inventario.ver', 'inventario.transferencias.despachar', 'inventario.transferencias.recibir'],
        });
        expect(r.por_aprobar).toBeNull();
        expect(r.discrepancias).toBeNull();
        expect(r.por_despachar).toEqual({ total: 1, dias: 2 });
        expect(r.por_recibir).toEqual({ total: 4, dias: 1 });
        const recibir = db.query.mock.calls.find(([sql]) => sql.includes("IN ('en_transito', 'recepcion_parcial')") && !sql.includes("'pendiente'"));
        expect(recibir[0]).toMatch(/t\.solicitante_id = \? OR t\.destino_bodega_id = \?/);
        expect(recibir[1]).toEqual([9, 2]);
    });

    // Mig 131: «Ver diferencias» cuenta las diferencias (misma consulta que quien aprueba), sin por aprobar.
    test('solo diferencias_ver: cuenta las diferencias, global como la pestaña; nada por aprobar', async () => {
        const r = await transferenciaService.resumenInicio({
            id: 14, p: ['inventario.ver', 'inventario.transferencias.diferencias_ver'],
        });
        expect(r).toEqual({ por_aprobar: null, discrepancias: { total: 2, dias: 4 }, por_despachar: null, por_recibir: null, mis_solicitudes: { total: 5, dias: 9 } });
        const sqlVer = db.query.mock.calls.find(([sql]) => sql.includes('transferencia_discrepancias'))[0];
        db.query.mockClear();
        await transferenciaService.resumenInicio({ id: 7, p: ['inventario.transferencias.aprobar'] });
        expect(db.query.mock.calls.find(([sql]) => sql.includes('transferencia_discrepancias'))[0]).toBe(sqlVer);
    });

    test('solo solicitante: únicamente sus solicitudes en curso', async () => {
        const r = await transferenciaService.resumenInicio({ id: 11, p: ['inventario.ver', 'inventario.transferencias.solicitar'] });
        expect(r).toEqual({ por_aprobar: null, discrepancias: null, por_despachar: null, por_recibir: null, mis_solicitudes: { total: 5, dias: 9 } });
    });

    test('sin filas: ceros y días null', async () => {
        db.query.mockResolvedValue([[{ n: 0, dias: null }]]);
        const r = await transferenciaService.resumenInicio({ id: 1, p: ['inventario.transferencias.aprobar'] });
        expect(r.por_aprobar).toEqual({ total: 0, dias: null });
    });
});

describe('ruta GET /api/transferencias/inicio', () => {
    const src = fs.readFileSync(path.join(__dirname, '../src/routes/transferencias.routes.js'), 'utf8');

    test('se registra antes de /:id (si no, Express toma «inicio» como un ID)', () => {
        expect(src.indexOf("router.get('/inicio'")).toBeGreaterThan(-1);
        expect(src.indexOf("router.get('/inicio'")).toBeLessThan(src.indexOf("router.get('/:id'"));
    });

    test('pide inventario.ver', () => {
        expect(src).toMatch(/router\.get\('\/inicio', auth, checkPermission\('inventario\.ver'\)/);
    });
});
