/**
 * Teléfono del conductor (mig 132, pedido del dueño 2026-10-22: «que el WhatsApp le llegue a la
 * persona que está a cargo de ese vehículo»).
 *
 * Fija:
 *   · la normalización/validación del celular chileno (utils/telefono.js);
 *   · el CRUD /api/conductores acepta `telefono` normalizado, 400 si es inválido, y lo descarta
 *     si la columna aún no existe;
 *   · el formulario del vehículo (POST/PUT /api/vehiculos) guarda `conductor_telefono` en el
 *     conductor resuelto, solo si viene; inválido o sin conductor → 400 sin escribir nada;
 *   · getById/getAll devuelven `conductor_telefono` (y degradan sin la columna);
 *   · ninguna respuesta lleva teléfonos a quien no tiene vehiculos.ver.
 *
 * Mocks de BD, sin conexión real (patrón de vehiculos_papeles.test.js).
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
const { resetSchemaCache } = require('../src/utils/schema');
const { normalizarCelular, celularOError } = require('../src/utils/telefono');
const { ocultarCamposSinPermiso } = require('../src/middleware/ocultarCampos');

const SECRET = process.env.JWT_SECRET || 'secret';
const token = (permisos) => jwt.sign({ id: 9, email: 'op@lols.cl', rol_id: 1, rv: 1, p: permisos }, SECRET);
const bearer = (permisos) => ({ Authorization: `Bearer ${token(permisos)}` });

const errBadField = () => Object.assign(new Error('Unknown column'), { code: 'ER_BAD_FIELD_ERROR', errno: 1054 });

const COLS_VEHICULOS = ['id', 'patente', 'marca', 'modelo', 'anio', 'tipo', 'kilometraje_actual', 'color', 'observaciones',
    'activo', 'empresa_id', 'conductor_id', 'valor', 'precio_compra', 'es_leasing'];

const vehiculoRow = (over = {}) => ({
    id: 7, patente: 'KRPD-17', marca: 'HYUNDAI', modelo: 'HD78', anio: 2020, tipo: 'camion', activo: 1,
    conductor_id: 4, conductor_nombre: 'Juan Pérez', conductor_telefono: '+56987654321', ...over,
});
const conductorRow = (over = {}) => ({ id: 4, nombre: 'Juan Pérez', telefono: '+56987654321', activo: 1, ...over });

/**
 * BD simulada por SQL. `telefonoCol` = la mig 132 corrió; `conductorExiste` = id que encuentra
 * resolveConductorId por nombre (null → lo crea con id 50); `conductorActual` = el del vehículo.
 */
const mockBd = ({ telefonoCol = true, conductorExiste = 4, conductorActual = 4 } = {}) => {
    db.query.mockImplementation(async (sql, params) => {
        const s = String(sql).trim();
        if (/INFORMATION_SCHEMA\.COLUMNS/.test(s)) {
            const tabla = params && params[0];
            const cols = tabla === 'vehiculos' ? COLS_VEHICULOS
                : tabla === 'conductores' ? ['id', 'nombre', 'activo', ...(telefonoCol ? ['telefono'] : [])] : [];
            return [cols.map(c => ({ COLUMN_NAME: c }))];
        }
        // Sin la mig 132 cualquier SQL que nombre la columna revienta como en MariaDB.
        if (!telefonoCol && /telefono/.test(s)) throw errBadField();
        if (/^SELECT id FROM conductores WHERE LOWER\(nombre\)/.test(s)) return [conductorExiste ? [{ id: conductorExiste }] : []];
        if (/^INSERT INTO conductores/.test(s)) return [{ insertId: 50, affectedRows: 1 }];
        if (/^SELECT conductor_id FROM vehiculos/.test(s)) return [[{ conductor_id: conductorActual }]];
        if (/^INSERT INTO vehiculos/.test(s)) return [{ insertId: 7, affectedRows: 1 }];
        if (/FROM vehiculos v/.test(s) && /WHERE v\.id = \?/.test(s)) {
            return [[telefonoCol ? vehiculoRow() : (({ conductor_telefono, ...r }) => r)(vehiculoRow())]];
        }
        if (/FROM vehiculos v/.test(s)) return [[telefonoCol ? vehiculoRow() : (({ conductor_telefono, ...r }) => r)(vehiculoRow())]];
        if (/vehiculo_leasing_cuotas/.test(s)) return [[]];
        if (/^SELECT conductores\.\* FROM conductores/.test(s)) return [[conductorRow()]];
        if (/COUNT\(\*\) as total FROM conductores/.test(s)) return [[{ total: 1 }]];
        return [{ affectedRows: 1, insertId: 1 }];
    });
};

const sqls = () => db.query.mock.calls.map(c => String(c[0]).trim());
const llamada = (re) => db.query.mock.calls.find(c => re.test(String(c[0]).trim()));
const escrituras = () => sqls().filter(s => /^(INSERT|UPDATE|DELETE)/.test(s));

beforeEach(() => {
    jest.clearAllMocks();
    db.query.mockReset().mockResolvedValue([[]]);
    resetSchemaCache();
});

// ══════════════════════════════════════════════
// Normalización
// ══════════════════════════════════════════════
describe('normalizarCelular — celular chileno', () => {
    test.each([
        ['912345678', '+56912345678'],
        ['9 1234 5678', '+56912345678'],
        ['9-1234-5678', '+56912345678'],
        ['+56 9 1234 5678', '+56912345678'],
        ['+56912345678', '+56912345678'],
        ['56912345678', '+56912345678'],
        ['0056 9 1234 5678', '+56912345678'],
        ['(+56) 9 1234.5678', '+56912345678'],
        ['  +56-9-8765-4321  ', '+56987654321'],
        [912345678, '+56912345678'],
    ])('%p → %p', (entrada, salida) => {
        expect(normalizarCelular(entrada)).toEqual({ ok: true, valor: salida });
    });

    test.each([null, undefined, '', '   '])('vacío (%p) → null, sin teléfono', (entrada) => {
        expect(normalizarCelular(entrada)).toEqual({ ok: true, valor: null });
    });

    test.each([
        '12345678',          // 8 dígitos (sin el 9)
        '812345678',         // no empieza con 9
        '9123456789',        // 10 dígitos
        '+56 2 2345 6789',   // fijo de Santiago
        '+54 9 1234 5678',   // otro país
        '+912345678',        // «+» sin el 56
        '9 1234 567a',       // letras
        '56 9 1234 567',     // 56 + 8 dígitos
        '+56',
    ])('inválido: %p', (entrada) => {
        expect(normalizarCelular(entrada)).toEqual({ ok: false });
    });

    // Copiado desde Contactos o WhatsApp: el teléfono pega marcas invisibles alrededor del número.
    const c = (n) => String.fromCharCode(n);
    test.each([
        [c(0x202D) + '+56 9 1234 5678' + c(0x202C), '+56912345678'],
        [c(0x202A) + '+56 9 1234 5678' + c(0x202C), '+56912345678'],
        [c(0x200E) + '+56912345678', '+56912345678'],
        ['9 1234' + c(0x2013) + '5678', '+56912345678'],
        ['+56 9 1234' + c(0x2011) + '5678', '+56912345678'],
    ])('pegado con caracteres invisibles o guion tipográfico (%#) → %p', (entrada, salida) => {
        expect(normalizarCelular(entrada)).toEqual({ ok: true, valor: salida });
    });

    test('solo marcas invisibles cuenta como vacío; letras siguen siendo inválidas', () => {
        expect(normalizarCelular(c(0x202D) + c(0x202C))).toEqual({ ok: true, valor: null });
        expect(normalizarCelular('9' + c(0x202D) + '1234abcd')).toEqual({ ok: false });
    });

    test('celularOError: inválido → 400 TELEFONO_INVALIDO con mensaje en español', () => {
        expect(celularOError('9 1234 5678')).toBe('+56912345678');
        expect(celularOError('')).toBeNull();
        try {
            celularOError('1234', 'El teléfono del conductor');
            throw new Error('no lanzó');
        } catch (e) {
            expect(e.statusCode).toBe(400);
            expect(e.code).toBe('TELEFONO_INVALIDO');
            expect(e.message).toBe('El teléfono del conductor debe ser un celular chileno de 9 dígitos que empiece con 9 (ej.: 9 1234 5678).');
        }
    });
});

// ══════════════════════════════════════════════
// CRUD /api/conductores
// ══════════════════════════════════════════════
describe('CRUD /api/conductores — teléfono', () => {
    const CONDUCTORES = ['conductores.ver', 'conductores.crear', 'conductores.editar', 'vehiculos.ver'];

    test('POST acepta el teléfono y lo guarda normalizado', async () => {
        mockBd();
        const res = await request(app).post('/api/conductores').set(bearer(CONDUCTORES))
            .send({ nombre: 'Juan Pérez', telefono: '9 8765 4321' });
        expect(res.status).toBe(201);
        const [sql, params] = llamada(/^INSERT INTO conductores/);
        expect(sql).toMatch(/\(nombre, telefono\)/);
        expect(params).toEqual(['Juan Pérez', '+56987654321']);
    });

    test('PUT con teléfono vacío lo borra (NULL)', async () => {
        mockBd();
        const res = await request(app).put('/api/conductores/4').set(bearer(CONDUCTORES)).send({ telefono: '' });
        expect(res.status).toBe(200);
        const [sql, params] = llamada(/^UPDATE conductores SET/);
        expect(sql).toMatch(/telefono = \?/);
        expect(params).toEqual([null, '4']);
    });

    test('teléfono inválido → 400 con mensaje claro y sin escribir', async () => {
        mockBd();
        const res = await request(app).post('/api/conductores').set(bearer(CONDUCTORES))
            .send({ nombre: 'Juan Pérez', telefono: '22345678' });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/El teléfono debe ser un celular chileno de 9 dígitos que empiece con 9/);
        expect(res.body.code).toBe('TELEFONO_INVALIDO');
        expect(escrituras()).toEqual([]);
    });

    test('pre-migración 132: el teléfono se descarta y el conductor se crea igual', async () => {
        mockBd({ telefonoCol: false });
        const res = await request(app).post('/api/conductores').set(bearer(CONDUCTORES))
            .send({ nombre: 'Juan Pérez', telefono: '912345678' });
        expect(res.status).toBe(201);
        const [sql, params] = llamada(/^INSERT INTO conductores/);
        expect(sql).not.toMatch(/telefono/);
        expect(params).toEqual(['Juan Pérez']);
    });

    test('GET: con vehiculos.ver trae el teléfono; sin él no llega (ni en el listado ni en el detalle)', async () => {
        mockBd();
        const con = await request(app).get('/api/conductores').set(bearer(['conductores.ver', 'vehiculos.ver']));
        expect(con.status).toBe(200);
        expect(con.body.data[0].telefono).toBe('+56987654321');

        const sin = await request(app).get('/api/conductores').set(bearer(['conductores.ver']));
        expect(sin.status).toBe(200);
        expect(sin.body.data[0]).toEqual({ id: 4, nombre: 'Juan Pérez', activo: 1 });
        expect(sin.body.pagination).toBeDefined();

        const uno = await request(app).get('/api/conductores/4').set(bearer(['conductores.ver']));
        expect(uno.status).toBe(200);
        expect(uno.body).not.toHaveProperty('telefono');
        expect(uno.body.nombre).toBe('Juan Pérez');
    });

    test('POST sin vehiculos.ver: la respuesta no devuelve el teléfono (aunque se guarde)', async () => {
        mockBd();
        const res = await request(app).post('/api/conductores').set(bearer(['conductores.crear']))
            .send({ nombre: 'Juan Pérez', telefono: '9 8765 4321' });
        expect(res.status).toBe(201);
        expect(res.body).not.toHaveProperty('telefono');
        expect(llamada(/^INSERT INTO conductores/)[1]).toEqual(['Juan Pérez', '+56987654321']);
    });
});

// ══════════════════════════════════════════════
// Formulario del vehículo
// ══════════════════════════════════════════════
describe('vehículo → teléfono de su conductor', () => {
    const EDITAR = ['vehiculos.ver', 'vehiculos.editar', 'vehiculos.crear'];

    test('PUT con conductor_telefono actualiza el teléfono del conductor resuelto', async () => {
        mockBd({ conductorExiste: 4 });
        const res = await request(app).put('/api/vehiculos/7').set(bearer(EDITAR))
            .send({ marca: 'HYUNDAI', conductor_nombre: 'Juan Pérez', conductor_telefono: '+56 9 8765 4321' });
        expect(res.status).toBe(200);
        expect(llamada(/^UPDATE conductores SET telefono/)[1]).toEqual(['+56987654321', 4]);
        expect(res.body.data.conductor_telefono).toBe('+56987654321');
    });

    test('un conductor nuevo se crea y recibe el teléfono', async () => {
        mockBd({ conductorExiste: null });
        const res = await request(app).put('/api/vehiculos/7').set(bearer(EDITAR))
            .send({ conductor_nombre: 'Pedro Soto', conductor_telefono: '912345678' });
        expect(res.status).toBe(200);
        expect(llamada(/^INSERT INTO conductores/)[1]).toEqual(['Pedro Soto']);
        expect(llamada(/^UPDATE conductores SET telefono/)[1]).toEqual(['+56912345678', 50]);
    });

    test('sin conductor_telefono no se toca el teléfono del conductor', async () => {
        mockBd();
        const res = await request(app).put('/api/vehiculos/7').set(bearer(EDITAR))
            .send({ marca: 'HYUNDAI', conductor_nombre: 'Juan Pérez' });
        expect(res.status).toBe(200);
        expect(llamada(/^UPDATE conductores/)).toBeUndefined();
    });

    test('teléfono vacío lo borra del conductor', async () => {
        mockBd();
        const res = await request(app).put('/api/vehiculos/7').set(bearer(EDITAR))
            .send({ conductor_nombre: 'Juan Pérez', conductor_telefono: '' });
        expect(res.status).toBe(200);
        expect(llamada(/^UPDATE conductores SET telefono/)[1]).toEqual([null, 4]);
    });

    test('solo el teléfono (sin conductor_nombre): va al conductor que ya tiene el vehículo', async () => {
        mockBd({ conductorActual: 4 });
        const res = await request(app).put('/api/vehiculos/7').set(bearer(EDITAR))
            .send({ conductor_telefono: '9 1111 2222' });
        expect(res.status).toBe(200);
        expect(llamada(/^UPDATE vehiculos SET/)).toBeUndefined();
        expect(llamada(/^UPDATE conductores SET telefono/)[1]).toEqual(['+56911112222', 4]);
    });

    test('teléfono inválido → 400 y NO escribe nada (ni conductor nuevo ni vehículo)', async () => {
        mockBd({ conductorExiste: null });
        const res = await request(app).put('/api/vehiculos/7').set(bearer(EDITAR))
            .send({ marca: 'HYUNDAI', conductor_nombre: 'Pedro Soto', conductor_telefono: '2 2345 6789' });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/^El teléfono del conductor debe ser un celular chileno/);
        expect(escrituras()).toEqual([]);
    });

    test('teléfono sin conductor → 400 TELEFONO_SIN_CONDUCTOR y sin escribir', async () => {
        mockBd({ conductorActual: null });
        const res = await request(app).put('/api/vehiculos/7').set(bearer(EDITAR))
            .send({ marca: 'HYUNDAI', conductor_nombre: '', conductor_telefono: '912345678' });
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('TELEFONO_SIN_CONDUCTOR');
        expect(escrituras()).toEqual([]);

        const crear = await request(app).post('/api/vehiculos').set(bearer(EDITAR))
            .send({ patente: 'KRPD17', marca: 'HYUNDAI', modelo: 'HD78', anio: 2020, conductor_nombre: null, conductor_telefono: '912345678' });
        expect(crear.status).toBe(400);
        expect(escrituras()).toEqual([]);
    });

    test('POST crea el vehículo y guarda el teléfono del conductor', async () => {
        mockBd({ conductorExiste: 4 });
        const res = await request(app).post('/api/vehiculos').set(bearer(EDITAR))
            .send({ patente: 'krpd17', marca: 'HYUNDAI', modelo: 'HD78', anio: 2020, conductor_nombre: 'Juan Pérez', conductor_telefono: '987654321' });
        expect(res.status).toBe(201);
        const orden = sqls();
        const iVeh = orden.findIndex(s => /^INSERT INTO vehiculos/.test(s));
        const iTel = orden.findIndex(s => /^UPDATE conductores SET telefono/.test(s));
        expect(iVeh).toBeGreaterThan(-1);
        expect(iTel).toBeGreaterThan(iVeh);
        expect(llamada(/^UPDATE conductores SET telefono/)[1]).toEqual(['+56987654321', 4]);
    });

    test('pre-migración 132: el vehículo se guarda igual y el teléfono se omite sin 500', async () => {
        mockBd({ telefonoCol: false });
        const res = await request(app).put('/api/vehiculos/7').set(bearer(EDITAR))
            .send({ marca: 'HYUNDAI', conductor_nombre: 'Juan Pérez', conductor_telefono: '912345678' });
        expect(res.status).toBe(200);
        expect(llamada(/^UPDATE vehiculos SET/)).toBeDefined();
        expect(res.body.data).not.toHaveProperty('conductor_telefono');
    });

    test('sin vehiculos.ver la respuesta del PUT no trae el teléfono', async () => {
        mockBd();
        const res = await request(app).put('/api/vehiculos/7').set(bearer(['vehiculos.editar']))
            .send({ marca: 'HYUNDAI' });
        expect(res.status).toBe(200);
        expect(res.body.data).not.toHaveProperty('conductor_telefono');
        expect(res.body.data.conductor_nombre).toBe('Juan Pérez');
    });
});

describe('getById / getAll de vehículos — conductor_telefono', () => {
    test('getById y GET /api/vehiculos lo devuelven (con vehiculos.ver)', async () => {
        mockBd();
        const v = await svc.getById(7);
        expect(v.conductor_telefono).toBe('+56987654321');
        expect(llamada(/WHERE v\.id = \?/)[0]).toMatch(/c\.telefono AS conductor_telefono/);

        const res = await request(app).get('/api/vehiculos').set(bearer(['vehiculos.ver']));
        expect(res.status).toBe(200);
        expect(res.body.data[0].conductor_telefono).toBe('+56987654321');
    });

    test('pre-migración 132: getAll se relee sin la columna', async () => {
        db.query.mockRejectedValueOnce(errBadField()).mockResolvedValueOnce([[vehiculoRow({ conductor_telefono: undefined })]]);
        const rows = await svc.getAll({});
        expect(db.query.mock.calls[0][0]).toMatch(/c\.telefono AS conductor_telefono/);
        expect(db.query.mock.calls[1][0]).not.toMatch(/telefono/);
        expect(rows[0].conductor_nombre).toBe('Juan Pérez');
    });

    test('un error que no es de columna ausente no se esconde', async () => {
        db.query.mockRejectedValueOnce(Object.assign(new Error('Too many connections'), { code: 'ER_CON_COUNT_ERROR' }));
        await expect(svc.getAll({})).rejects.toThrow(/Too many connections/);
    });
});

describe('ocultarCamposSinPermiso', () => {
    const correr = (perms, body) => {
        const req = { user: perms ? { p: perms } : undefined };
        let enviado;
        const res = { json: (b) => { enviado = b; return b; } };
        ocultarCamposSinPermiso('vehiculos.ver', ['telefono'])(req, res, () => {});
        res.json(body);
        return enviado;
    };

    test('limpia { data: [..] }, { data: {..} }, [..] y la fila suelta; con el permiso no toca nada', () => {
        const fila = { id: 1, nombre: 'A', telefono: '+56912345678' };
        expect(correr([], { data: [fila], pagination: {} })).toEqual({ data: [{ id: 1, nombre: 'A' }], pagination: {} });
        expect(correr([], { data: fila })).toEqual({ data: { id: 1, nombre: 'A' } });
        expect(correr(null, [fila])).toEqual([{ id: 1, nombre: 'A' }]);
        expect(correr([], fila)).toEqual({ id: 1, nombre: 'A' });
        expect(correr([], { error: 'x' })).toEqual({ error: 'x' });
        expect(correr(['vehiculos.ver'], { data: [fila] })).toEqual({ data: [fila] });
        // No muta el objeto original.
        expect(fila.telefono).toBe('+56912345678');
    });
});
