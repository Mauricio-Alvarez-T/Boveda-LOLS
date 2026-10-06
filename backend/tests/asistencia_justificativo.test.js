/**
 * Tests del justificativo adjunto a un período de ausencia (mig 118).
 *
 * Pedido de RRHH 2026-10-06: al marcar Falta o Falta justificada poder subir la
 * foto o el archivo que la respalda. Lo que fijan:
 *   · las gates: subir/quitar = asistencia.periodo.crear, ver = asistencia.periodo.ver
 *     (sin permiso → 403 ANTES de que multer escriba nada),
 *   · sin archivo → 400; período inexistente → 404 y se borra lo recién subido;
 *     período cancelado → 400 y también se borra,
 *   · la ruta en disco NUNCA sale al JSON (getPeriodos la quita y expone
 *     tiene_justificativo),
 *   · al reemplazar, el archivo anterior se borra del disco,
 *   · y el fallo del log jamás revierte el adjunto.
 *
 * Mocks de BD y de fs, sin conexión real ni escritura en disco.
 */

jest.mock('../src/config/db', () => ({
    query: jest.fn().mockResolvedValue([[]]),
}));
jest.mock('../src/middleware/logger', () => ({
    logManualActivity: jest.fn().mockResolvedValue(undefined),
    activityLogger: (req, res, next) => next(),
    resolveEntidad: jest.fn(),
}));
jest.mock('fs', () => {
    const real = jest.requireActual('fs');
    return { ...real, unlinkSync: jest.fn() };
});

const request = require('supertest');
const fs = require('fs');
const path = require('path');
const app = require('../index');
const db = require('../src/config/db');
const { logManualActivity } = require('../src/middleware/logger');
const svc = require('../src/services/asistencia.service');
const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'secret';
const makeToken = (permisos) =>
    jwt.sign({ id: 9, email: 'rrhh@lols.cl', rol_id: 1, rv: 1, p: permisos }, SECRET);

const UPLOADS = path.join(__dirname, '../uploads');
const archivo = (over = {}) => ({
    originalname: 'certificado.jpg',
    mimetype: 'image/jpeg',
    size: 2048,
    path: path.join(UPLOADS, 'justificativos', '77', '123-456.jpg'),
    ...over,
});

describe('asistenciaService.adjuntarJustificativo', () => {
    beforeEach(() => jest.clearAllMocks());

    test('sin archivo → 400 y no toca la BD', async () => {
        await expect(svc.adjuntarJustificativo(77, undefined, 9, {}))
            .rejects.toMatchObject({ statusCode: 400 });
        expect(db.query).not.toHaveBeenCalled();
    });

    test('período inexistente → 404 y borra lo recién subido', async () => {
        db.query.mockResolvedValueOnce([[]]);
        const f = archivo();
        await expect(svc.adjuntarJustificativo(77, f, 9, {}))
            .rejects.toMatchObject({ statusCode: 404 });
        expect(fs.unlinkSync).toHaveBeenCalledWith(f.path);
    });

    test('período cancelado → 400 y borra lo recién subido', async () => {
        db.query.mockResolvedValueOnce([[{ id: 77, activo: 0, justificativo_ruta: null }]]);
        const f = archivo();
        await expect(svc.adjuntarJustificativo(77, f, 9, {}))
            .rejects.toMatchObject({ statusCode: 400 });
        expect(fs.unlinkSync).toHaveBeenCalledWith(f.path);
    });

    test('guarda nombre, ruta RELATIVA a uploads, mime, tamaño y quién; devuelve sin ruta', async () => {
        db.query
            .mockResolvedValueOnce([[{ id: 77, activo: 1, justificativo_ruta: null }]])   // SELECT
            .mockResolvedValueOnce([{ affectedRows: 1 }]);                               // UPDATE

        const r = await svc.adjuntarJustificativo(77, archivo(), 9, {});

        const [sql, params] = db.query.mock.calls[1];
        expect(sql).toMatch(/UPDATE periodos_ausencia/);
        expect(params[0]).toBe('certificado.jpg');
        expect(params[1]).toBe(path.join('justificativos', '77', '123-456.jpg'));   // relativa, no absoluta
        expect(params[2]).toBe('image/jpeg');
        expect(params[3]).toBe(2048);
        expect(params[4]).toBe(9);
        expect(params[5]).toBe(77);

        expect(r).toEqual({
            id: 77,
            justificativo_nombre: 'certificado.jpg',
            justificativo_mime: 'image/jpeg',
            justificativo_tamano: 2048,
            tiene_justificativo: true,
        });
        expect(r).not.toHaveProperty('justificativo_ruta');
        expect(fs.unlinkSync).not.toHaveBeenCalled();   // no había anterior
        expect(logManualActivity).toHaveBeenCalledTimes(1);
    });

    test('al reemplazar borra el archivo anterior del disco', async () => {
        db.query
            .mockResolvedValueOnce([[{ id: 77, activo: 1, justificativo_ruta: path.join('justificativos', '77', 'viejo.pdf') }]])
            .mockResolvedValueOnce([{ affectedRows: 1 }]);

        await svc.adjuntarJustificativo(77, archivo(), 9, {});

        expect(fs.unlinkSync).toHaveBeenCalledWith(path.join(UPLOADS, 'justificativos', '77', 'viejo.pdf'));
    });

    test('el fallo del log no revierte el adjunto', async () => {
        db.query
            .mockResolvedValueOnce([[{ id: 77, activo: 1, justificativo_ruta: null }]])
            .mockResolvedValueOnce([{ affectedRows: 1 }]);
        logManualActivity.mockRejectedValueOnce(new Error('log caído'));

        await expect(svc.adjuntarJustificativo(77, archivo(), 9, {})).resolves.toMatchObject({ tiene_justificativo: true });
    });
});

describe('asistenciaService.getJustificativoPath / quitarJustificativo', () => {
    beforeEach(() => jest.clearAllMocks());

    test('getJustificativoPath: sin adjunto → 404; con adjunto → ruta absoluta + nombre original', async () => {
        db.query.mockResolvedValueOnce([[{ justificativo_nombre: null, justificativo_ruta: null, justificativo_mime: null }]]);
        await expect(svc.getJustificativoPath(77)).rejects.toMatchObject({ statusCode: 404 });

        db.query.mockResolvedValueOnce([[{
            justificativo_nombre: 'licencia.pdf',
            justificativo_ruta: path.join('justificativos', '77', 'a.pdf'),
            justificativo_mime: 'application/pdf',
        }]]);
        const r = await svc.getJustificativoPath(77);
        expect(r).toEqual({
            fullPath: path.join(UPLOADS, 'justificativos', '77', 'a.pdf'),
            fileName: 'licencia.pdf',
            mime: 'application/pdf',
        });
    });

    test('quitarJustificativo: limpia las columnas y borra el archivo; idempotente si no había', async () => {
        db.query
            .mockResolvedValueOnce([[{ justificativo_ruta: path.join('justificativos', '77', 'a.pdf'), justificativo_nombre: 'a.pdf' }]])
            .mockResolvedValueOnce([{ affectedRows: 1 }]);
        const r = await svc.quitarJustificativo(77, 9, {});
        expect(r).toEqual({ id: 77, tiene_justificativo: false });
        expect(db.query.mock.calls[1][0]).toMatch(/justificativo_ruta = NULL/);
        expect(fs.unlinkSync).toHaveBeenCalledWith(path.join(UPLOADS, 'justificativos', '77', 'a.pdf'));

        jest.clearAllMocks();
        db.query.mockResolvedValueOnce([[{ justificativo_ruta: null, justificativo_nombre: null }]]);
        const r2 = await svc.quitarJustificativo(77, 9, {});
        expect(r2).toEqual({ id: 77, tiene_justificativo: false });
        expect(db.query).toHaveBeenCalledTimes(1);   // no hubo UPDATE
        expect(fs.unlinkSync).not.toHaveBeenCalled();
    });
});

describe('asistenciaService.getPeriodos — la ruta no sale', () => {
    beforeEach(() => jest.clearAllMocks());

    test('quita justificativo_ruta y expone tiene_justificativo', async () => {
        db.query.mockResolvedValueOnce([[
            { id: 1, estado_codigo: 'F', justificativo_ruta: 'justificativos/1/x.jpg', justificativo_nombre: 'x.jpg' },
            { id: 2, estado_codigo: 'V', justificativo_ruta: null, justificativo_nombre: null },
        ]]);
        const rows = await svc.getPeriodos({ trabajador_id: 5 });
        expect(rows).toEqual([
            { id: 1, estado_codigo: 'F', justificativo_nombre: 'x.jpg', tiene_justificativo: true },
            { id: 2, estado_codigo: 'V', justificativo_nombre: null, tiene_justificativo: false },
        ]);
    });
});

describe('Rutas /asistencias/periodos/:id/justificativo — gates', () => {
    beforeEach(() => jest.clearAllMocks());

    test('POST sin asistencia.periodo.crear → 403 (antes de multer: no escribe nada)', async () => {
        const r = await request(app)
            .post('/api/asistencias/periodos/77/justificativo')
            .set('Authorization', `Bearer ${makeToken(['asistencia.periodo.ver'])}`)
            .attach('archivo', Buffer.from('fake'), 'c.jpg');
        expect(r.status).toBe(403);
        expect(db.query).not.toHaveBeenCalled();
    });

    test('GET sin asistencia.periodo.ver → 403', async () => {
        const r = await request(app)
            .get('/api/asistencias/periodos/77/justificativo')
            .set('Authorization', `Bearer ${makeToken(['asistencia.periodo.crear'])}`);
        expect(r.status).toBe(403);
    });

    test('DELETE sin asistencia.periodo.crear → 403', async () => {
        const r = await request(app)
            .delete('/api/asistencias/periodos/77/justificativo')
            .set('Authorization', `Bearer ${makeToken(['asistencia.periodo.eliminar'])}`);
        expect(r.status).toBe(403);
    });

    test('GET con permiso y sin adjunto → 404 con mensaje', async () => {
        db.query.mockResolvedValueOnce([[{ justificativo_nombre: null, justificativo_ruta: null, justificativo_mime: null }]]);
        const r = await request(app)
            .get('/api/asistencias/periodos/77/justificativo')
            .set('Authorization', `Bearer ${makeToken(['asistencia.periodo.ver'])}`);
        expect(r.status).toBe(404);
        expect(r.body.error).toMatch(/no tiene justificativo/);
    });
});
