/**
 * /api/documentos-alertas — alertas de documentos sin firmar (plan Gestiones B7, mig 115).
 *
 *  - Gates: pendientes = documentos.entrega.registrar; config = sistema.alertas_documentos.gestionar (403 sin BD).
 *  - pendientes: SQL cuenta desde fecha_generacion (NUNCA fecha_descarga), excluye es_prueba, estados
 *    generado/descargado/en_terreno; agrega por tipo y etapa; crítico por umbral; lotes con sus categorías.
 *  - Degradación 1146/1054 → estructura vacía, 200.
 *  - config: PUT con regla cruzada dias_critico >= dias_aviso (400 UMBRALES_INVERTIDOS), saneo de tipos.
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

const request = require('supertest');
const app = require('../index');
const db = require('../src/config/db');
const service = require('../src/services/documentosAlertas.service');
const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'secret';
const makeToken = (permisos) => jwt.sign({ id: 3, email: 'rrhh@lols.cl', rol_id: 2, rv: 1, p: permisos }, SECRET);
const tokenRRHH = makeToken(['documentos.entrega.registrar']);
const tokenConfig = makeToken(['sistema.alertas_documentos.gestionar']);
const tokenTerreno = makeToken(['asistencia.ver']);
const BASE = '/api/documentos-alertas';
const err1146 = () => Object.assign(new Error("Table 'documentos_alertas_config' doesn't exist"), { errno: 1146, code: 'ER_NO_SUCH_TABLE' });

beforeEach(() => { db.query.mockReset().mockResolvedValue([[]]); });

const DOC = (extra = {}) => ({
    id: 11, estado: 'descargado', fecha_generacion: '2026-09-01 10:00:00', lote_id: null, tipo_codigo: 'CONTRATO', tipo_nombre: 'Contrato de Trabajo (Bóveda)',
    trabajador_id: 5, nombres: 'Juan', apellido_paterno: 'Pérez', apellido_materno: 'Soto', rut: '12.345.678-5', obra_nombre: 'Edificio Central',
    dias_aviso: 3, dias_critico: 10, dias: '5', lote_estado: null, portador_nombre: null, ...extra,
});
const CFG_LOTES = [
    { categoria: 'LOTE_SIN_CONFIRMAR', activo: 1, dias_aviso: 1, dias_critico: 3 },
    { categoria: 'LOTE_EN_TERRENO', activo: 1, dias_aviso: 7, dias_critico: 14 },
];

describe('gates', () => {
    test.each([
        ['GET', `${BASE}/pendientes`, tokenTerreno],
        ['GET', `${BASE}/pendientes`, tokenConfig],
        ['GET', `${BASE}/config`, tokenRRHH],
        ['PUT', `${BASE}/config/1`, tokenRRHH],
    ])('%s %s → 403 sin tocar la BD', async (method, url, token) => {
        const res = await request(app)[method.toLowerCase()](url).set('Authorization', `Bearer ${token}`).send({ dias_aviso: 1 });
        expect(res.status).toBe(403);
        expect(db.query).not.toHaveBeenCalled();
    });
});

describe('GET /pendientes', () => {
    test('SQL: cuenta desde fecha_generacion (no fecha_descarga), excluye es_prueba, solo generados sin firmar y umbral del tipo', async () => {
        const res = await request(app).get(`${BASE}/pendientes`).set('Authorization', `Bearer ${tokenRRHH}`);
        expect(res.status).toBe(200);
        const sqlDocs = String(db.query.mock.calls[0][0]);
        expect(sqlDocs).toMatch(/DATEDIFF\(CURDATE\(\), d\.fecha_generacion\)/);
        expect(sqlDocs).not.toMatch(/fecha_descarga/);
        expect(sqlDocs).toMatch(/t\.es_prueba = 0/);
        expect(sqlDocs).toMatch(/d\.origen = 'generado'/);
        expect(sqlDocs).toMatch(/d\.estado IN \('generado', 'descargado', 'en_terreno'\)/);
        expect(sqlDocs).toMatch(/c\.categoria = td\.codigo AND c\.activo = 1/);
        expect(sqlDocs).toMatch(/>= c\.dias_aviso/);
        const sqlLotes = String(db.query.mock.calls[1][0]);
        expect(sqlLotes).toMatch(/l\.estado IN \('pendiente_retiro', 'en_terreno'\)/);
        expect(sqlLotes).toMatch(/CASE WHEN l\.estado = 'pendiente_retiro' THEN l\.creado_en ELSE l\.retirado_en END/);
        expect(res.body.data).toEqual(expect.objectContaining({ total: 0, criticos: 0, por_tipo: [], items: [] }));
    });

    test('agrega por tipo y etapa; crítico por umbral; etapa según estado y lote; lotes con sus categorías', async () => {
        db.query
            .mockResolvedValueOnce([[
                DOC({ id: 11, dias: '12' }),                                                             // contrato crítico, por retirar
                DOC({ id: 12, estado: 'generado', dias: '4' }),                                          // contrato sin imprimir
                DOC({ id: 13, estado: 'descargado', lote_id: 41, lote_estado: 'pendiente_retiro', dias: '5' }),   // por confirmar
                DOC({ id: 14, estado: 'en_terreno', lote_id: 42, lote_estado: 'en_terreno', portador_nombre: 'Jhoan', tipo_codigo: 'FINIQUITO', tipo_nombre: 'Finiquito (Bóveda)', dias_critico: 7, dias: '8' }), // finiquito crítico en terreno
            ]])
            .mockResolvedValueOnce([[
                { id: 41, estado: 'pendiente_retiro', portador_id: 7, portador_nombre: 'Jhoan', creado_en: 'x', retirado_en: null, dias: '2', documentos: '3' },
                { id: 42, estado: 'en_terreno', portador_id: 7, portador_nombre: 'Jhoan', creado_en: 'x', retirado_en: 'y', dias: '20', documentos: '5' },
                { id: 43, estado: 'en_terreno', portador_id: 8, portador_nombre: 'Héctor', creado_en: 'x', retirado_en: 'y', dias: '2', documentos: '1' },   // bajo el aviso: no alerta
            ]])
            .mockResolvedValueOnce([CFG_LOTES]);
        const res = await request(app).get(`${BASE}/pendientes`).set('Authorization', `Bearer ${tokenRRHH}`);
        expect(res.status).toBe(200);
        const d = res.body.data;
        expect(d.total).toBe(4);
        expect(d.criticos).toBe(2);
        expect(d.por_tipo).toEqual([
            { tipo_codigo: 'CONTRATO', tipo_nombre: 'Contrato de Trabajo (Bóveda)', total: 3, criticos: 1 },
            { tipo_codigo: 'FINIQUITO', tipo_nombre: 'Finiquito (Bóveda)', total: 1, criticos: 1 },
        ]);
        expect(d.por_etapa).toEqual({
            sin_imprimir: { total: 1, criticos: 0 }, por_retirar: { total: 1, criticos: 1 },
            por_confirmar: { total: 1, criticos: 0 }, en_terreno: { total: 1, criticos: 1 },
        });
        expect(d.items[0]).toMatchObject({ documento_id: 11, etapa: 'por_retirar', dias: 12, critical: true, trabajador: { id: 5, nombre: 'Pérez Soto Juan', rut: '12.345.678-5' }, obra_nombre: 'Edificio Central' });
        expect(d.items.find(i => i.documento_id === 14)).toMatchObject({ etapa: 'en_terreno', portador_nombre: 'Jhoan', critical: true });
        expect(d.lotes.sin_confirmar).toEqual({ total: 1, criticos: 0, items: [{ lote_id: 41, portador_id: 7, portador_nombre: 'Jhoan', documentos: 3, dias: 2, critical: false }] });
        expect(d.lotes.en_terreno).toEqual({ total: 1, criticos: 1, items: [{ lote_id: 42, portador_id: 7, portador_nombre: 'Jhoan', documentos: 5, dias: 20, critical: true }] });
    });

    test('categoría de lote desactivada no alerta; degradación 1146 → estructura vacía con 200', async () => {
        db.query
            .mockResolvedValueOnce([[]])
            .mockResolvedValueOnce([[{ id: 41, estado: 'pendiente_retiro', portador_id: 7, portador_nombre: 'Jhoan', creado_en: 'x', retirado_en: null, dias: '9', documentos: '3' }]])
            .mockResolvedValueOnce([[{ categoria: 'LOTE_SIN_CONFIRMAR', activo: 0, dias_aviso: 1, dias_critico: 3 }]]);
        let res = await request(app).get(`${BASE}/pendientes`).set('Authorization', `Bearer ${tokenRRHH}`);
        expect(res.body.data.lotes.sin_confirmar.total).toBe(0);

        db.query.mockReset().mockRejectedValue(err1146());
        res = await request(app).get(`${BASE}/pendientes`).set('Authorization', `Bearer ${tokenRRHH}`);
        expect(res.status).toBe(200);
        expect(res.body.data).toEqual(expect.objectContaining({ total: 0, criticos: 0, por_tipo: [], items: [] }));
        expect(res.body.data.lotes.en_terreno).toEqual({ total: 0, criticos: 0, items: [] });
    });

    test('etapaDe: generado → sin_imprimir; descargado sin lote → por_retirar; con lote pendiente → por_confirmar; en_terreno', () => {
        const e = service._interno.etapaDe;
        expect(e({ estado: 'generado' })).toBe('sin_imprimir');
        expect(e({ estado: 'descargado', lote_id: null })).toBe('por_retirar');
        expect(e({ estado: 'descargado', lote_id: 41, lote_estado: 'pendiente_retiro' })).toBe('por_confirmar');
        expect(e({ estado: 'descargado', lote_id: 41, lote_estado: 'cerrado' })).toBe('por_retirar');
        expect(e({ estado: 'en_terreno', lote_id: 42 })).toBe('en_terreno');
    });
});

describe('config (CRUD acotado)', () => {
    test('GET /config lista ordenada por `orden`; PUT ajusta días con la regla cruzada', async () => {
        db.query.mockResolvedValueOnce([[{ id: 1, categoria: 'CONTRATO', etiqueta: 'Contrato de trabajo sin firmar', activo: 1, dias_aviso: 3, dias_critico: 10, orden: 10 }]]).mockResolvedValueOnce([[{ total: 1 }]]);
        let res = await request(app).get(`${BASE}/config?activo=all`).set('Authorization', `Bearer ${tokenConfig}`);
        expect(res.status).toBe(200);
        expect(String(db.query.mock.calls[0][0])).toMatch(/ORDER BY orden ASC, id ASC/);

        // PUT válido: lee la fila para la regla cruzada y luego UPDATE solo con los campos permitidos.
        db.query.mockReset().mockResolvedValue([[]]);
        db.query.mockResolvedValueOnce([[{ dias_aviso: 3, dias_critico: 10 }]]).mockResolvedValueOnce([{ affectedRows: 1 }]);
        res = await request(app).put(`${BASE}/config/1`).set('Authorization', `Bearer ${tokenConfig}`).send({ dias_aviso: '5', dias_critico: 12, categoria: 'HACK', orden: 1, activo: true });
        expect(res.status).toBe(200);
        const [updSql, updVals] = db.query.mock.calls[1];
        expect(updSql).toMatch(/UPDATE documentos_alertas_config SET/);
        expect(updSql).not.toMatch(/categoria|orden/);
        // Orden = allowedFields (activo, dias_aviso, dias_critico); números saneados, activo → 1, id al final.
        expect(updVals).toEqual([1, 5, 12, '1']);

        // PUT inválido: crítico < aviso (el aviso queda en el de la fila) → 400, sin UPDATE.
        db.query.mockReset().mockResolvedValue([[]]);
        db.query.mockResolvedValueOnce([[{ dias_aviso: 8, dias_critico: 10 }]]);
        res = await request(app).put(`${BASE}/config/1`).set('Authorization', `Bearer ${tokenConfig}`).send({ dias_critico: 5 });
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('UMBRALES_INVERTIDOS');
        expect(db.query.mock.calls.some(c => /UPDATE/.test(String(c[0])))).toBe(false);

        // Valores no enteros / negativos → 400 antes de tocar la fila.
        res = await request(app).put(`${BASE}/config/1`).set('Authorization', `Bearer ${tokenConfig}`).send({ dias_aviso: -1 });
        expect(res.status).toBe(400);
        res = await request(app).put(`${BASE}/config/1`).set('Authorization', `Bearer ${tokenConfig}`).send({ dias_aviso: 'x' });
        expect(res.status).toBe(400);
    });
});

describe('GET /mios — cartel de atrasos del portador (supervisor), 2026-10-19', () => {
    const tokenPortador = jwt.sign({ id: 7, email: 'jhoan@lols.cl', rol_id: 4, rv: 1, p: ['documentos.entrega.portar'] }, SECRET);
    const LOTES_CFG = [{ categoria: 'LOTE_SIN_CONFIRMAR', activo: 1, dias_aviso: 1, dias_critico: 3 }, { categoria: 'LOTE_EN_TERRENO', activo: 1, dias_aviso: 7, dias_critico: 14 }];

    test('sin documentos.entrega.portar → 403 (RRHH usa /pendientes)', async () => {
        const res = await request(app).get(`${BASE}/mios`).set('Authorization', `Bearer ${tokenRRHH}`);
        expect(res.status).toBe(403);
        expect(db.query).not.toHaveBeenCalled();
    });

    test('solo SUS lotes: el id del usuario va en las dos consultas', async () => {
        db.query.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[]]).mockResolvedValueOnce([LOTES_CFG]);
        const res = await request(app).get(`${BASE}/mios`).set('Authorization', `Bearer ${tokenPortador}`);
        expect(res.status).toBe(200);
        const [sqlDocs, pDocs] = db.query.mock.calls[0];
        const [sqlLotes, pLotes] = db.query.mock.calls[1];
        expect(sqlDocs).toMatch(/l\.portador_id = \?/);
        expect(sqlDocs).toMatch(/DATEDIFF\(CURDATE\(\), d\.fecha_generacion\)/);   // misma cuenta que la Bandeja
        expect(sqlDocs).toMatch(/es_prueba = 0/);
        expect(sqlLotes).toMatch(/l\.portador_id = \?/);
        expect(pDocs).toEqual([7]);
        expect(pLotes).toEqual([7]);
    });

    test('documentos atrasados con crítico; lotes sin retirar o en terreno pasados del aviso; total por devolver', async () => {
        db.query
            .mockResolvedValueOnce([[DOC({ dias: '15', lote_id: 8, lote_estado: 'en_terreno' }), DOC({ id: 12, dias: '4', tipo_codigo: 'ODI_D40', tipo_nombre: 'ODI', lote_id: 8, lote_estado: 'en_terreno' })]])
            .mockResolvedValueOnce([[
                { id: 8, estado: 'en_terreno', dias: '3', documentos: '16' },        // 3 días en terreno: bajo el aviso (7)
                { id: 9, estado: 'pendiente_retiro', dias: '4', documentos: '2' },   // 4 días sin retirar: crítico (3)
            ]])
            .mockResolvedValueOnce([LOTES_CFG]);
        const r = await service.misAtrasos(7);
        expect(r.documentos).toMatchObject({ total: 2, criticos: 1 });
        expect(r.documentos.items[0]).toMatchObject({ documento_id: 11, dias: 15, critical: true, trabajador: { nombre: 'Pérez Soto Juan' }, en_oficina: false });
        expect(r.documentos.items[1]).toMatchObject({ documento_id: 12, critical: false });
        expect(r.lotes.en_terreno).toEqual([]);
        expect(r.lotes.sin_retirar).toEqual([{ lote_id: 9, documentos: 2, dias: 4, critical: true }]);
        expect(r.por_devolver).toBe(18);
    });

    test('sin las migraciones (1146) → vacío, nunca 500', async () => {
        db.query.mockRejectedValue(err1146());
        await expect(service.misAtrasos(7)).resolves.toEqual({ documentos: { total: 0, criticos: 0, items: [] }, lotes: { sin_retirar: [], en_terreno: [] }, por_devolver: 0 });
    });
});

describe('B7 alineado con la tenencia de 4 días hábiles (jefatura 2026-10-21)', () => {
    const { evaluar } = service._interno;
    const ctx = { hoy: '2026-10-23', feriados: new Set() }; // viernes 23
    afterEach(() => jest.useRealTimers());

    test('en terreno: avisa el día 4 (último), crítico desde el 5; antes no alerta; ignora los umbrales por tipo', () => {
        const umbral = { dias_aviso: 1, dias_critico: 2 };
        expect(evaluar({ estado: 'en_terreno', retirado_dia: '2026-10-21', dias: 30 }, umbral, ctx)).toBeNull(); // día 3
        expect(evaluar({ estado: 'en_terreno', retirado_dia: '2026-10-20', dias: 30 }, umbral, ctx)).toEqual({ dias: 4, critical: false, dias_aviso: 4, dias_critico: 5 });
        expect(evaluar({ estado: 'en_terreno', retirado_dia: '2026-10-19', dias: 0 }, umbral, ctx)).toEqual({ dias: 5, critical: true, dias_aviso: 4, dias_critico: 5 });
    });

    test('fuera de terreno: días corridos contra sus umbrales, como antes', () => {
        const umbral = { dias_aviso: 3, dias_critico: 7 };
        expect(evaluar({ estado: 'descargado', dias: 2 }, umbral, ctx)).toBeNull();
        expect(evaluar({ estado: 'descargado', dias: 3 }, umbral, ctx)).toMatchObject({ dias: 3, critical: false });
        expect(evaluar({ estado: 'pendiente_retiro', dias: 7 }, umbral, ctx)).toMatchObject({ critical: true });
    });

    test('pendientes(): el documento y el lote en terreno usan la tenencia; el SQL ya no filtra en terreno por días', async () => {
        jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'setTimeout', 'setInterval'] });
        jest.setSystemTime(new Date('2026-10-23T15:00:00Z'));
        expect(service._interno.SELECT_DOCS).toMatch(/d\.estado = 'en_terreno' OR DATEDIFF/);
        db.query.mockReset()
            .mockResolvedValueOnce([[{ id: 1, estado: 'en_terreno', lote_id: 5, lote_estado: 'en_terreno', retirado_dia: '2026-10-19', dias: 1, dias_aviso: 10, dias_critico: 20, tipo_codigo: 'DAS', tipo_nombre: 'DAS', nombres: 'Ana', apellido_paterno: 'Pérez' },
                { id: 2, estado: 'en_terreno', lote_id: 6, lote_estado: 'en_terreno', retirado_dia: '2026-10-22', dias: 40, dias_aviso: 10, dias_critico: 20, tipo_codigo: 'DAS', tipo_nombre: 'DAS', nombres: 'Luis', apellido_paterno: 'Soto' }]])
            .mockResolvedValueOnce([[{ id: 5, estado: 'en_terreno', retirado_dia: '2026-10-19', dias: 4, documentos: 1 }]])
            .mockResolvedValueOnce([[{ categoria: 'LOTE_EN_TERRENO', activo: 1, dias_aviso: 30, dias_critico: 60 }]])
            .mockResolvedValue([[]]);
        const out = await service.pendientes();
        expect(out.items.map(i => [i.documento_id, i.dias, i.critical])).toEqual([[1, 5, true]]);
        expect(out.por_etapa.en_terreno).toEqual({ total: 1, criticos: 1 });
        expect(out.lotes.en_terreno).toMatchObject({ total: 1, criticos: 1, items: [{ lote_id: 5, dias: 5, critical: true }] });
    });
});
