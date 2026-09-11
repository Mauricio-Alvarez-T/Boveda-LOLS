/**
 * /api/documentos — saneamiento B1 (plan Gestiones, 2026-09-11).
 *
 * Fija lo que estaba roto en producción y que ningún test cubría:
 *  - POST /upload/:trabajadorId pasaba los argumentos CRUZADOS al service
 *    (route: (tid, tipo, file, user) vs service: (tid, file, tipo, user)) y leía
 *    `tipo_id` cuando el front manda `tipo_documento_id` → TypeError 500.
 *  - GET /kpi/vencidos, /kpi/faltantes y POST /kpi/completitud llamaban métodos
 *    inexistentes (getKPIVencidos, getKPIFaltantes, getKPICompletitud).
 *  - 403 por gate SIN tocar la BD; 400 sin archivo / sin tipo.
 */

jest.mock('../src/config/db', () => ({
    query: jest.fn().mockResolvedValue([[]]),
    getConnection: jest.fn(),
}));
jest.mock('../src/middleware/logger', () => ({
    logManualActivity: jest.fn().mockResolvedValue(undefined),
    activityLogger: (req, res, next) => next(),
    resolveEntidad: jest.fn(),
}));
// multer real escribe en disco: se reemplaza por un middleware que inyecta req.file
// salvo que el test pida "sin archivo" (header x-sin-archivo). El body JSON lo parsea
// express.json, igual que haría multer con multipart.
jest.mock('../src/middleware/upload', () => ({
    single: () => (req, res, next) => {
        if (!req.headers['x-sin-archivo']) {
            req.file = { path: '/tmp/uploads/5/tmp-abc.pdf', mimetype: 'application/pdf', originalname: 'cert.pdf', size: 1234 };
        }
        next();
    },
}));
jest.mock('../src/services/pdf.service', () => ({
    processFile: jest.fn().mockResolvedValue({
        finalPath: require('path').join(__dirname, '../uploads/5/12345678-9-77085560-8-2026-09-11.pdf'),
        fileName: '12345678-9-77085560-8-2026-09-11.pdf',
    }),
}));

const request = require('supertest');
const app = require('../index');
const db = require('../src/config/db');
const pdfService = require('../src/services/pdf.service');
const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'secret';
const makeToken = (permisos) => jwt.sign({ id: 1, email: 'rrhh@lols.cl', rol_id: 2, rv: 1, p: permisos }, SECRET);
const tokenSubir = makeToken(['documentos.subir']);
const tokenVer = makeToken(['documentos.ver']);
const tokenSinNada = makeToken(['asistencia.ver']);

const sqlCalls = () => db.query.mock.calls.map(c => String(c[0]));

beforeEach(() => {
    db.query.mockReset().mockResolvedValue([[]]);
    pdfService.processFile.mockClear();
});

describe('POST /api/documentos/upload/:trabajadorId', () => {
    test('201: el service recibe (trabajadorId, file, tipoDocumentoId, userId) en ese orden y el INSERT lleva el tipo correcto', async () => {
        db.query
            .mockResolvedValueOnce([[{ rut_trabajador: '12.345.678-9', rut_empresa: '77.085.560-8' }]]) // ruts
            .mockResolvedValueOnce([[{ dias_vigencia: null }]])                                          // tipo
            .mockResolvedValueOnce([{ insertId: 42 }]);                                                   // INSERT

        const res = await request(app)
            .post('/api/documentos/upload/5')
            .set('Authorization', `Bearer ${tokenSubir}`)
            .send({ tipo_documento_id: '3' });

        expect(res.status).toBe(201);
        expect(res.body.id).toBe(42);
        expect(res.body.nombre_archivo).toBe('12345678-9-77085560-8-2026-09-11.pdf');

        // processFile recibió el archivo real (antes recibía undefined.path → TypeError)
        expect(pdfService.processFile).toHaveBeenCalledWith('/tmp/uploads/5/tmp-abc.pdf', 'application/pdf', '12.345.678-9', '77.085.560-8');

        const insert = db.query.mock.calls.find(c => /INSERT INTO documentos/i.test(c[0]));
        expect(insert).toBeDefined();
        const params = insert[1];
        expect(Number(params[0])).toBe(5);       // trabajador_id
        expect(params[1]).toBe(3);               // tipo_documento_id (numérico, desde tipo_documento_id)
        expect(params[2]).toBe('12345678-9-77085560-8-2026-09-11.pdf');
        expect(params[6]).toBe(1);               // subido_por = req.user.id
    });

    test('acepta el alias legado tipo_id', async () => {
        db.query
            .mockResolvedValueOnce([[{ rut_trabajador: '1-9', rut_empresa: null }]])
            .mockResolvedValueOnce([[{ dias_vigencia: 30 }]])
            .mockResolvedValueOnce([{ insertId: 7 }]);
        const res = await request(app)
            .post('/api/documentos/upload/5')
            .set('Authorization', `Bearer ${tokenSubir}`)
            .send({ tipo_id: 9 });
        expect(res.status).toBe(201);
        const insert = db.query.mock.calls.find(c => /INSERT INTO documentos/i.test(c[0]));
        expect(insert[1][1]).toBe(9);
        expect(insert[1][4]).toBe('SIN-EMPRESA');
        expect(insert[1][5]).toMatch(/^\d{4}-\d{2}-\d{2}$/); // fecha_vencimiento calculada desde dias_vigencia
    });

    test('400 sin tipo de documento: no procesa ni inserta', async () => {
        const res = await request(app)
            .post('/api/documentos/upload/5')
            .set('Authorization', `Bearer ${tokenSubir}`)
            .send({});
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/tipo de documento/i);
        expect(pdfService.processFile).not.toHaveBeenCalled();
        expect(sqlCalls().some(s => /INSERT INTO documentos/i.test(s))).toBe(false);
    });

    test('400 sin archivo', async () => {
        const res = await request(app)
            .post('/api/documentos/upload/5')
            .set('Authorization', `Bearer ${tokenSubir}`)
            .set('x-sin-archivo', '1')
            .send({ tipo_documento_id: 3 });
        expect(res.status).toBe(400);
        expect(db.query).not.toHaveBeenCalled();
    });

    test('403 sin documentos.subir y sin tocar la BD', async () => {
        const res = await request(app)
            .post('/api/documentos/upload/5')
            .set('Authorization', `Bearer ${tokenSinNada}`)
            .send({ tipo_documento_id: 3 });
        expect(res.status).toBe(403);
        expect(db.query).not.toHaveBeenCalled();
    });
});

describe('KPIs de documentos', () => {
    test('GET /kpi/vencidos?dias=7 → 200 y consulta por fecha_vencimiento con el umbral', async () => {
        db.query.mockResolvedValueOnce([[{ id: 1, tipo_nombre: 'Contrato' }]]);
        const res = await request(app).get('/api/documentos/kpi/vencidos?dias=7').set('Authorization', `Bearer ${tokenVer}`);
        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(1);
        expect(sqlCalls()[0]).toMatch(/fecha_vencimiento/);
        expect(db.query.mock.calls[0][1]).toEqual([7]);
    });

    test('GET /kpi/vencidos sin dias → 30 por defecto', async () => {
        await request(app).get('/api/documentos/kpi/vencidos').set('Authorization', `Bearer ${tokenVer}`);
        expect(db.query.mock.calls[0][1]).toEqual([30]);
    });

    test('GET /kpi/faltantes → 200 y consulta tipos obligatorios', async () => {
        const res = await request(app).get('/api/documentos/kpi/faltantes').set('Authorization', `Bearer ${tokenVer}`);
        expect(res.status).toBe(200);
        expect(sqlCalls()[0]).toMatch(/obligatorio/);
    });

    test('POST /kpi/completitud {trabajador_ids} → % por trabajador', async () => {
        db.query
            .mockResolvedValueOnce([[{ total: 2 }]])
            .mockResolvedValueOnce([[{ trabajador_id: 1, uploaded: 1 }]]);
        const res = await request(app)
            .post('/api/documentos/kpi/completitud')
            .set('Authorization', `Bearer ${tokenVer}`)
            .send({ trabajador_ids: [1, 2] });
        expect(res.status).toBe(200);
        expect(res.body['1'].percentage).toBe(50);
        expect(res.body['2'].percentage).toBe(0);
    });

    test('POST /kpi/completitud sin arreglo → 400', async () => {
        const res = await request(app)
            .post('/api/documentos/kpi/completitud')
            .set('Authorization', `Bearer ${tokenVer}`)
            .send({ ids: 'x' });
        expect(res.status).toBe(400);
    });

    test('403 sin documentos.ver', async () => {
        const res = await request(app).get('/api/documentos/kpi/vencidos').set('Authorization', `Bearer ${tokenSinNada}`);
        expect(res.status).toBe(403);
        expect(db.query).not.toHaveBeenCalled();
    });
});
