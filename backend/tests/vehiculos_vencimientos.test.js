/**
 * Tests del contador de vencimientos del módulo Vehículos (mig 100).
 *
 * Fija QUÉ entra en el número que se muestra en el menú lateral:
 *   · lo YA VENCIDO + lo que vence dentro de N días (default 30),
 *   · de las 5 fuentes del VEHÍCULO (documentos, revisiones, mantenciones,
 *     seguros y permisos de circulación) — las licencias de conducir NO entran,
 *     ver el test correspondiente,
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
const mockFuentes = ({ documentos = [], revisiones = [], mantenciones = [], seguros = [], permisos = [], leasing = [] }) => {
    db.query
        .mockResolvedValueOnce([documentos])
        .mockResolvedValueOnce([revisiones])
        .mockResolvedValueOnce([mantenciones])
        .mockResolvedValueOnce([seguros])
        .mockResolvedValueOnce([permisos])
        .mockResolvedValueOnce([leasing]);
};

/** Error de columna inexistente (migración pendiente) como lo tira mysql2. */
const errBadField = () => Object.assign(new Error('Unknown column'), { code: 'ER_BAD_FIELD_ERROR' });

describe('getVencimientos — contador del menú', () => {
    beforeEach(() => jest.clearAllMocks());

    test('junta las 6 fuentes del vehículo en una sola lista', async () => {
        mockFuentes({
            documentos:   [fila({ categoria: 'documento',  dias_restantes: 5 })],
            revisiones:   [fila({ categoria: 'revision',   dias_restantes: 20 })],
            mantenciones: [fila({ categoria: 'mantencion', dias_restantes: 12 })],
            seguros:      [fila({ categoria: 'seguro',     dias_restantes: 30 })],
            permisos:     [fila({ categoria: 'permiso',    dias_restantes: 1 })],
            leasing:      [fila({ categoria: 'leasing',    subtipo: 'fin_leasing', dias_restantes: 29 })],
        });

        const r = await svc.getVencimientos();

        expect(r.total).toBe(6);
        expect(db.query).toHaveBeenCalledTimes(6);
        expect(new Set(r.items.map(i => i.categoria)))
            .toEqual(new Set(['documento', 'revision', 'mantencion', 'seguro', 'permiso', 'leasing']));
    });

    test('el fin de leasing entra al contador (30 días antes, pedido de jefatura)', async () => {
        mockFuentes({ leasing: [fila({ categoria: 'leasing', subtipo: 'fin_leasing', dias_restantes: 29 })] });

        const r = await svc.getVencimientos();

        expect(r.total).toBe(1);
        expect(r.items[0].categoria).toBe('leasing');
        const [sql, params] = db.query.mock.calls[5];
        expect(sql).toMatch(/es_leasing = 1/);
        expect(sql).toMatch(/leasing_fecha_termino IS NOT NULL/);
        expect(params).toEqual(['2000-01-01', 30]);
    });

    test('documentos, revisiones y mantenciones respetan su checkbox avisar_30d', async () => {
        mockFuentes({});
        await svc.getVencimientos();
        // Las 3 primeras consultas (docs, revisiones, mantenciones) llevan el filtro.
        for (const i of [0, 1, 2]) {
            expect(db.query.mock.calls[i][0]).toMatch(/avisar_30d = 1/);
        }
    });

    test('pre-migración 105: si avisar_30d no existe, cae a la consulta sin filtro', async () => {
        db.query
            .mockRejectedValueOnce(errBadField())                              // documentos filtrados → no existe
            .mockResolvedValueOnce([[fila({ categoria: 'documento', dias_restantes: 4 })]]) // fallback
            .mockResolvedValueOnce([[]])                                       // revisiones
            .mockResolvedValueOnce([[]])                                       // mantenciones
            .mockResolvedValueOnce([[]])                                       // seguros
            .mockResolvedValueOnce([[]])                                       // permisos
            .mockResolvedValueOnce([[]]);                                      // leasing

        const r = await svc.getVencimientos();
        expect(r.total).toBe(1);
        expect(db.query.mock.calls[1][0]).not.toMatch(/avisar_30d/);
    });

    test('los seguros respetan el checkbox avisar_alerta_seguro del vehículo', async () => {
        mockFuentes({ seguros: [fila({ categoria: 'seguro', dias_restantes: 10 })] });
        await svc.getVencimientos();
        const [sql] = db.query.mock.calls[3];
        expect(sql).toMatch(/avisar_alerta_seguro = 1/);
    });

    test('pre-migración 103: seguros cae a la consulta sin filtro y leasing queda vacío', async () => {
        db.query
            .mockResolvedValueOnce([[]])                                       // documentos
            .mockResolvedValueOnce([[]])                                       // revisiones
            .mockResolvedValueOnce([[]])                                       // mantenciones
            .mockRejectedValueOnce(errBadField())                              // seguros filtrados → columna no existe
            .mockResolvedValueOnce([[fila({ categoria: 'seguro', dias_restantes: 3 })]]) // fallback sin filtro
            .mockResolvedValueOnce([[]])                                       // permisos
            .mockRejectedValueOnce(errBadField());                             // leasing → columna no existe

        const r = await svc.getVencimientos();

        expect(r.total).toBe(1);
        expect(r.items[0].categoria).toBe('seguro');
        // La consulta de fallback NO lleva el filtro nuevo.
        const [fallbackSql] = db.query.mock.calls[4];
        expect(fallbackSql).not.toMatch(/avisar_alerta_seguro/);
    });

    test('NO consulta licencias de conducir: el aviso es de los papeles del vehículo', async () => {
        mockFuentes({});
        await svc.getVencimientos();
        const sqls = db.query.mock.calls.map(([sql]) => sql).join(' ');
        expect(sqls).not.toMatch(/trabajadores/);
        expect(sqls).not.toMatch(/licencia_vencimiento/);
    });

    test('descarta fechas basura de importaciones viejas (1899-11-30)', async () => {
        mockFuentes({});
        await svc.getVencimientos();
        // Toda consulta lleva el piso de fecha como primer parámetro.
        db.query.mock.calls.forEach(([sql, params]) => {
            expect(sql).toMatch('>= ?');
            expect(params[0]).toBe('2000-01-01');
        });
    });

    test('una fila sin días calculables no se cuenta (se vería como "Vence hoy")', async () => {
        mockFuentes({
            documentos: [fila({ id: 1, dias_restantes: null }), fila({ id: 2, dias_restantes: 4 })],
        });
        const r = await svc.getVencimientos();
        expect(r.total).toBe(1);
        expect(r.items[0].id).toBe(2);
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
        db.query.mock.calls.forEach(([, params]) => expect(params).toEqual(['2000-01-01', 15]));
    });

    test('un valor de días inválido cae al default de 30', async () => {
        mockFuentes({});
        const r = await svc.getVencimientos('abc');
        expect(r.dias).toBe(30);
        db.query.mock.calls.forEach(([, params]) => expect(params).toEqual(['2000-01-01', 30]));
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

describe('adjuntarArchivo — certificado/boleta de revisiones y mantenciones (mig 102)', () => {
    beforeEach(() => jest.clearAllMocks());

    const file = { originalname: 'certificado.pdf', path: require('path').join(__dirname, '../uploads/vehiculos/7/abc.pdf') };

    test('guarda nombre y ruta en la tabla del tipo indicado', async () => {
        db.query.mockResolvedValueOnce([{ affectedRows: 1 }]).mockResolvedValueOnce([[{ id: 9 }]]);

        await svc.adjuntarArchivo('revisiones', 7, 9, file);

        const [sql, params] = db.query.mock.calls[0];
        expect(sql).toMatch(/UPDATE vehiculo_revisiones/);
        expect(params[0]).toBe('certificado.pdf');
        expect(params.slice(2)).toEqual([9, 7]);          // id del registro + vehículo
    });

    test('mantenciones usa su propia tabla', async () => {
        db.query.mockResolvedValueOnce([{ affectedRows: 1 }]).mockResolvedValueOnce([[{ id: 4 }]]);
        await svc.adjuntarArchivo('mantenciones', 7, 4, file);
        expect(db.query.mock.calls[0][0]).toMatch(/UPDATE vehiculo_mantenciones/);
    });

    test('un tipo inventado no llega al SQL (el nombre de tabla se interpola)', async () => {
        await expect(svc.adjuntarArchivo('usuarios; DROP TABLE x', 7, 1, file)).rejects.toThrow(/inválido/i);
        expect(db.query).not.toHaveBeenCalled();
    });

    test('sin archivo o con registro inexistente falla explícito', async () => {
        await expect(svc.adjuntarArchivo('revisiones', 7, 9, null)).rejects.toThrow(/archivo/i);
        db.query.mockResolvedValueOnce([{ affectedRows: 0 }]);
        await expect(svc.adjuntarArchivo('revisiones', 7, 999, file)).rejects.toThrow(/no encontrado/i);
    });

    test('la respuesta NO incluye la ruta en disco, solo el nombre', async () => {
        db.query.mockResolvedValueOnce([{ affectedRows: 1 }])
            .mockResolvedValueOnce([[{ id: 9, nombre_archivo: 'certificado.pdf', ruta_archivo: 'vehiculos/7/abc.pdf' }]]);

        const r = await svc.adjuntarArchivo('revisiones', 7, 9, file);

        expect(r.nombre_archivo).toBe('certificado.pdf');
        expect(r).not.toHaveProperty('ruta_archivo');
    });

    test('descargar exige que el registro tenga adjunto', async () => {
        db.query.mockResolvedValueOnce([[{ nombre_archivo: null, ruta_archivo: null }]]);
        await expect(svc.getArchivoRegistroPath('revisiones', 7, 9)).rejects.toThrow(/no tiene archivo/i);
    });
});
