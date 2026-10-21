/**
 * Sobrescribir documentos de vehículos al renovarlos (2026-10-21: «poder eliminar el
 * documento y subir uno nuevo y actualizar las fechas»). Lo que fijan:
 *   · reemplazar el archivo de un documento solo cambia nombre y ruta del activo, y la ruta no sale en el JSON;
 *   · un vehículo tiene UN registro vigente por tipo: al crear uno nuevo, los anteriores del mismo tipo se
 *     dan de baja (activo = 0), los de otro tipo no;
 *   · la ruta nueva pide vehiculos.editar.
 *
 * Mocks de BD, sin conexión real (patrón de asistencia_borrar.test.js).
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
const app = require('../index');
const db = require('../src/config/db');
const svc = require('../src/services/vehiculos.service');
const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'secret';
const token = (permisos) => jwt.sign({ id: 9, email: 'op@lols.cl', rol_id: 1, rv: 1, p: permisos }, SECRET);

describe('vehiculos.service — archivos al editar', () => {
    beforeEach(() => jest.clearAllMocks());

    test('reemplazarArchivoDocumento cambia nombre y ruta del documento activo y no expone la ruta', async () => {
        db.query
            .mockResolvedValueOnce([{ affectedRows: 1 }])
            .mockResolvedValueOnce([[{ id: 5, vehiculo_id: 2, nombre_archivo: 'poliza-2027.pdf', ruta_archivo: 'vehiculos/x.pdf' }]]);
        const file = { originalname: 'poliza-2027.pdf', path: require('path').join(svc.UPLOADS_DIR || '', 'vehiculos', 'x.pdf') };
        const r = await svc.reemplazarArchivoDocumento(2, 5, file);
        const [sql, params] = db.query.mock.calls[0];
        expect(sql).toMatch(/UPDATE vehiculo_documentos SET nombre_archivo = \?, ruta_archivo = \?/);
        expect(sql).toMatch(/activo = 1/);
        expect(params[0]).toBe('poliza-2027.pdf');
        expect(params.slice(2)).toEqual([5, 2]);
        expect(r.ruta_archivo).toBeUndefined();
        expect(r.nombre_archivo).toBe('poliza-2027.pdf');
    });

    test('reemplazarArchivoDocumento sin archivo → 400; documento inexistente → 404', async () => {
        await expect(svc.reemplazarArchivoDocumento(2, 5, null)).rejects.toMatchObject({ statusCode: 400 });
        db.query.mockResolvedValueOnce([{ affectedRows: 0 }]);
        await expect(svc.reemplazarArchivoDocumento(2, 5, { originalname: 'a.pdf', path: '/tmp/a.pdf' })).rejects.toMatchObject({ statusCode: 404 });
    });

    test('al crear un documento, los anteriores de la MISMA categoría se dan de baja (uno vigente)', async () => {
        db.query
            .mockResolvedValueOnce([{ insertId: 60 }])          // INSERT
            .mockResolvedValueOnce([{ affectedRows: 1 }])       // baja del anterior
            .mockResolvedValueOnce([[{ id: 60, categoria: 'seguro_terceros' }]]);
        const file = { originalname: 'soap-2027.pdf', path: require('path').join(__dirname, '../uploads/vehiculos/s.pdf') };
        await svc.createDocumento(2, { categoria: 'seguro_terceros', file, userId: 3 });
        const [sql, params] = db.query.mock.calls[1];
        expect(sql).toMatch(/UPDATE vehiculo_documentos SET activo = 0 WHERE vehiculo_id = \? AND categoria = \? AND activo = 1 AND id <> \?/);
        expect(params).toEqual([2, 'seguro_terceros', 60]);
    });

    test('al crear una revisión, la anterior del mismo tipo se da de baja; la de otro tipo no', async () => {
        db.query
            .mockResolvedValueOnce([[{ Field: 'vehiculo_id' }]])  // columnas (buildInsert) si las pide
            .mockResolvedValue([{ insertId: 70, affectedRows: 1 }]);
        await svc.createRevision(2, { tipo: 'tecnica', fecha: '2026-10-21', fecha_vencimiento: '2027-04-21' });
        const baja = db.query.mock.calls.find(c => /UPDATE vehiculo_revisiones SET activo = 0/.test(c[0]));
        expect(baja).toBeDefined();
        expect(baja[1][0]).toBe(2);
        expect(baja[1][1]).toBe('tecnica');
    });
});

describe('ruta nueva de archivo de documento', () => {
    beforeEach(() => jest.clearAllMocks());

    test('PUT .../documentos/:id/archivo sin archivo → 400, y pide vehiculos.editar', async () => {
        const sin = await request(app).put('/api/vehiculos/2/documentos/5/archivo').set('Authorization', `Bearer ${token(['vehiculos.ver'])}`);
        expect(sin.status).toBe(403);
        const vacio = await request(app).put('/api/vehiculos/2/documentos/5/archivo').set('Authorization', `Bearer ${token(['vehiculos.editar'])}`);
        expect(vacio.status).toBe(400);
        expect(db.query).not.toHaveBeenCalled();
    });
});
