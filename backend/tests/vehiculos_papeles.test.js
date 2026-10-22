/**
 * Tests de los papeles por vehículo (fichas «Vehículos» del Inicio, 2026-10-22).
 *
 * Fija el contrato de GET /api/vehiculos/papeles (`getPapeles`):
 *   · cada fuente cae en su papel del semáforo (permiso, póliza, técnica, gases, mantención),
 *     y seguro a terceros, revisión mecánica y fin de leasing van a `otros`;
 *   · separa vigente, sin fecha y sin registro (el contador del menú no los trae);
 *   · por vehículo y papel manda el registro con la fecha MÁS RECIENTE (duplicados viejos y
 *     tablas antiguas no pintan rojo si ya está el nuevo);
 *   · con el aviso apagado el semáforo pinta según la fecha, pero no suma;
 *   · por defecto solo los vehículos que requieren acción, del más urgente al menos; ?todos=1
 *     trae toda la flota;
 *   · la ruta va antes de /:id y pide vehiculos.ver.
 *
 * Mocks de BD, sin conexión real (patrón de vehiculos_vencimientos.test.js).
 */

jest.mock('../src/config/db', () => ({
    query: jest.fn().mockResolvedValue([[]]),
}));
jest.mock('../src/middleware/logger', () => ({
    logManualActivity: jest.fn().mockResolvedValue(undefined),
    activityLogger: (req, res, next) => next(),
    resolveEntidad: jest.fn(),
}));

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../index');
const db = require('../src/config/db');
const svc = require('../src/services/vehiculos.service');

const SECRET = process.env.JWT_SECRET || 'secret';
const token = (permisos) => jwt.sign({ id: 9, email: 'op@lols.cl', rol_id: 1, rv: 1, p: permisos }, SECRET);

const vehiculo = (over = {}) => ({
    id: 7, patente: 'KRPD-17', marca: 'HYUNDAI', modelo: 'HD78', tipo: 'camion', activo: 1,
    empresa_id: 2, empresa_nombre: 'LOLS', conductor_id: 4, conductor_nombre: 'Juan Pérez', ...over,
});

const fila = (over = {}) => ({
    id: 1, vehiculo_id: 7, subtipo: 'permiso_circulacion',
    fecha_vencimiento: '2027-05-10', dias_restantes: 200, avisar_30d: true, ...over, // TINYINT(1) llega boolean (typeCast de db.js)
});

/** Encola las 7 consultas de getPapeles en orden. */
const mockFuentes = ({ vehiculos = [vehiculo()], documentos = [], revisiones = [], mantenciones = [], seguros = [], permisos = [], leasing = [] } = {}) => {
    db.query
        .mockResolvedValueOnce([vehiculos])
        .mockResolvedValueOnce([documentos])
        .mockResolvedValueOnce([revisiones])
        .mockResolvedValueOnce([mantenciones])
        .mockResolvedValueOnce([seguros])
        .mockResolvedValueOnce([permisos])
        .mockResolvedValueOnce([leasing]);
};

/** Error de columna inexistente (migración pendiente) como lo tira mysql2. */
const errBadField = () => Object.assign(new Error('Unknown column'), { code: 'ER_BAD_FIELD_ERROR' });

const papel = (veh, clave) => veh.papeles.find(p => p.clave === clave);

beforeEach(() => {
    jest.clearAllMocks();
    // mockReset también bota los mockResolvedValueOnce que un test haya dejado sin usar.
    db.query.mockReset().mockResolvedValue([[]]);
});

describe('getPapeles — de qué fuente sale cada papel', () => {
    test('cada fuente cae en su papel; seguro a terceros, mecánica y fin de leasing van a otros', async () => {
        mockFuentes({
            documentos: [
                fila({ id: 1, subtipo: 'permiso_circulacion', dias_restantes: 10, fecha_vencimiento: '2026-11-01' }),
                fila({ id: 2, subtipo: 'poliza', dias_restantes: -3, fecha_vencimiento: '2026-10-19' }),
                fila({ id: 3, subtipo: 'seguro_terceros', dias_restantes: 5, fecha_vencimiento: '2026-10-27' }),
            ],
            revisiones: [
                fila({ id: 11, subtipo: 'tecnica', dias_restantes: 20, fecha_vencimiento: '2026-11-11' }),
                fila({ id: 12, subtipo: 'gases', dias_restantes: -1, fecha_vencimiento: '2026-10-21' }),
                fila({ id: 13, subtipo: 'mecanica', dias_restantes: 2, fecha_vencimiento: '2026-10-24' }),
            ],
            mantenciones: [fila({ id: 21, subtipo: 'Mantención', dias_restantes: 15, fecha_vencimiento: '2026-11-06' })],
            leasing: [{ vehiculo_id: 7, fecha_vencimiento: '2026-11-16', dias_restantes: 25, avisar_leasing_30d: true }],
        });

        const r = await svc.getPapeles();

        expect(db.query).toHaveBeenCalledTimes(7);
        expect(r.vehiculos).toHaveLength(1);
        const v = r.vehiculos[0];
        // Siempre los 5, en el orden del semáforo.
        expect(v.papeles.map(p => p.clave)).toEqual(['permiso', 'poliza', 'tecnica', 'gases', 'mantencion']);
        expect(papel(v, 'permiso')).toMatchObject({ estado: 'por_vencer', categoria: 'documento', subtipo: 'permiso_circulacion', registro_id: 1, fecha_vencimiento: '2026-11-01', dias_restantes: 10, avisa: true });
        expect(papel(v, 'poliza')).toMatchObject({ estado: 'vencido', categoria: 'documento', registro_id: 2 });
        expect(papel(v, 'tecnica')).toMatchObject({ estado: 'por_vencer', categoria: 'revision', registro_id: 11 });
        expect(papel(v, 'gases')).toMatchObject({ estado: 'vencido', categoria: 'revision', registro_id: 12 });
        expect(papel(v, 'mantencion')).toMatchObject({ estado: 'por_vencer', categoria: 'mantencion', subtipo: 'Mantención', registro_id: 21 });
        // Lo que no es uno de los 5, del más urgente al menos, con su nombre legible.
        expect(v.otros).toEqual([
            { categoria: 'revision', subtipo: 'mecanica', nombre: 'Revisión mecánica', registro_id: 13, fecha_vencimiento: '2026-10-24', dias_restantes: 2, estado: 'por_vencer' },
            { categoria: 'documento', subtipo: 'seguro_terceros', nombre: 'Seguro a terceros', registro_id: 3, fecha_vencimiento: '2026-10-27', dias_restantes: 5, estado: 'por_vencer' },
            { categoria: 'leasing', subtipo: 'fin_leasing', nombre: 'Fin de leasing', registro_id: null, fecha_vencimiento: '2026-11-16', dias_restantes: 25, estado: 'por_vencer' },
        ]);
        expect(v).toMatchObject({ requiere_accion: 8, vencidos: 2, peor_dias: -3 });
    });

    test('las tablas antiguas caen en su papel: seguro → póliza, permiso → permiso', async () => {
        mockFuentes({
            seguros: [{ id: 31, vehiculo_id: 7, subtipo: 'SOAP', fecha_vencimiento: '2026-10-17', dias_restantes: -5 }],
            permisos: [{ id: 41, vehiculo_id: 7, subtipo: 'permiso_circulacion', fecha_vencimiento: '2026-10-25', dias_restantes: 3 }],
        });

        const [v] = (await svc.getPapeles()).vehiculos;

        expect(papel(v, 'poliza')).toMatchObject({ estado: 'vencido', categoria: 'seguro', subtipo: 'SOAP', registro_id: 31 });
        expect(papel(v, 'permiso')).toMatchObject({ estado: 'por_vencer', categoria: 'permiso', subtipo: 'permiso_circulacion', registro_id: 41, avisa: true });
        expect(v.otros).toEqual([]);
    });

    test('una inscripción u otra categoría de documento con fecha va a otros con nombre legible', async () => {
        mockFuentes({
            documentos: [
                fila({ id: 5, subtipo: 'primera_inscripcion', dias_restantes: -40, fecha_vencimiento: '2026-09-12' }),
                fila({ id: 6, subtipo: 'certificado_gps', dias_restantes: 9, fecha_vencimiento: '2026-10-31' }),
                fila({ id: 7, subtipo: 'padron', fecha_vencimiento: null, dias_restantes: null }), // no vence: no va
            ],
        });

        const [v] = (await svc.getPapeles()).vehiculos;

        expect(v.otros.map(o => o.nombre)).toEqual(['Primera inscripción', 'Certificado gps']);
        expect(v.otros.map(o => o.estado)).toEqual(['vencido', 'por_vencer']);
    });
});

describe('getPapeles — estados del semáforo', () => {
    test('distingue vigente, sin fecha y sin registro', async () => {
        mockFuentes({
            documentos: [
                fila({ id: 1, subtipo: 'permiso_circulacion', dias_restantes: 200 }),
                fila({ id: 2, subtipo: 'poliza', fecha_vencimiento: null, dias_restantes: null }),
            ],
        });

        const r = await svc.getPapeles(30, { todos: '1' });
        const [v] = r.vehiculos;

        expect(papel(v, 'permiso')).toMatchObject({ estado: 'vigente', registro_id: 1 });
        expect(papel(v, 'poliza')).toMatchObject({ estado: 'sin_fecha', registro_id: 2, fecha_vencimiento: null, dias_restantes: null });
        for (const clave of ['tecnica', 'gases', 'mantencion']) {
            expect(papel(v, clave)).toEqual({
                clave, estado: 'sin_registro', categoria: null, subtipo: null,
                registro_id: null, fecha_vencimiento: null, dias_restantes: null, avisa: true,
            });
        }
        expect(v).toMatchObject({ requiere_accion: 0, vencidos: 0, peor_dias: null, otros: [] });
    });

    test('vence hoy (0 días) es por vencer; el día después de la ventana es vigente', async () => {
        mockFuentes({
            revisiones: [
                fila({ id: 1, subtipo: 'tecnica', dias_restantes: 0 }),
                fila({ id: 2, subtipo: 'gases', dias_restantes: 31 }),
            ],
        });

        const r = await svc.getPapeles(undefined, { todos: true });
        const [v] = r.vehiculos;

        expect(papel(v, 'tecnica').estado).toBe('por_vencer');
        expect(papel(v, 'gases').estado).toBe('vigente');
        expect(v).toMatchObject({ requiere_accion: 1, vencidos: 0, peor_dias: 0 });
    });

    test('un duplicado viejo vencido + el nuevo vigente → vigente, y el vehículo no aparece', async () => {
        const fuentes = {
            // El viejo llega primero a propósito: manda la fecha, no el orden de las filas.
            documentos: [
                fila({ id: 10, subtipo: 'permiso_circulacion', fecha_vencimiento: '2026-03-31', dias_restantes: -205 }),
                fila({ id: 11, subtipo: 'permiso_circulacion', fecha_vencimiento: '2027-03-31', dias_restantes: 160 }),
            ],
        };
        mockFuentes(fuentes);
        const r = await svc.getPapeles();
        expect(r.vehiculos).toEqual([]);
        expect(r.total_vehiculos).toBe(1);

        mockFuentes(fuentes);
        const [v] = (await svc.getPapeles(30, { todos: '1' })).vehiculos;
        expect(papel(v, 'permiso')).toMatchObject({ estado: 'vigente', registro_id: 11, fecha_vencimiento: '2027-03-31' });
    });

    test('un permiso de la tabla antigua vencido + el documento permiso_circulacion vigente → vigente', async () => {
        const fuentes = {
            documentos: [fila({ id: 12, subtipo: 'permiso_circulacion', fecha_vencimiento: '2027-01-30', dias_restantes: 100 })],
            permisos: [{ id: 5, vehiculo_id: 7, subtipo: 'permiso_circulacion', fecha_vencimiento: '2025-09-17', dias_restantes: -400 }],
        };
        mockFuentes(fuentes);
        expect((await svc.getPapeles()).vehiculos).toEqual([]);

        mockFuentes(fuentes);
        const [v] = (await svc.getPapeles(30, { todos: 1 })).vehiculos;
        expect(papel(v, 'permiso')).toMatchObject({ estado: 'vigente', categoria: 'documento', registro_id: 12 });
    });

    test('un registro sin fecha más nuevo no tapa al que sí tiene fecha', async () => {
        mockFuentes({
            documentos: [
                fila({ id: 20, subtipo: 'poliza', fecha_vencimiento: null, dias_restantes: null }),
                fila({ id: 19, subtipo: 'poliza', fecha_vencimiento: '2026-10-12', dias_restantes: -10 }),
            ],
        });

        const [v] = (await svc.getPapeles()).vehiculos;

        expect(papel(v, 'poliza')).toMatchObject({ estado: 'vencido', registro_id: 19 });
    });
});

describe('getPapeles — aviso apagado', () => {
    test('avisar_30d = 0 pinta según la fecha pero no suma a requiere acción', async () => {
        const fuentes = { revisiones: [fila({ id: 3, subtipo: 'gases', fecha_vencimiento: '2026-10-12', dias_restantes: -10, avisar_30d: false })] };
        mockFuentes(fuentes);
        expect((await svc.getPapeles()).vehiculos).toEqual([]);

        mockFuentes(fuentes);
        const [v] = (await svc.getPapeles(30, { todos: '1' })).vehiculos;
        expect(papel(v, 'gases')).toMatchObject({ estado: 'vencido', avisa: false });
        expect(v).toMatchObject({ requiere_accion: 0, vencidos: 0, peor_dias: null });
    });

    test('el seguro antiguo usa el aviso del vehículo (avisar_alerta_seguro)', async () => {
        mockFuentes({
            vehiculos: [vehiculo({ avisar_alerta_seguro: false })],
            seguros: [{ id: 31, vehiculo_id: 7, subtipo: 'SOAP', fecha_vencimiento: '2026-10-17', dias_restantes: -5 }],
        });

        const [v] = (await svc.getPapeles(30, { todos: '1' })).vehiculos;

        expect(papel(v, 'poliza')).toMatchObject({ estado: 'vencido', avisa: false });
        expect(v.requiere_accion).toBe(0);
    });

    test('lo de otros con el aviso apagado no aparece (ni seguro a terceros ni fin de leasing)', async () => {
        mockFuentes({
            documentos: [fila({ id: 3, subtipo: 'seguro_terceros', dias_restantes: -2, avisar_30d: false })],
            leasing: [{ vehiculo_id: 7, fecha_vencimiento: '2026-11-01', dias_restantes: 10, avisar_leasing_30d: false }],
        });

        const [v] = (await svc.getPapeles(30, { todos: '1' })).vehiculos;

        expect(v.otros).toEqual([]);
        expect(v.requiere_accion).toBe(0);
    });

    test('pre-migración 105: si avisar_30d no existe, se relee sin la columna y avisa', async () => {
        db.query
            .mockResolvedValueOnce([[vehiculo()]])                                         // vehículos
            .mockRejectedValueOnce(errBadField())                                          // documentos con avisar_30d → no existe
            .mockResolvedValueOnce([[{ id: 1, vehiculo_id: 7, subtipo: 'poliza', fecha_vencimiento: '2026-10-27', dias_restantes: 5 }]]) // fallback
            .mockResolvedValueOnce([[]])                                                   // revisiones
            .mockResolvedValueOnce([[]])                                                   // mantenciones
            .mockResolvedValueOnce([[]])                                                   // seguros
            .mockResolvedValueOnce([[]])                                                   // permisos
            .mockResolvedValueOnce([[]]);                                                  // leasing

        const [v] = (await svc.getPapeles()).vehiculos;

        expect(db.query.mock.calls[1][0]).toMatch(/x\.avisar_30d/);
        expect(db.query.mock.calls[2][0]).not.toMatch(/avisar_30d/);
        expect(papel(v, 'poliza')).toMatchObject({ estado: 'por_vencer', avisa: true });
        expect(v.requiere_accion).toBe(1);
    });

    test('sin la columna avisar_alerta_seguro en el vehículo, el seguro avisa', async () => {
        mockFuentes({
            vehiculos: [vehiculo()], // sin avisar_alerta_seguro: la mig 103 no corrió
            seguros: [{ id: 31, vehiculo_id: 7, subtipo: 'SOAP', fecha_vencimiento: '2026-10-25', dias_restantes: 3 }],
        });

        const [v] = (await svc.getPapeles()).vehiculos;

        expect(papel(v, 'poliza')).toMatchObject({ estado: 'por_vencer', avisa: true });
    });

    test('pre-migraciones 106 y 103: el leasing se relee sin su aviso y, si falta todo, queda vacío', async () => {
        db.query
            .mockResolvedValueOnce([[vehiculo()]])
            .mockResolvedValueOnce([[]]).mockResolvedValueOnce([[]]).mockResolvedValueOnce([[]])
            .mockResolvedValueOnce([[]]).mockResolvedValueOnce([[]])
            .mockRejectedValueOnce(errBadField())                                          // con avisar_leasing_30d
            .mockResolvedValueOnce([[{ vehiculo_id: 7, fecha_vencimiento: '2026-10-30', dias_restantes: 8 }]]);
        const [v] = (await svc.getPapeles()).vehiculos;
        expect(db.query.mock.calls[7][0]).not.toMatch(/avisar_leasing_30d/);
        expect(v.otros).toEqual([expect.objectContaining({ subtipo: 'fin_leasing', nombre: 'Fin de leasing', dias_restantes: 8 })]);

        db.query.mockReset().mockResolvedValue([[]]);
        db.query
            .mockResolvedValueOnce([[vehiculo()]])
            .mockResolvedValueOnce([[]]).mockResolvedValueOnce([[]]).mockResolvedValueOnce([[]])
            .mockResolvedValueOnce([[]]).mockResolvedValueOnce([[]])
            .mockRejectedValueOnce(errBadField())
            .mockRejectedValueOnce(errBadField());                                         // sin leasing_fecha_termino
        const r = await svc.getPapeles(30, { todos: '1' });
        expect(r.vehiculos[0].otros).toEqual([]);
    });

    test('un error que no es de columna ausente no se esconde', async () => {
        db.query
            .mockResolvedValueOnce([[vehiculo()]])
            .mockRejectedValueOnce(Object.assign(new Error('Too many connections'), { code: 'ER_CON_COUNT_ERROR' }));
        await expect(svc.getPapeles()).rejects.toThrow(/Too many connections/);
    });
});

describe('getPapeles — quiénes vienen y en qué orden', () => {
    test('trae el conductor y la empresa, o null si no tiene', async () => {
        mockFuentes({
            vehiculos: [
                vehiculo(),
                vehiculo({ id: 8, patente: 'LRCV-17', conductor_id: null, conductor_nombre: null, empresa_id: null, empresa_nombre: null, modelo: null }),
            ],
        });

        const r = await svc.getPapeles(30, { todos: '1' });
        const porId = Object.fromEntries(r.vehiculos.map(v => [v.vehiculo_id, v]));

        expect(porId[7]).toMatchObject({
            patente: 'KRPD-17', marca: 'HYUNDAI', modelo: 'HD78', tipo: 'camion',
            empresa_id: 2, empresa_nombre: 'LOLS', conductor_id: 4, conductor_nombre: 'Juan Pérez',
        });
        expect(porId[8]).toMatchObject({ conductor_id: null, conductor_nombre: null, empresa_id: null, empresa_nombre: null, modelo: null });
        // La consulta del vehículo une con conductores y empresas (no hay teléfono en ninguna).
        expect(db.query.mock.calls[0][0]).toMatch(/LEFT JOIN conductores c ON c\.id = v\.conductor_id/);
        expect(db.query.mock.calls[0][0]).toMatch(/LEFT JOIN empresas_vehiculos ev ON ev\.id = v\.empresa_id/);
    });

    test('ordena por el papel más urgente y luego patente; los que están al día solo con ?todos=1', async () => {
        const fuentes = {
            vehiculos: [
                vehiculo({ id: 1, patente: 'BBBB-11' }),
                vehiculo({ id: 2, patente: 'AAAA-22' }),
                vehiculo({ id: 3, patente: 'CCCC-33' }),
                vehiculo({ id: 4, patente: 'DDDD-44' }),
            ],
            documentos: [
                fila({ id: 1, vehiculo_id: 1, subtipo: 'poliza', dias_restantes: 20 }),
                fila({ id: 2, vehiculo_id: 2, subtipo: 'poliza', dias_restantes: -5 }),
                fila({ id: 3, vehiculo_id: 3, subtipo: 'poliza', dias_restantes: 300 }),
                fila({ id: 4, vehiculo_id: 4, subtipo: 'poliza', dias_restantes: -5 }),
                fila({ id: 5, vehiculo_id: 4, subtipo: 'permiso_circulacion', dias_restantes: 12 }),
            ],
        };
        mockFuentes(fuentes);
        const r = await svc.getPapeles();
        expect(r.vehiculos.map(v => v.patente)).toEqual(['AAAA-22', 'DDDD-44', 'BBBB-11']);
        expect(r.vehiculos.map(v => v.peor_dias)).toEqual([-5, -5, 20]);
        expect(r.vehiculos.find(v => v.patente === 'DDDD-44')).toMatchObject({ requiere_accion: 2, vencidos: 1 });
        expect(r.total_vehiculos).toBe(4);

        mockFuentes(fuentes);
        const todos = await svc.getPapeles(30, { todos: '1' });
        expect(todos.vehiculos.map(v => v.patente)).toEqual(['AAAA-22', 'DDDD-44', 'BBBB-11', 'CCCC-33']);
        expect(todos.vehiculos[3]).toMatchObject({ requiere_accion: 0, peor_dias: null });
        expect(todos.total_vehiculos).toBe(4);
    });

    test('sin vehículos activos responde vacío', async () => {
        mockFuentes({ vehiculos: [] });
        expect(await svc.getPapeles()).toEqual({ dias: 30, total_vehiculos: 0, vehiculos: [] });
    });

    test('solo mira registros activos de vehículos activos', async () => {
        mockFuentes({});
        await svc.getPapeles();
        expect(db.query.mock.calls[0][0]).toMatch(/WHERE v\.activo = 1/);
        for (const i of [1, 2, 3]) expect(db.query.mock.calls[i][0]).toMatch(/x\.activo = 1 AND v\.activo = 1/);
        expect(db.query.mock.calls[4][0]).toMatch(/s\.activo = 1 AND v\.activo = 1/);
        expect(db.query.mock.calls[5][0]).toMatch(/p\.activo = 1 AND v\.activo = 1/);
        expect(db.query.mock.calls[6][0]).toMatch(/v\.es_leasing = 1 AND v\.leasing_terminado = 0/);
    });

    test('NO consulta licencias de conducir: el aviso es de los papeles del vehículo', async () => {
        mockFuentes({});
        await svc.getPapeles();
        const sqls = db.query.mock.calls.map(([sql]) => sql).join(' ');
        expect(sqls).not.toMatch(/trabajadores/);
        expect(sqls).not.toMatch(/licencia_vencimiento/);
    });
});

describe('getPapeles — días y fechas', () => {
    test('la ventana de días llega como texto y cambia qué es por vencer', async () => {
        const fuentes = { documentos: [fila({ subtipo: 'poliza', dias_restantes: 20 })] };
        mockFuentes(fuentes);
        const r15 = await svc.getPapeles('15', { todos: '1' });
        expect(r15.dias).toBe(15);
        expect(papel(r15.vehiculos[0], 'poliza').estado).toBe('vigente');

        mockFuentes(fuentes);
        const r30 = await svc.getPapeles('30', { todos: '1' });
        expect(papel(r30.vehiculos[0], 'poliza').estado).toBe('por_vencer');
    });

    test.each(['abc', '', '-5', '2.5', null, undefined, -1, 1.5])('un valor de días inválido (%p) cae a 30', async (dias) => {
        mockFuentes({});
        const r = await svc.getPapeles(dias);
        expect(r.dias).toBe(30);
    });

    test('0 días es válido: solo lo vencido y lo que vence hoy requieren acción', async () => {
        const fuentes = { documentos: [fila({ subtipo: 'poliza', dias_restantes: 1 }), fila({ id: 2, subtipo: 'permiso_circulacion', dias_restantes: 0 })] };
        mockFuentes(fuentes);
        const r = await svc.getPapeles('0', { todos: '1' });
        expect(r.dias).toBe(0);
        expect(papel(r.vehiculos[0], 'poliza').estado).toBe('vigente');
        expect(papel(r.vehiculos[0], 'permiso').estado).toBe('por_vencer'); // vence hoy: entra aun con 0 días
        expect(r.vehiculos[0]).toMatchObject({ requiere_accion: 1, peor_dias: 0 });

        mockFuentes(fuentes); // el 0 numérico también vale (no cae a 30)
        const n = await svc.getPapeles(0, { todos: '1' });
        expect(n.dias).toBe(0);
        expect(papel(n.vehiculos[0], 'permiso').estado).toBe('por_vencer');
    });

    test('usa el piso 2000-01-01 en todas las consultas con fecha', async () => {
        mockFuentes({});
        await svc.getPapeles();
        // La primera es la de vehículos (sin fechas); las otras 6 llevan el piso dos veces.
        db.query.mock.calls.slice(1).forEach(([sql, params]) => {
            expect(sql).toMatch('>= ?');
            expect(params).toEqual(['2000-01-01', '2000-01-01']);
        });
        expect(db.query).toHaveBeenCalledTimes(7);
    });

    test('una fecha basura (1899-11-30) cuenta como sin fecha, no como vencida', async () => {
        mockFuentes({
            revisiones: [fila({ id: 9, subtipo: 'tecnica', fecha_vencimiento: '1899-11-30', dias_restantes: -46288 })],
            mantenciones: [fila({ id: 8, subtipo: 'Mantención', fecha_vencimiento: '2026-11-01', dias_restantes: null })],
        });

        const r = await svc.getPapeles(30, { todos: '1' });
        const [v] = r.vehiculos;

        expect(papel(v, 'tecnica')).toMatchObject({ estado: 'sin_fecha', registro_id: 9, fecha_vencimiento: null, dias_restantes: null });
        // Sin días calculables tampoco se inventa un «vence hoy» (Number(null) es 0).
        expect(papel(v, 'mantencion')).toMatchObject({ estado: 'sin_fecha', dias_restantes: null });
        expect(v.requiere_accion).toBe(0);
    });
});

describe('GET /api/vehiculos/papeles', () => {
    test('pide vehiculos.ver y no toca la BD sin él', async () => {
        const res = await request(app).get('/api/vehiculos/papeles').set('Authorization', `Bearer ${token(['vehiculos.editar'])}`);
        expect(res.status).toBe(403);
        expect(db.query).not.toHaveBeenCalled();
    });

    test('va antes de /:id: responde los papeles y no busca un vehículo llamado «papeles»', async () => {
        const res = await request(app).get('/api/vehiculos/papeles').set('Authorization', `Bearer ${token(['vehiculos.ver'])}`);
        expect(res.status).toBe(200);
        expect(res.body.data).toEqual({ dias: 30, total_vehiculos: 0, vehiculos: [] });
        const sqls = db.query.mock.calls.map(([sql]) => sql).join(' ');
        expect(sqls).not.toMatch(/WHERE v\.id = \?/);
    });

    test('pasa ?dias y ?todos al servicio', async () => {
        const spy = jest.spyOn(svc, 'getPapeles');
        try {
            const res = await request(app).get('/api/vehiculos/papeles?dias=15&todos=1').set('Authorization', `Bearer ${token(['vehiculos.ver'])}`);
            expect(res.status).toBe(200);
            expect(spy).toHaveBeenCalledWith('15', { todos: '1' });
            expect(res.body.data.dias).toBe(15);
        } finally {
            spy.mockRestore();
        }
    });
});
