/**
 * «Leer factura» con IA (mig 157, pedido Daphne 2026-11-25). El SDK de Anthropic va
 * simulado: se prueba qué le mandamos (modelo, archivo, catálogo, esquema JSON) y cómo
 * limpiamos lo que vuelve (ids de catálogo inventados → null, fecha inválida → null,
 * rechazos y errores → mensajes legibles). Más los gates de las rutas nuevas.
 */

jest.mock('../src/config/db', () => ({
    query: jest.fn().mockResolvedValue([[]]),
    getConnection: jest.fn(),
}));

const mockCreate = jest.fn();
jest.mock('@anthropic-ai/sdk', () => {
    const Anthropic = jest.fn().mockImplementation(() => ({ beta: { messages: { create: mockCreate } } }));
    return { __esModule: true, default: Anthropic };
});

const db = require('../src/config/db');
const lectura = require('../src/services/lecturaFactura.service');

const CATALOGO = [
    { id: 33, descripcion: 'PLACA FENOLICA 18MM', unidad: 'U' },
    { id: 40, descripcion: 'ALZAPRIMA 3M', unidad: 'U' },
];
const PNG = { buffer: Buffer.from('fake-png'), mimetype: 'image/png' };
const respuesta = (obj, stop_reason = 'end_turn') => ({ stop_reason, content: [{ type: 'text', text: JSON.stringify(obj) }] });

describe('lecturaFactura.leer()', () => {
    const KEY = process.env.ANTHROPIC_API_KEY;
    beforeEach(() => {
        jest.clearAllMocks();
        process.env.ANTHROPIC_API_KEY = 'test-key';
        db.query.mockResolvedValue([CATALOGO]);
    });
    afterAll(() => { if (KEY === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = KEY; });

    test('sin clave → 503 y no llama a la API', async () => {
        delete process.env.ANTHROPIC_API_KEY;
        await expect(lectura.leer(PNG)).rejects.toMatchObject({ statusCode: 503 });
        expect(mockCreate).not.toHaveBeenCalled();
    });

    test('manda imagen + catálogo con esquema JSON y limpia la respuesta', async () => {
        mockCreate.mockResolvedValueOnce(respuesta({
            es_factura: true, proveedor: 'DALI SPA', numero_factura: '278290', fecha_factura: '2026-08-31', monto_neto: 33452600.4,
            items: [
                { descripcion: 'PLACA FENOLICA 18 MM', cantidad: 10, precio_unitario: 25000, item_id: 33 },
                { descripcion: 'COSA RARA', cantidad: 0, precio_unitario: 100.555, item_id: 999 },
            ],
        }));

        const r = await lectura.leer(PNG);

        const req = mockCreate.mock.calls[0][0];
        expect(req.model).toBe('claude-opus-5-5');
        expect(req.output_config.format.type).toBe('json_schema');
        expect(req.fallbacks).toBe('default');
        const [archivo, texto] = req.messages[0].content;
        expect(archivo).toEqual({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: PNG.buffer.toString('base64') } });
        expect(texto.text).toMatch(/33 \| PLACA FENOLICA 18MM \| U/);

        expect(r).toEqual({
            proveedor: 'DALI SPA', numero_factura: '278290', fecha_factura: '2026-08-31', monto_neto: 33452600,
            items: [
                { descripcion: 'PLACA FENOLICA 18 MM', cantidad: 10, precio_unitario: 25000, item_id: 33 },
                // id fuera del catálogo → null; cantidad 0 → 1; precio a 2 decimales
                { descripcion: 'COSA RARA', cantidad: 1, precio_unitario: 100.56, item_id: null },
            ],
        });
    });

    test('PDF va como bloque document', async () => {
        mockCreate.mockResolvedValueOnce(respuesta({ es_factura: true, proveedor: null, numero_factura: null, fecha_factura: '31/08/2026', monto_neto: null, items: [] }));
        const r = await lectura.leer({ buffer: Buffer.from('%PDF'), mimetype: 'application/pdf' });
        expect(mockCreate.mock.calls[0][0].messages[0].content[0].type).toBe('document');
        expect(r.fecha_factura).toBeNull(); // formato no ISO → null, no se inventa
    });

    test('no es factura → 422', async () => {
        mockCreate.mockResolvedValueOnce(respuesta({ es_factura: false, proveedor: null, numero_factura: null, fecha_factura: null, monto_neto: null, items: [] }));
        await expect(lectura.leer(PNG)).rejects.toMatchObject({ statusCode: 422 });
    });

    test('rechazo del modelo → 422 legible', async () => {
        mockCreate.mockResolvedValueOnce({ stop_reason: 'refusal', content: [] });
        await expect(lectura.leer(PNG)).rejects.toMatchObject({ statusCode: 422 });
    });

    test('clave inválida (401 de la API) → 503 «avisa a TI»', async () => {
        mockCreate.mockRejectedValueOnce(Object.assign(new Error('auth'), { status: 401 }));
        await expect(lectura.leer(PNG)).rejects.toMatchObject({ statusCode: 503, message: expect.stringMatching(/TI/) });
    });

    test('sin archivo → 400', async () => {
        await expect(lectura.leer(undefined)).rejects.toMatchObject({ statusCode: 400 });
    });
});

describe('rutas nuevas de facturas', () => {
    const request = require('supertest');
    const jwt = require('jsonwebtoken');
    const app = require('../index');
    const facturaService = require('../src/services/factura-inventario.service');
    const SECRET = process.env.JWT_SECRET || 'secret';
    const token = (permisos) => jwt.sign({ id: 5, email: 'u@lols.cl', rol_id: 2, rv: 1, p: permisos }, SECRET);

    beforeAll(() => { jest.spyOn(facturaService, 'crear').mockResolvedValue({ id: 1, estado: 'borrador' }); });
    afterAll(() => jest.restoreAllMocks());

    test('GET /config dice si la lectura está activa', async () => {
        const res = await request(app).get('/api/facturas-inventario/config')
            .set('Authorization', `Bearer ${token(['inventario.facturas.ver'])}`);
        expect(res.status).toBe(200);
        expect(typeof res.body.data.lectura_ia).toBe('boolean');
    });

    test('POST borrador sin número ni ítems → 201 (validación de borrador)', async () => {
        const res = await request(app).post('/api/facturas-inventario')
            .set('Authorization', `Bearer ${token(['inventario.facturas.gestionar'])}`)
            .send({ estado: 'borrador', proveedor: 'DALI' });
        expect(res.status).toBe(201);
    });

    test('POST registrada sin número → 400 (validación completa)', async () => {
        const res = await request(app).post('/api/facturas-inventario')
            .set('Authorization', `Bearer ${token(['inventario.facturas.gestionar'])}`)
            .send({ proveedor: 'DALI', fecha_factura: '2026-08-31', monto_neto: 1, items: [{ item_id: 1, cantidad: 1, precio_unitario: 1 }] });
        expect(res.status).toBe(400);
    });

    test('POST /leer sin gestionar → 403', async () => {
        const res = await request(app).post('/api/facturas-inventario/leer')
            .set('Authorization', `Bearer ${token(['inventario.facturas.ver'])}`);
        expect(res.status).toBe(403);
    });
});
