/**
 * Tests del contador de vencimientos del módulo Vehículos (mig 100).
 *
 * Fija QUÉ entra en el número que se muestra en el menú lateral:
 *   · lo YA VENCIDO + lo que vence dentro de N días (default 30),
 *   · de TODAS las fuentes del módulo (documentos, revisiones, mantenciones,
 *     seguros, permisos de circulación y licencias de conducir),
 *   · ordenado por urgencia (lo más vencido primero).
 *
 * Y que subir un documento sin fecha/vencimiento sigue siendo válido: cargar el
 * archivo es lo único obligatorio (hay documentos que no vencen, como el padrón).
 *
 * Mocks de BD, sin conexión real (patrón de crud_entities.test.js).
 */

jest.mock('../src/config/db', () => ({
    query: jest.fn().mockResolvedValue([[]]),
}));

const db = require('../src/config/db');
const svc = require('../src/services/vehiculos.service');

const fila = (over = {}) => ({
    categoria: 'documento', id: 1, vehiculo_id: 7, subtipo: 'permiso_circulacion',
    patente: 'KRPD-17', marca: 'HYUNDAI', modelo: 'HD78',
    fecha_vencimiento: '2026-09-01', dias_restantes: 10, ...over,
});

/** Encola las 6 consultas de getVencimientos en orden. */
const mockFuentes = ({ documentos = [], revisiones = [], mantenciones = [], seguros = [], permisos = [], licencias = [] }) => {
    db.query
        .mockResolvedValueOnce([documentos])
        .mockResolvedValueOnce([revisiones])
        .mockResolvedValueOnce([mantenciones])
        .mockResolvedValueOnce([seguros])
        .mockResolvedValueOnce([permisos])
        .mockResolvedValueOnce([licencias]);
};

describe('getVencimientos — contador del menú', () => {
    beforeEach(() => jest.clearAllMocks());

    test('junta las 6 fuentes del módulo en una sola lista', async () => {
        mockFuentes({
            documentos:   [fila({ categoria: 'documento',  dias_restantes: 5 })],
            revisiones:   [fila({ categoria: 'revision',   dias_restantes: 20 })],
            mantenciones: [fila({ categoria: 'mantencion', dias_restantes: 12 })],
            seguros:      [fila({ categoria: 'seguro',     dias_restantes: 30 })],
            permisos:     [fila({ categoria: 'permiso',    dias_restantes: 1 })],
            licencias:    [fila({ categoria: 'licencia',   dias_restantes: 3, patente: null })],
        });

        const r = await svc.getVencimientos();

        expect(r.total).toBe(6);
        expect(db.query).toHaveBeenCalledTimes(6);
        expect(new Set(r.items.map(i => i.categoria)))
            .toEqual(new Set(['documento', 'revision', 'mantencion', 'seguro', 'permiso', 'licencia']));
    });

    test('cuenta lo vencido y lo por vencer por separado', async () => {
        mockFuentes({
            documentos: [fila({ dias_restantes: -12 }), fila({ id: 2, dias_restantes: -1 })],
            revisiones: [fila({ categoria: 'revision', dias_restantes: 0 })],  // vence HOY = por vencer
            seguros:    [fila({ categoria: 'seguro', dias_restantes: 28 })],
        });

        const r = await svc.getVencimientos();

        expect(r.total).toBe(4);
        expect(r.vencidos).toBe(2);      // dias_restantes < 0
        expect(r.por_vencer).toBe(2);    // hoy (0) cuenta como por vencer, no como vencido
    });

    test('ordena por urgencia: lo más vencido primero', async () => {
        mockFuentes({
            documentos: [fila({ id: 1, dias_restantes: 25 }), fila({ id: 2, dias_restantes: -40 })],
            seguros:    [fila({ categoria: 'seguro', id: 3, dias_restantes: 2 })],
        });

        const r = await svc.getVencimientos();

        expect(r.items.map(i => i.dias_restantes)).toEqual([-40, 2, 25]);
    });

    test('el rango de días se castea y se pasa a las 6 consultas', async () => {
        mockFuentes({});
        // Llega como string desde req.query (?dias=15)
        const r = await svc.getVencimientos('15');
        expect(r.dias).toBe(15);
        db.query.mock.calls.forEach(([, params]) => expect(params).toEqual([15]));
    });

    test('un valor de días inválido cae al default de 30', async () => {
        mockFuentes({});
        const r = await svc.getVencimientos('abc');
        expect(r.dias).toBe(30);
        db.query.mock.calls.forEach(([, params]) => expect(params).toEqual([30]));
    });

    test('sin vencimientos el total es 0 (el menú no muestra número)', async () => {
        mockFuentes({});
        const r = await svc.getVencimientos();
        expect(r).toMatchObject({ total: 0, vencidos: 0, por_vencer: 0 });
        expect(r.items).toEqual([]);
    });
});

describe('createDocumento — fecha y vencimiento opcionales', () => {
    beforeEach(() => jest.clearAllMocks());

    const file = { originalname: 'permiso.pdf', path: require('path').join(__dirname, '../uploads/vehiculos/permiso.pdf') };

    test('guarda fecha, vencimiento y observaciones cuando vienen', async () => {
        db.query.mockResolvedValueOnce([{ insertId: 55 }]).mockResolvedValueOnce([[{ id: 55 }]]);

        await svc.createDocumento(7, {
            categoria: 'permiso_circulacion', file, userId: 3,
            fecha: '2026-01-10', fecha_vencimiento: '2027-01-10', observaciones: 'Pagado en línea',
        });

        const params = db.query.mock.calls[0][1];
        expect(params.slice(-3)).toEqual(['2026-01-10', '2027-01-10', 'Pagado en línea']);
    });

    test('sin fechas guarda NULL, no cadenas vacías (MySQL rechaza la fecha vacía)', async () => {
        db.query.mockResolvedValueOnce([{ insertId: 56 }]).mockResolvedValueOnce([[{ id: 56 }]]);

        // multipart manda '' cuando el campo quedó en blanco
        await svc.createDocumento(7, {
            categoria: 'primera_inscripcion', file, userId: 3,
            fecha: '', fecha_vencimiento: '', observaciones: '   ',
        });

        const params = db.query.mock.calls[0][1];
        expect(params.slice(-3)).toEqual([null, null, null]);
    });

    test('sigue exigiendo el archivo y la categoría', async () => {
        await expect(svc.createDocumento(7, { categoria: 'poliza', file: null })).rejects.toThrow(/archivo/i);
        await expect(svc.createDocumento(7, { categoria: '', file })).rejects.toThrow(/categoría/i);
    });
});
