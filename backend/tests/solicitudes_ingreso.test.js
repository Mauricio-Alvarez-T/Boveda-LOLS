/**
 * Tests de la ficha de ingreso digital (/api/solicitudes-ingreso).
 *
 * Flujo: terreno (`trabajadores.solicitud.crear`) crea una SOLICITUD de nuevo
 * trabajador → oficina (`trabajadores.solicitud.aprobar`) la revisa, corrige,
 * asigna EMPRESA y la aprueba (crea el trabajador en una transacción) o la
 * rechaza con motivo. Lo que fijan estos tests:
 *   · check-rut: bloquea si el RUT ya está en `trabajadores` (activo O
 *     finiquitado) o tiene otra solicitud pendiente; compara por rut_normalized,
 *   · crear: 400 DV inválido / faltan obligatorios (validateBody), 409 RUT
 *     existente o pendiente duplicada, 201 con rut formateado, ''→NULL,
 *     solicitante_id del token (nunca del body: strip),
 *   · listar: con aprobar ve TODAS (sin filtro solicitante); sin aprobar solo
 *     las propias; aislamiento es_prueba salvo ?incluir_prueba=true,
 *   · getById: 403 si es ajena y no aprueba,
 *   · aprobar: FOR UPDATE + guard pendiente (409, rollback) + RUT único (409)
 *     + INSERT trabajadores (rut formateado, activo=1, es_prueba heredado de la
 *     obra) + UPDATE solicitud + commit; error en INSERT → rollback y nada de
 *     log; ER_DUP_ENTRY de la carrera → 409 de dominio,
 *   · rechazar: motivo obligatorio (400), guard pendiente (409),
 *   · gates 403 en cada ruta y /pendientes/count solo con aprobar,
 *   · blindaje crud.service: ER_DUP_ENTRY en trabajadores → 409 y NINGÚN
 *     DELETE (antes el reciclaje borraba en duro a todos los finiquitados).
 *
 * Mocks de BD, sin conexión real (patrón de asistencia_borrar.test.js).
 */

jest.mock('../src/config/db', () => ({
    query: jest.fn().mockResolvedValue([[]]),
    getConnection: jest.fn(),
}));
jest.mock('../src/middleware/logger', () => ({
    logManualActivity: jest.fn().mockResolvedValue(undefined),
    // index.js monta activityLogger como middleware global: sin él, app no carga.
    activityLogger: (req, res, next) => next(),
    resolveEntidad: jest.fn(),
}));

const request = require('supertest');
const app = require('../index');
const db = require('../src/config/db');
const { logManualActivity } = require('../src/middleware/logger');
const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'secret';
const makeToken = (id, permisos) =>
    jwt.sign({ id, email: `u${id}@lols.cl`, rol_id: 2, rv: 1, p: permisos }, SECRET);

const CREAR = 'trabajadores.solicitud.crear';
const APROBAR = 'trabajadores.solicitud.aprobar';

const TERRENO_ID = 7;
const OFICINA_ID = 3;
const tokenTerreno = makeToken(TERRENO_ID, [CREAR]);
const tokenOficina = makeToken(OFICINA_ID, [APROBAR]);
const tokenSinNada = makeToken(9, ['trabajadores.ver', 'trabajadores.crear']);
const tokenTrabCrear = makeToken(1, ['trabajadores.crear', 'cargos.crear']);

const BASE = '/api/solicitudes-ingreso';

/** Ficha tal como la manda terreno (RUT sin formato a propósito). */
const FICHA = {
    rut: '12345678-5',
    nombres: 'Ana María',
    apellido_paterno: 'Soto',
    apellido_materno: 'Ruiz',
    cargo_id: 2,
    obra_id: 5,
    fecha_ingreso: '2026-09-08',
    telefono: '+56 9 1234 5678',
    observaciones: 'Viene recomendada por el capataz',
};

/** Fila como la devuelve SELECT_SOLICITUD (con los LEFT JOIN resueltos). */
const SOLICITUD_ROW = {
    id: 41,
    estado: 'pendiente',
    rut: '12.345.678-5',
    nombres: 'Ana María',
    apellido_paterno: 'Soto',
    apellido_materno: 'Ruiz',
    cargo_id: 2,
    obra_id: 5,
    empresa_id: null,
    fecha_ingreso: '2026-09-08',
    solicitante_id: TERRENO_ID,
    resuelto_por: null,
    trabajador_id: null,
    cargo_nombre: 'Jornal',
    obra_nombre: 'TOESCA',
    empresa_nombre: null,
    solicitante_nombre: 'Pedro Terreno',
    resuelto_por_nombre: null,
};

const TRAB_ACTIVO = { id: 7, nombres: 'Juan', apellido_paterno: 'Pérez', apellido_materno: 'Soto', activo: true };
const TRAB_FINIQUITADO = { ...TRAB_ACTIVO, activo: false };

const makeConn = () => ({
    beginTransaction: jest.fn().mockResolvedValue(undefined),
    query: jest.fn().mockResolvedValue([[]]),
    commit: jest.fn().mockResolvedValue(undefined),
    rollback: jest.fn().mockResolvedValue(undefined),
    release: jest.fn(),
});

let conn;
beforeEach(() => {
    jest.clearAllMocks();
    // mockReset limpia también la cola de *Once que un test anterior pudiera
    // haber dejado sin consumir (clearAllMocks no lo hace).
    db.query.mockReset().mockResolvedValue([[]]);
    conn = makeConn();
    db.getConnection.mockReset().mockResolvedValue(conn);
});

const sqlCalls = (mockFn) => mockFn.mock.calls.map(([sql]) => String(sql));

// ══════════════════════════════════════════════
// GET /check-rut/:rut
// ══════════════════════════════════════════════
describe('GET /api/solicitudes-ingreso/check-rut/:rut', () => {
    test('403 sin solicitud.crear (aprobar solo no alcanza) y no toca la BD', async () => {
        const res = await request(app)
            .get(`${BASE}/check-rut/12.345.678-5`)
            .set('Authorization', `Bearer ${tokenOficina}`);
        expect(res.status).toBe(403);
        expect(db.query).not.toHaveBeenCalled();
    });

    test('RUT ya en trabajadores (ACTIVO): existe_trabajador con nombre y activo=true', async () => {
        db.query
            .mockResolvedValueOnce([[TRAB_ACTIVO]])   // trabajadores por rut_normalized
            .mockResolvedValueOnce([[]]);             // solicitud pendiente

        const res = await request(app)
            .get(`${BASE}/check-rut/12.345.678-5`)
            .set('Authorization', `Bearer ${tokenTerreno}`);

        expect(res.status).toBe(200);
        expect(res.body.data).toEqual({
            existe_trabajador: true,
            trabajador: { id: 7, nombre: 'Pérez Soto Juan', activo: true },
            solicitud_pendiente: null,
        });
        // Comparación por la columna indexada, con el RUT LIMPIO (sin puntos ni guión).
        const [sql, params] = db.query.mock.calls[0];
        expect(sql).toMatch(/FROM trabajadores/);
        expect(sql).toMatch(/rut_normalized = \?/);
        expect(params).toEqual(['123456785']);
    });

    test('RUT de un FINIQUITADO también bloquea (existe_trabajador=true, activo=false)', async () => {
        db.query
            .mockResolvedValueOnce([[TRAB_FINIQUITADO]])
            .mockResolvedValueOnce([[]]);

        const res = await request(app)
            .get(`${BASE}/check-rut/12345678-5`)
            .set('Authorization', `Bearer ${tokenTerreno}`);

        expect(res.status).toBe(200);
        expect(res.body.data.existe_trabajador).toBe(true);
        expect(res.body.data.trabajador).toEqual({ id: 7, nombre: 'Pérez Soto Juan', activo: false });
        // El SELECT NO filtra por activo: finiquitado también es duplicado.
        expect(db.query.mock.calls[0][0]).not.toMatch(/activo\s*=/);
    });

    test('RUT con solicitud PENDIENTE: solicitud_pendiente {id} y sin trabajador', async () => {
        db.query
            .mockResolvedValueOnce([[]])
            .mockResolvedValueOnce([[{ id: 41 }]]);

        const res = await request(app)
            .get(`${BASE}/check-rut/12.345.678-5`)
            .set('Authorization', `Bearer ${tokenTerreno}`);

        expect(res.status).toBe(200);
        expect(res.body.data).toEqual({
            existe_trabajador: false,
            trabajador: null,
            solicitud_pendiente: { id: 41 },
        });
        const [sql, params] = db.query.mock.calls[1];
        expect(sql).toMatch(/FROM solicitudes_ingreso/);
        expect(sql).toMatch(/estado = 'pendiente'/);
        expect(sql).toMatch(/REPLACE\(REPLACE\(UPPER\(rut\), '\.', ''\), '-', ''\) = \?/);
        expect(params).toEqual(['123456785']);
    });

    test('RUT libre: todo en falso/null', async () => {
        const res = await request(app)
            .get(`${BASE}/check-rut/9.876.543-3`)
            .set('Authorization', `Bearer ${tokenTerreno}`);

        expect(res.status).toBe(200);
        expect(res.body.data).toEqual({ existe_trabajador: false, trabajador: null, solicitud_pendiente: null });
        // trabajador + solicitud pendiente + antecedente por RUT (mig 113: ficha depurada con marca).
        expect(db.query).toHaveBeenCalledTimes(3);
    });

    test('RUT sin dígitos (tipeo a medias): responde libre sin consultar la BD', async () => {
        const res = await request(app)
            .get(`${BASE}/check-rut/-`)
            .set('Authorization', `Bearer ${tokenTerreno}`);

        expect(res.status).toBe(200);
        expect(res.body.data.existe_trabajador).toBe(false);
        expect(db.query).not.toHaveBeenCalled();
    });
});

// ══════════════════════════════════════════════
// POST /
// ══════════════════════════════════════════════
describe('POST /api/solicitudes-ingreso', () => {
    const post = (token, body) =>
        request(app).post(BASE).set('Authorization', `Bearer ${token}`).send(body);

    test('201: INSERT con rut formateado, opcionales vacíos → NULL y solicitante_id del TOKEN (strip del body)', async () => {
        db.query
            .mockResolvedValueOnce([[]])                          // trabajador por rut
            .mockResolvedValueOnce([[]])                          // pendiente por rut
            .mockResolvedValueOnce([{ insertId: 41, affectedRows: 1 }])
            .mockResolvedValueOnce([[SOLICITUD_ROW]]);            // _getRow

        const res = await post(tokenTerreno, {
            ...FICHA,
            fecha_nacimiento: null,      // el front normaliza opcionales vacíos a null → NULL
            afp: '  ',                   // texto en blanco → NULL (trim del service)
            // Inyecciones que el strip debe descartar:
            estado: 'aprobada',
            solicitante_id: 999,
            trabajador_id: 555,
        });

        expect(res.status).toBe(201);
        expect(res.body.data).toMatchObject({ id: 41, estado: 'pendiente', rut: '12.345.678-5' });

        const [sql, values] = db.query.mock.calls[2];
        expect(sql).toMatch(/^INSERT INTO solicitudes_ingreso \(/);
        expect(sql).toMatch(/solicitante_id\)/);
        // Orden de columnas = CAMPOS_FICHA + solicitante_id; nada inyectado.
        const cols = sql.match(/\(([^)]+)\) VALUES/)[1].split(',').map(s => s.trim());
        expect(cols).not.toContain('estado');          // (estado_civil sí es de la ficha)
        expect(cols).not.toContain('trabajador_id');
        expect(cols).not.toContain('resuelto_por');
        expect(cols).toHaveLength(values.length);
        const row = Object.fromEntries(cols.map((c, i) => [c, values[i]]));
        expect(row.rut).toBe('12.345.678-5');
        expect(row.nombres).toBe('Ana María');
        expect(row.apellido_paterno).toBe('Soto');
        expect(row.apellido_materno).toBe('Ruiz');
        expect(row.cargo_id).toBe(2);
        expect(row.obra_id).toBe(5);
        expect(row.fecha_ingreso).toBe('2026-09-08');
        expect(row.fecha_nacimiento).toBeNull();
        expect(row.afp).toBeNull();
        expect(row.estado_civil).toBeNull();
        expect(row.cargas_familiares).toBeNull();
        expect(row.telefono).toBe('+56 9 1234 5678');
        expect(row.solicitante_id).toBe(TERRENO_ID);
        expect(values).not.toContain(999);
        expect(values).not.toContain(555);
    });

    test('contrato de opcionales: fecha_nacimiento null pasa (→ NULL); "" en un campo date rebota 400 por formato', async () => {
        // null → validateBody lo trata como ausente y el strip lo conserva → NULL en BD.
        db.query
            .mockResolvedValueOnce([[]])
            .mockResolvedValueOnce([[]])
            .mockResolvedValueOnce([{ insertId: 43 }])
            .mockResolvedValueOnce([[{ ...SOLICITUD_ROW, id: 43 }]]);
        const ok = await post(tokenTerreno, { ...FICHA, fecha_nacimiento: null, cargas_familiares: null });
        expect(ok.status).toBe(201);

        // '' NO es null para el mini-DSL: con format:'date' falla el regex.
        // El front (normalizarDatosPersonales) manda null, nunca '' en fechas.
        db.query.mockClear();
        const bad = await post(tokenTerreno, { ...FICHA, fecha_nacimiento: '' });
        expect(bad.status).toBe(400);
        expect(bad.body.error).toMatch(/fecha_nacimiento debe tener formato YYYY-MM-DD/);
        expect(db.query).not.toHaveBeenCalled();
    });

    test('400 RUT con dígito verificador inválido, sin tocar la BD', async () => {
        const res = await post(tokenTerreno, { ...FICHA, rut: '12.345.678-9' });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/RUT inválido/);
        expect(db.query).not.toHaveBeenCalled();
    });

    test.each([
        ['cargo_id', /cargo_id es requerido/],
        ['obra_id', /obra_id es requerido/],
        ['fecha_ingreso', /fecha_ingreso es requerida?/],
        ['nombres', /nombres es requerido/],
        ['apellido_paterno', /apellido_paterno es requerido/],
        ['rut', /rut es requerido/],
    ])('400 si falta el obligatorio %s (validateBody)', async (campo, re) => {
        const body = { ...FICHA };
        delete body[campo];
        const res = await post(tokenTerreno, body);
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(re);
        expect(db.query).not.toHaveBeenCalled();
    });

    test('400 por forma: fecha_ingreso no YYYY-MM-DD, cargas_familiares fuera de rango, cargo_id no entero', async () => {
        let res = await post(tokenTerreno, { ...FICHA, fecha_ingreso: '08-09-2026' });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/fecha_ingreso debe tener formato YYYY-MM-DD/);

        res = await post(tokenTerreno, { ...FICHA, cargas_familiares: 300 });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/cargas_familiares debe ser <= 255/);

        res = await post(tokenTerreno, { ...FICHA, cargo_id: 'jornal' });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/cargo_id debe ser un entero/);

        expect(db.query).not.toHaveBeenCalled();
    });

    describe('ficha completa (mig 109): tallas + cuenta bancaria', () => {
        const insertCols = () => {
            const [sql, values] = db.query.mock.calls[2];
            const cols = sql.match(/\(([^)]+)\) VALUES/)[1].split(',').map(s => s.trim());
            return Object.fromEntries(cols.map((c, i) => [c, values[i]]));
        };
        const mockCrearOk = () => db.query
            .mockResolvedValueOnce([[]])
            .mockResolvedValueOnce([[]])
            .mockResolvedValueOnce([{ insertId: 50 }])
            .mockResolvedValueOnce([[{ ...SOLICITUD_ROW, id: 50 }]]);

        test('400 por forma/rango: talla_calzado 34, talla_pantalon 51, talla_polera XS, tipo_cuenta "" o inválido, cuenta_rut no boolean', async () => {
            let res = await post(tokenTerreno, { ...FICHA, talla_calzado: 34 });
            expect(res.status).toBe(400);
            expect(res.body.error).toMatch(/talla_calzado debe ser >= 35/);

            res = await post(tokenTerreno, { ...FICHA, talla_pantalon: 51 });
            expect(res.status).toBe(400);
            expect(res.body.error).toMatch(/talla_pantalon debe ser <= 50/);

            res = await post(tokenTerreno, { ...FICHA, talla_polera: 'XS' });
            expect(res.status).toBe(400);
            expect(res.body.error).toMatch(/talla_polera debe ser uno de: S, M, L, XL, XXL/);

            // '' NO es null para el `in` del mini-DSL → el front manda null, nunca ''.
            res = await post(tokenTerreno, { ...FICHA, tipo_cuenta: '' });
            expect(res.status).toBe(400);
            expect(res.body.error).toMatch(/tipo_cuenta debe ser uno de: vista, corriente/);

            res = await post(tokenTerreno, { ...FICHA, cuenta_rut: 'si' });
            expect(res.status).toBe(400);
            expect(res.body.error).toMatch(/cuenta_rut debe ser true\|false/);

            res = await post(tokenTerreno, { ...FICHA, numero_cuenta: '123 456' });
            expect(res.status).toBe(400);
            expect(res.body.error).toMatch(/numero_cuenta solo admite/);

            expect(db.query).not.toHaveBeenCalled();
        });

        test('cuenta_rut=true fuerza BancoEstado / vista / número = RUT sin DV aunque el cliente mande otro banco', async () => {
            mockCrearOk();
            const res = await post(tokenTerreno, {
                ...FICHA, cuenta_rut: true, banco: 'Santander', tipo_cuenta: 'corriente', numero_cuenta: '999',
                talla_calzado: 42, talla_pantalon: 44, talla_polera: 'xl',
            });
            expect(res.status).toBe(201);
            expect(insertCols()).toMatchObject({
                cuenta_rut: true, banco: 'BancoEstado', tipo_cuenta: 'vista', numero_cuenta: '12345678',
                talla_calzado: 42, talla_pantalon: 44, talla_polera: 'XL',
            });
        });

        test('cuenta_rut=false conserva banco / tipo / número tal como vienen; sin datos → NULL', async () => {
            mockCrearOk();
            let res = await post(tokenTerreno, { ...FICHA, cuenta_rut: false, banco: 'Santander', tipo_cuenta: 'corriente', numero_cuenta: '0-123-456-7' });
            expect(res.status).toBe(201);
            expect(insertCols()).toMatchObject({ cuenta_rut: false, banco: 'Santander', tipo_cuenta: 'corriente', numero_cuenta: '0-123-456-7' });

            db.query.mockClear();
            mockCrearOk();
            res = await post(tokenTerreno, FICHA);
            expect(res.status).toBe(201);
            expect(insertCols()).toMatchObject({
                cuenta_rut: null, banco: null, tipo_cuenta: null, numero_cuenta: null,
                talla_calzado: null, talla_pantalon: null, talla_polera: null,
            });
        });
    });

    test('409 si el RUT ya existe en trabajadores (ACTIVO): mensaje con el nombre y sin INSERT', async () => {
        db.query.mockResolvedValueOnce([[TRAB_ACTIVO]]);

        const res = await post(tokenTerreno, FICHA);

        expect(res.status).toBe(409);
        expect(res.body.error).toMatch(/^Ya existe un trabajador con este RUT \(Pérez Soto Juan\)\./);
        expect(res.body.error).toMatch(/contacta a administración por WhatsApp/);
        expect(db.query).toHaveBeenCalledTimes(1);
        expect(sqlCalls(db.query).some(s => /INSERT/.test(s))).toBe(false);
    });

    test('409 si el RUT es de un FINIQUITADO (la oficina reactiva, no se duplica)', async () => {
        db.query.mockResolvedValueOnce([[TRAB_FINIQUITADO]]);

        const res = await post(tokenTerreno, FICHA);

        expect(res.status).toBe(409);
        expect(res.body.error).toMatch(/\(Pérez Soto Juan, finiquitado\)/);
        expect(sqlCalls(db.query).some(s => /INSERT/.test(s))).toBe(false);
    });

    test('409 si ya hay una solicitud PENDIENTE con ese RUT', async () => {
        db.query
            .mockResolvedValueOnce([[]])
            .mockResolvedValueOnce([[{ id: 40 }]]);

        const res = await post(tokenTerreno, FICHA);

        expect(res.status).toBe(409);
        expect(res.body.error).toMatch(/solicitud de ingreso pendiente para este RUT \(#40\)/);
        expect(db.query).toHaveBeenCalledTimes(2);
    });

    test('403 sin solicitud.crear (aprobar solo NO crea) y 401 sin token', async () => {
        const res = await post(tokenOficina, FICHA);
        expect(res.status).toBe(403);
        expect(db.query).not.toHaveBeenCalled();

        const anon = await request(app).post(BASE).send(FICHA);
        expect(anon.status).toBe(401);
    });
});

// ══════════════════════════════════════════════
// GET /  (listar)
// ══════════════════════════════════════════════
describe('GET /api/solicitudes-ingreso (listar)', () => {
    test('con aprobar ve TODAS: el SQL no filtra por solicitante y trae los nombres por LEFT JOIN', async () => {
        db.query.mockResolvedValueOnce([[SOLICITUD_ROW, { ...SOLICITUD_ROW, id: 42, solicitante_id: 99 }]]);

        const res = await request(app)
            .get(BASE)
            .set('Authorization', `Bearer ${tokenOficina}`);

        expect(res.status).toBe(200);
        expect(res.body.data).toHaveLength(2);
        expect(res.body.data[0]).toMatchObject({ cargo_nombre: 'Jornal', obra_nombre: 'TOESCA', solicitante_nombre: 'Pedro Terreno' });

        const [sql, params] = db.query.mock.calls[0];
        expect(sql).not.toMatch(/solicitante_id = \?/);
        expect(sql).not.toMatch(/s\.estado = \?/);          // sin ?estado → todas
        expect(params).toEqual([]);
        expect(sql).toMatch(/LEFT JOIN cargos\s+c\s+ON c\.id\s+= s\.cargo_id/);
        expect(sql).toMatch(/LEFT JOIN obras\s+o\s+ON o\.id\s+= s\.obra_id/);
        expect(sql).toMatch(/LEFT JOIN empresas\s+e\s+ON e\.id\s+= s\.empresa_id/);
        expect(sql).toMatch(/LEFT JOIN usuarios us ON us\.id = s\.solicitante_id/);
        expect(sql).toMatch(/LEFT JOIN usuarios ur ON ur\.id = s\.resuelto_por/);
        // Pendientes primero, luego lo más reciente.
        expect(sql).toMatch(/ORDER BY \(s\.estado = 'pendiente'\) DESC, s\.fecha_solicitud DESC/);
    });

    test('?estado=pendiente filtra por estado (y sigue sin filtro de solicitante con aprobar)', async () => {
        db.query.mockResolvedValueOnce([[SOLICITUD_ROW]]);

        const res = await request(app)
            .get(`${BASE}?estado=pendiente`)
            .set('Authorization', `Bearer ${tokenOficina}`);

        expect(res.status).toBe(200);
        const [sql, params] = db.query.mock.calls[0];
        expect(sql).toMatch(/s\.estado = \?/);
        expect(sql).not.toMatch(/solicitante_id = \?/);
        expect(params).toEqual(['pendiente']);
    });

    test('sin aprobar (terreno) solo ve las propias: filtra solicitante_id = user.id', async () => {
        db.query.mockResolvedValueOnce([[SOLICITUD_ROW]]);

        const res = await request(app)
            .get(`${BASE}?estado=rechazada`)
            .set('Authorization', `Bearer ${tokenTerreno}`);

        expect(res.status).toBe(200);
        const [sql, params] = db.query.mock.calls[0];
        expect(sql).toMatch(/s\.estado = \? AND s\.solicitante_id = \?/);
        expect(params).toEqual(['rechazada', TERRENO_ID]);
    });

    test('aislamiento es_prueba: excluye obras de prueba salvo ?incluir_prueba=true', async () => {
        db.query.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[]]);

        await request(app).get(BASE).set('Authorization', `Bearer ${tokenOficina}`);
        await request(app).get(`${BASE}?incluir_prueba=true`).set('Authorization', `Bearer ${tokenOficina}`);

        expect(db.query.mock.calls[0][0]).toMatch(/s\.obra_id NOT IN \(SELECT id FROM obras WHERE es_prueba = 1\)/);
        expect(db.query.mock.calls[1][0]).not.toMatch(/es_prueba/);
    });

    test('400 con ?estado desconocido, sin consultar', async () => {
        const res = await request(app)
            .get(`${BASE}?estado=archivada`)
            .set('Authorization', `Bearer ${tokenOficina}`);
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/estado debe ser uno de: pendiente, aprobada, rechazada, todas/);
        expect(db.query).not.toHaveBeenCalled();
    });
});

// ══════════════════════════════════════════════
// GET /:id
// ══════════════════════════════════════════════
describe('GET /api/solicitudes-ingreso/:id', () => {
    test('403 si la solicitud es AJENA y el usuario no tiene aprobar', async () => {
        db.query.mockResolvedValueOnce([[{ ...SOLICITUD_ROW, solicitante_id: 99 }]]);

        const res = await request(app)
            .get(`${BASE}/41`)
            .set('Authorization', `Bearer ${tokenTerreno}`);

        expect(res.status).toBe(403);
        expect(res.body.error).toMatch(/No tienes permiso para ver esta solicitud/);
    });

    test('200 la propia sin aprobar; 200 la ajena con aprobar', async () => {
        db.query.mockResolvedValueOnce([[SOLICITUD_ROW]]);
        const propia = await request(app).get(`${BASE}/41`).set('Authorization', `Bearer ${tokenTerreno}`);
        expect(propia.status).toBe(200);
        expect(propia.body.data.id).toBe(41);
        expect(db.query.mock.calls[0][0]).toMatch(/WHERE s\.id = \?/);
        expect(db.query.mock.calls[0][1]).toEqual([41]);

        db.query.mockResolvedValueOnce([[{ ...SOLICITUD_ROW, solicitante_id: 99 }]]);
        const ajena = await request(app).get(`${BASE}/41`).set('Authorization', `Bearer ${tokenOficina}`);
        expect(ajena.status).toBe(200);
    });

    test('404 si no existe; 404 con id no numérico sin consultar', async () => {
        db.query.mockResolvedValueOnce([[]]);
        const res = await request(app).get(`${BASE}/9999`).set('Authorization', `Bearer ${tokenOficina}`);
        expect(res.status).toBe(404);

        db.query.mockClear();
        const bad = await request(app).get(`${BASE}/abc`).set('Authorization', `Bearer ${tokenOficina}`);
        expect(bad.status).toBe(404);
        expect(db.query).not.toHaveBeenCalled();
    });
});

// ══════════════════════════════════════════════
// PUT /:id/aprobar
// ══════════════════════════════════════════════
describe('PUT /api/solicitudes-ingreso/:id/aprobar', () => {
    const aprobar = (token, body, id = 41) =>
        request(app).put(`${BASE}/${id}/aprobar`).set('Authorization', `Bearer ${token}`).send(body);

    const BODY_OFICINA = { ...FICHA, empresa_id: 4, categoria_reporte: 'rotativo' };

    test('OK: FOR UPDATE → RUT único → INSERT trabajadores (rut formateado, activo=1, es_prueba heredado) → UPDATE solicitud → commit → log', async () => {
        conn.query
            .mockResolvedValueOnce([[{ id: 41, estado: 'pendiente' }]])       // SELECT ... FOR UPDATE
            .mockResolvedValueOnce([[]])                                       // trabajador por rut (libre)
            .mockResolvedValueOnce([[{ es_prueba: true }]])                    // obra de prueba → hereda
            .mockResolvedValueOnce([{ insertId: 900, affectedRows: 1 }])       // INSERT trabajadores
            .mockResolvedValueOnce([{ affectedRows: 1 }])                      // UPDATE solicitud
            .mockResolvedValueOnce([{ affectedRows: 0 }]);                     // cierre de otras pendientes del RUT
        db.query.mockResolvedValueOnce([[{ ...SOLICITUD_ROW, estado: 'aprobada', trabajador_id: 900, empresa_id: 4 }]]);

        const res = await aprobar(tokenOficina, BODY_OFICINA);

        expect(res.status).toBe(200);
        expect(res.body.data.trabajador_id).toBe(900);
        expect(res.body.data.solicitud).toMatchObject({ id: 41, estado: 'aprobada', trabajador_id: 900 });

        // 1) lock pesimista de la solicitud
        const [lockSql, lockParams] = conn.query.mock.calls[0];
        expect(lockSql).toMatch(/SELECT id, estado FROM solicitudes_ingreso WHERE id = \? FOR UPDATE/);
        expect(lockParams).toEqual([41]);
        // 2) re-validación de RUT único DENTRO de la transacción, con el RUT limpio
        const [rutSql, rutParams] = conn.query.mock.calls[1];
        expect(rutSql).toMatch(/FROM trabajadores/);
        expect(rutSql).toMatch(/rut_normalized = \?/);
        expect(rutParams).toEqual(['123456785']);
        // 3) herencia es_prueba desde la obra (como el beforeCreate del CRUD)
        expect(conn.query.mock.calls[2][0]).toMatch(/SELECT es_prueba FROM obras WHERE id = \?/);
        expect(conn.query.mock.calls[2][1]).toEqual([5]);
        // 4) INSERT trabajadores
        const [insSql, insVals] = conn.query.mock.calls[3];
        expect(insSql).toMatch(/^INSERT INTO trabajadores \(/);
        const cols = insSql.match(/\(([^)]+)\) VALUES/)[1].split(',').map(s => s.trim());
        const trab = Object.fromEntries(cols.map((c, i) => [c, insVals[i]]));
        expect(trab).toMatchObject({
            rut: '12.345.678-5',            // formatRut aunque llegó '12345678-5'
            nombres: 'Ana María',
            apellido_paterno: 'Soto',
            apellido_materno: 'Ruiz',
            cargo_id: 2,
            obra_id: 5,
            fecha_ingreso: '2026-09-08',
            empresa_id: 4,
            categoria_reporte: 'rotativo',
            activo: 1,
            es_prueba: 1,
        });
        // `observaciones` vive solo en solicitudes_ingreso: trabajadores no tiene esa columna.
        expect(trab).not.toHaveProperty('observaciones');
        // 5) UPDATE de la solicitud con la ficha final + resolución
        const [updSql, updVals] = conn.query.mock.calls[4];
        expect(updSql).toMatch(/UPDATE solicitudes_ingreso/);
        expect(updSql).toMatch(/estado = 'aprobada'/);
        expect(updSql).toMatch(/trabajador_id = \?/);
        expect(updSql).toMatch(/resuelto_por = \?/);
        expect(updSql).toMatch(/fecha_resolucion = NOW\(\)/);
        expect(updSql).toMatch(/WHERE id = \?/);
        expect(updVals[0]).toBe('12.345.678-5');
        expect(updVals.slice(-4)).toEqual([4, 900, OFICINA_ID, 41]);   // empresa, trabajador, resuelto_por, id
        expect(updSql).toMatch(/observaciones = \?/);                  // la solicitud SÍ guarda observaciones
        // 6) cierre de otras pendientes con el mismo RUT (carrera en crear), dentro de la transacción
        const [dupSql, dupVals] = conn.query.mock.calls[5];
        expect(dupSql).toMatch(/UPDATE solicitudes_ingreso/);
        expect(dupSql).toMatch(/SET estado = 'rechazada'/);
        expect(dupSql).toMatch(/WHERE estado = 'pendiente'/);
        expect(dupSql).toMatch(/AND id <> \?/);
        expect(dupSql).toMatch(/REPLACE\(REPLACE\(UPPER\(rut\), '\.', ''\), '-', ''\) = \?/);
        expect(dupVals).toEqual([41, OFICINA_ID, 41, '123456785']);
        expect(conn.query).toHaveBeenCalledTimes(6);

        // Transacción: begin → queries → commit → release; nunca rollback.
        expect(conn.beginTransaction).toHaveBeenCalledTimes(1);
        expect(conn.commit).toHaveBeenCalledTimes(1);
        expect(conn.rollback).not.toHaveBeenCalled();
        expect(conn.release).toHaveBeenCalledTimes(1);
        const order = (fn) => fn.mock.invocationCallOrder[0];
        expect(order(conn.beginTransaction)).toBeLessThan(order(conn.query));
        expect(conn.query.mock.invocationCallOrder[5]).toBeLessThan(order(conn.commit));
        expect(order(conn.commit)).toBeLessThan(order(conn.release));

        // Auditoría manual DESPUÉS del commit, con la resolución.
        expect(logManualActivity).toHaveBeenCalledTimes(1);
        expect(order(conn.commit)).toBeLessThan(order(logManualActivity));
        const [userId, modulo, accion, itemId, detalle] = logManualActivity.mock.calls[0];
        expect([userId, modulo, accion, itemId]).toEqual([OFICINA_ID, 'solicitudes_ingreso', 'UPDATE', '41']);
        const d = JSON.parse(detalle);
        expect(d).toMatchObject({ evento: 'solicitud_aprobada', trabajador_id: 900, rut: '12.345.678-5' });
        expect(d.resumen).toMatch(/#41 aprobada → trabajador #900 Ana María Soto/);
    });

    test('obra normal → es_prueba=0; sin categoria_reporte → default "obra"', async () => {
        conn.query
            .mockResolvedValueOnce([[{ id: 41, estado: 'pendiente' }]])
            .mockResolvedValueOnce([[]])
            .mockResolvedValueOnce([[{ es_prueba: false }]])
            .mockResolvedValueOnce([{ insertId: 901 }])
            .mockResolvedValueOnce([{ affectedRows: 1 }])
            .mockResolvedValueOnce([{ affectedRows: 0 }]);
        db.query.mockResolvedValueOnce([[{ ...SOLICITUD_ROW, estado: 'aprobada', trabajador_id: 901 }]]);

        const res = await aprobar(tokenOficina, { ...FICHA, empresa_id: 4 });

        expect(res.status).toBe(200);
        const [insSql, insVals] = conn.query.mock.calls[3];
        const cols = insSql.match(/\(([^)]+)\) VALUES/)[1].split(',').map(s => s.trim());
        const trab = Object.fromEntries(cols.map((c, i) => [c, insVals[i]]));
        expect(trab.categoria_reporte).toBe('obra');
        expect(trab.es_prueba).toBe(0);
        expect(trab.activo).toBe(1);
    });

    test('la oficina puede CORREGIR la ficha: lo que se inserta es el body revisado, no la solicitud original', async () => {
        conn.query
            .mockResolvedValueOnce([[{ id: 41, estado: 'pendiente' }]])
            .mockResolvedValueOnce([[]])
            .mockResolvedValueOnce([[{ es_prueba: 0 }]])
            .mockResolvedValueOnce([{ insertId: 902 }])
            .mockResolvedValueOnce([{ affectedRows: 1 }])
            .mockResolvedValueOnce([{ affectedRows: 0 }]);
        db.query.mockResolvedValueOnce([[{ ...SOLICITUD_ROW, estado: 'aprobada', trabajador_id: 902 }]]);

        const res = await aprobar(tokenOficina, {
            ...FICHA,
            rut: '9.876.543-3',            // RUT corregido por la oficina
            nombres: 'Ana',
            obra_id: 8,
            cargas_familiares: 2,
            empresa_id: 4,
        });

        expect(res.status).toBe(200);
        expect(conn.query.mock.calls[1][1]).toEqual(['98765433']);          // re-valida el RUT corregido
        expect(conn.query.mock.calls[2][1]).toEqual([8]);                   // hereda de la obra corregida
        const [insSql, insVals] = conn.query.mock.calls[3];
        const cols = insSql.match(/\(([^)]+)\) VALUES/)[1].split(',').map(s => s.trim());
        const trab = Object.fromEntries(cols.map((c, i) => [c, insVals[i]]));
        expect(trab).toMatchObject({ rut: '9.876.543-3', nombres: 'Ana', obra_id: 8, cargas_familiares: 2 });
        // La solicitud queda con la ficha FINAL.
        expect(conn.query.mock.calls[4][1][0]).toBe('9.876.543-3');
        // Y el cierre de duplicadas usa el RUT CORREGIDO.
        expect(conn.query.mock.calls[5][1]).toEqual([41, OFICINA_ID, 41, '98765433']);
    });

    test('409 si la solicitud ya NO está pendiente: rollback, sin INSERT ni log', async () => {
        conn.query.mockResolvedValueOnce([[{ id: 41, estado: 'rechazada' }]]);

        const res = await aprobar(tokenOficina, BODY_OFICINA);

        expect(res.status).toBe(409);
        expect(res.body.error).toMatch(/La solicitud ya fue rechazada/);
        expect(conn.query).toHaveBeenCalledTimes(1);
        expect(conn.rollback).toHaveBeenCalledTimes(1);
        expect(conn.commit).not.toHaveBeenCalled();
        expect(conn.release).toHaveBeenCalledTimes(1);
        expect(logManualActivity).not.toHaveBeenCalled();
    });

    test('404 si la solicitud no existe (dentro de la transacción → rollback)', async () => {
        conn.query.mockResolvedValueOnce([[]]);
        const res = await aprobar(tokenOficina, BODY_OFICINA, 777);
        expect(res.status).toBe(404);
        expect(conn.rollback).toHaveBeenCalledTimes(1);
        expect(conn.release).toHaveBeenCalledTimes(1);
    });

    test('400 sin empresa_id (validateBody) — no abre transacción', async () => {
        const res = await aprobar(tokenOficina, { ...FICHA });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/empresa_id es requerido/);
        expect(db.getConnection).not.toHaveBeenCalled();
    });

    test('400 categoria_reporte fuera del ENUM y 400 RUT inválido — sin transacción', async () => {
        let res = await aprobar(tokenOficina, { ...BODY_OFICINA, categoria_reporte: 'gerencia' });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/categoria_reporte debe ser uno de: obra, operaciones, rotativo/);

        res = await aprobar(tokenOficina, { ...BODY_OFICINA, rut: '12.345.678-9' });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/RUT inválido/);

        expect(db.getConnection).not.toHaveBeenCalled();
    });

    test('409 si el RUT ya existe en trabajadores al momento de aprobar (creado por otra vía): rollback, sin INSERT', async () => {
        conn.query
            .mockResolvedValueOnce([[{ id: 41, estado: 'pendiente' }]])
            .mockResolvedValueOnce([[TRAB_FINIQUITADO]]);

        const res = await aprobar(tokenOficina, BODY_OFICINA);

        expect(res.status).toBe(409);
        expect(res.body.error).toMatch(/Ya existe un trabajador con este RUT \(Pérez Soto Juan, finiquitado\)/);
        expect(conn.query).toHaveBeenCalledTimes(2);
        expect(sqlCalls(conn.query).some(s => /INSERT INTO trabajadores/.test(s))).toBe(false);
        expect(conn.rollback).toHaveBeenCalledTimes(1);
        expect(conn.commit).not.toHaveBeenCalled();
        expect(conn.release).toHaveBeenCalledTimes(1);
        expect(logManualActivity).not.toHaveBeenCalled();
    });

    test('error en el INSERT de trabajadores → rollback, sin UPDATE de la solicitud ni log, y la conexión se libera', async () => {
        conn.query
            .mockResolvedValueOnce([[{ id: 41, estado: 'pendiente' }]])
            .mockResolvedValueOnce([[]])
            .mockResolvedValueOnce([[{ es_prueba: 0 }]])
            .mockRejectedValueOnce(new Error('Lock wait timeout exceeded'));

        const res = await aprobar(tokenOficina, BODY_OFICINA);

        expect(res.status).toBe(500);
        expect(conn.query).toHaveBeenCalledTimes(4);
        expect(sqlCalls(conn.query).some(s => /UPDATE solicitudes_ingreso/.test(s))).toBe(false);
        expect(conn.rollback).toHaveBeenCalledTimes(1);
        expect(conn.commit).not.toHaveBeenCalled();
        expect(conn.release).toHaveBeenCalledTimes(1);
        expect(logManualActivity).not.toHaveBeenCalled();
        expect(db.query).not.toHaveBeenCalled();   // tampoco relee la solicitud
    });

    test('ER_DUP_ENTRY en el INSERT (carrera contra UNIQUE rut) → 409 de dominio + rollback', async () => {
        conn.query
            .mockResolvedValueOnce([[{ id: 41, estado: 'pendiente' }]])
            .mockResolvedValueOnce([[]])
            .mockResolvedValueOnce([[{ es_prueba: 0 }]])
            .mockRejectedValueOnce(Object.assign(new Error("Duplicate entry '12.345.678-5' for key 'rut'"), { code: 'ER_DUP_ENTRY', errno: 1062 }));

        const res = await aprobar(tokenOficina, BODY_OFICINA);

        expect(res.status).toBe(409);
        expect(res.body.error).toMatch(/Ya existe un trabajador con este RUT/);
        expect(conn.rollback).toHaveBeenCalledTimes(1);
        expect(conn.release).toHaveBeenCalledTimes(1);
    });

    test('anti-drift: toda columna del INSERT trabajadores existe en allowedFields de trabajadores (index.js)', async () => {
        conn.query
            .mockResolvedValueOnce([[{ id: 41, estado: 'pendiente' }]])
            .mockResolvedValueOnce([[]])
            .mockResolvedValueOnce([[{ es_prueba: 0 }]])
            .mockResolvedValueOnce([{ insertId: 903 }])
            .mockResolvedValueOnce([{ affectedRows: 1 }])
            .mockResolvedValueOnce([{ affectedRows: 0 }]);
        db.query.mockResolvedValueOnce([[{ ...SOLICITUD_ROW, estado: 'aprobada', trabajador_id: 903 }]]);

        const res = await aprobar(tokenOficina, BODY_OFICINA);
        expect(res.status).toBe(200);

        const [insSql] = conn.query.mock.calls[3];
        const cols = insSql.match(/\(([^)]+)\) VALUES/)[1].split(',').map(s => s.trim());

        // allowedFields del CRUD de trabajadores en index.js = espejo del esquema real de la tabla.
        const fs = require('fs');
        const path = require('path');
        const src = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');
        const bloque = src.slice(src.indexOf("createCrudRoutes('trabajadores'"));
        const lista = bloque.match(/allowedFields:\s*\[([\s\S]*?)\]/)[1];
        const allowed = new Set([...lista.matchAll(/'([a-z_]+)'/g)].map(m => m[1]));
        // `activo` salió de allowedFields en B4 (plan Gestiones, mig 112): el estado del contrato solo
        // cambia por PUT /:id/desvincular y /:id/reactivar; el INSERT de aprobar lo fija en 1 a propósito.
        allowed.add('activo');
        expect(allowed.size).toBeGreaterThan(10);

        const fuera = cols.filter(c => !allowed.has(c));
        expect(fuera).toEqual([]);   // p. ej. 'observaciones' NO es columna de trabajadores
    });

    test('403 sin aprobar (crear solo no aprueba) — no abre transacción', async () => {
        const res = await aprobar(tokenTerreno, BODY_OFICINA);
        expect(res.status).toBe(403);
        expect(db.getConnection).not.toHaveBeenCalled();
    });
});

// ══════════════════════════════════════════════
// PUT /:id/rechazar
// ══════════════════════════════════════════════
describe('PUT /api/solicitudes-ingreso/:id/rechazar', () => {
    const rechazar = (token, body, id = 41) =>
        request(app).put(`${BASE}/${id}/rechazar`).set('Authorization', `Bearer ${token}`).send(body);

    test('400 sin motivo (validateBody) y 400 con motivo en blanco (service) — sin transacción', async () => {
        let res = await rechazar(tokenOficina, {});
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/motivo es requerido/);

        res = await rechazar(tokenOficina, { motivo: '   ' });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/El motivo de rechazo es obligatorio/);

        expect(db.getConnection).not.toHaveBeenCalled();
    });

    test('OK: FOR UPDATE → UPDATE rechazada con motivo/resuelto_por/fecha_resolucion → commit → devuelve la solicitud', async () => {
        conn.query
            .mockResolvedValueOnce([[{ id: 41, estado: 'pendiente' }]])
            .mockResolvedValueOnce([{ affectedRows: 1 }]);
        db.query.mockResolvedValueOnce([[{ ...SOLICITUD_ROW, estado: 'rechazada', motivo_rechazo: 'RUT mal digitado', resuelto_por: OFICINA_ID }]]);

        const res = await rechazar(tokenOficina, { motivo: '  RUT mal digitado  ' });

        expect(res.status).toBe(200);
        expect(res.body.data).toMatchObject({ id: 41, estado: 'rechazada', motivo_rechazo: 'RUT mal digitado' });

        expect(conn.query.mock.calls[0][0]).toMatch(/SELECT id, estado FROM solicitudes_ingreso WHERE id = \? FOR UPDATE/);
        expect(conn.query.mock.calls[0][1]).toEqual([41]);
        const [updSql, updVals] = conn.query.mock.calls[1];
        expect(updSql).toMatch(/UPDATE solicitudes_ingreso/);
        expect(updSql).toMatch(/estado = 'rechazada'/);
        expect(updSql).toMatch(/motivo_rechazo = \?/);
        expect(updSql).toMatch(/resuelto_por = \?/);
        expect(updSql).toMatch(/fecha_resolucion = NOW\(\)/);
        expect(updVals).toEqual(['RUT mal digitado', OFICINA_ID, 41]);   // motivo con trim

        expect(conn.beginTransaction).toHaveBeenCalledTimes(1);
        expect(conn.commit).toHaveBeenCalledTimes(1);
        expect(conn.rollback).not.toHaveBeenCalled();
        expect(conn.release).toHaveBeenCalledTimes(1);
    });

    test('409 si ya no está pendiente: rollback y sin UPDATE', async () => {
        conn.query.mockResolvedValueOnce([[{ id: 41, estado: 'aprobada' }]]);

        const res = await rechazar(tokenOficina, { motivo: 'tarde' });

        expect(res.status).toBe(409);
        expect(res.body.error).toMatch(/La solicitud ya fue aprobada/);
        expect(conn.query).toHaveBeenCalledTimes(1);
        expect(conn.rollback).toHaveBeenCalledTimes(1);
        expect(conn.commit).not.toHaveBeenCalled();
        expect(conn.release).toHaveBeenCalledTimes(1);
    });

    test('404 si no existe; 403 sin aprobar', async () => {
        conn.query.mockResolvedValueOnce([[]]);
        const nf = await rechazar(tokenOficina, { motivo: 'x' }, 777);
        expect(nf.status).toBe(404);
        expect(conn.rollback).toHaveBeenCalledTimes(1);

        db.getConnection.mockClear();
        const forb = await rechazar(tokenTerreno, { motivo: 'x' });
        expect(forb.status).toBe(403);
        expect(db.getConnection).not.toHaveBeenCalled();
    });
});

// ══════════════════════════════════════════════
// Gates 403 en cada ruta + /pendientes/count
// ══════════════════════════════════════════════
describe('Gates de permiso', () => {
    test.each([
        ['GET',  `${BASE}/check-rut/12.345.678-5`],
        ['GET',  `${BASE}/pendientes/count`],
        ['GET',  BASE],
        ['POST', BASE],
        ['GET',  `${BASE}/41`],
        ['PUT',  `${BASE}/41/aprobar`],
        ['PUT',  `${BASE}/41/rechazar`],
    ])('%s %s → 403 con trabajadores.ver/crear pero sin permisos de solicitud; BD intacta', async (method, url) => {
        const res = await request(app)[method.toLowerCase()](url)
            .set('Authorization', `Bearer ${tokenSinNada}`)
            .send({ ...FICHA, empresa_id: 4, motivo: 'x' });
        expect(res.status).toBe(403);
        expect(res.body.required).toEqual(expect.arrayContaining([expect.stringMatching(/^trabajadores\.solicitud\./)]));
        expect(db.query).not.toHaveBeenCalled();
        expect(db.getConnection).not.toHaveBeenCalled();
    });

    test('GET /pendientes/count: 403 con solo crear; con aprobar responde { total } numérico', async () => {
        const forb = await request(app)
            .get(`${BASE}/pendientes/count`)
            .set('Authorization', `Bearer ${tokenTerreno}`);
        expect(forb.status).toBe(403);
        expect(db.query).not.toHaveBeenCalled();

        db.query.mockResolvedValueOnce([[{ total: '3' }]]);   // COUNT puede venir como string (BIGINT)
        const ok = await request(app)
            .get(`${BASE}/pendientes/count`)
            .set('Authorization', `Bearer ${tokenOficina}`);
        expect(ok.status).toBe(200);
        expect(ok.body.data).toEqual({ total: 3 });
        const sql = db.query.mock.calls[0][0];
        expect(sql).toMatch(/SELECT COUNT\(\*\) AS total FROM solicitudes_ingreso s WHERE s\.estado = 'pendiente'/);
        expect(sql).toMatch(/es_prueba = 1/);   // excluye obras de prueba por defecto
    });

    test('GET /pendientes/count?incluir_prueba=true no excluye obras de prueba; sin filas → total 0', async () => {
        db.query.mockResolvedValueOnce([[]]);
        const res = await request(app)
            .get(`${BASE}/pendientes/count?incluir_prueba=true`)
            .set('Authorization', `Bearer ${tokenOficina}`);
        expect(res.status).toBe(200);
        expect(res.body.data).toEqual({ total: 0 });
        expect(db.query.mock.calls[0][0]).not.toMatch(/es_prueba/);
    });

    test('las rutas de 2 segmentos fijos no caen en /:id (check-rut y pendientes/count se resuelven por su gate propio)', async () => {
        // Si /pendientes/count cayera en /:id, el gate sería crear OR aprobar y
        // terreno pasaría al service (404 'Solicitud no encontrada'); acá debe ser 403.
        const res = await request(app)
            .get(`${BASE}/pendientes/count`)
            .set('Authorization', `Bearer ${tokenTerreno}`);
        expect(res.status).toBe(403);
        expect(res.body.required).toEqual([APROBAR]);
    });
});

// ══════════════════════════════════════════════
// Blindaje crud.service: ER_DUP_ENTRY en trabajadores
// ══════════════════════════════════════════════
describe('Blindaje crud.service — ER_DUP_ENTRY en trabajadores (UNIQUE rut)', () => {
    const DUP = () => Object.assign(new Error("Duplicate entry '12.345.678-5' for key 'rut'"), { code: 'ER_DUP_ENTRY', errno: 1062 });

    test('POST /api/trabajadores con RUT duplicado → 409 limpio y NINGÚN DELETE / SHOW COLUMNS / reintento', async () => {
        db.query.mockRejectedValueOnce(DUP());

        const res = await request(app)
            .post('/api/trabajadores')
            .set('Authorization', `Bearer ${tokenTrabCrear}`)
            .send({ rut: '12.345.678-5', nombres: 'Ana', apellido_paterno: 'Soto', empresa_id: 4 });

        expect(res.status).toBe(409);
        expect(res.body.error).toMatch(/ya existe/i);
        // Una sola query: el INSERT que falló. Antes seguían SHOW COLUMNS +
        // SELECT + `DELETE FROM trabajadores WHERE activo = 0` (borraba a TODOS
        // los finiquitados) + reintento del INSERT.
        expect(db.query).toHaveBeenCalledTimes(1);
        expect(db.query.mock.calls[0][0]).toMatch(/^INSERT INTO trabajadores/);
        const sqls = sqlCalls(db.query);
        expect(sqls.some(s => /DELETE/i.test(s))).toBe(false);
        expect(sqls.some(s => /SHOW COLUMNS/i.test(s))).toBe(false);
    });

    test('control: el reciclaje de catálogos por nombre sigue vivo (POST /api/cargos homónimo inactivo → DELETE acotado por nombre → 201)', async () => {
        db.query
            .mockRejectedValueOnce(DUP())                             // INSERT choca con UNIQUE(nombre)
            .mockResolvedValueOnce([[{ Field: 'activo' }]])           // SHOW COLUMNS
            .mockResolvedValueOnce([[{ id: 3 }]])                     // SELECT inactivo homónimo
            .mockResolvedValueOnce([{ affectedRows: 1 }])             // DELETE acotado
            .mockResolvedValueOnce([{ insertId: 9, affectedRows: 1 }]); // reintento INSERT

        const res = await request(app)
            .post('/api/cargos')
            .set('Authorization', `Bearer ${tokenTrabCrear}`)
            .send({ nombre: 'Jornal' });

        expect(res.status).toBe(201);
        expect(res.body.id).toBe(9);
        const [delSql, delParams] = db.query.mock.calls[3];
        expect(delSql).toMatch(/^DELETE FROM cargos WHERE activo = 0 AND nombre = \?$/);
        expect(delParams).toEqual(['Jornal']);
    });
});
