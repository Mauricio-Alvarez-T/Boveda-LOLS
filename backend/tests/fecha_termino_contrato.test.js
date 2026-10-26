/**
 * Fecha de término del contrato (Marcos 2026-10-26, mig 138).
 *   · La migración 138 se revisa leyendo el .sql: una columna nueva, opcional e idempotente; nada se rellena.
 *   · CRUD de trabajadores: el campo está en allowedFields; '' → NULL (vacía = indefinido); fecha inválida o anterior
 *     al ingreso → 400; si la mig 138 aún no corrió, el campo se descarta y el resto se guarda (degradación D-I).
 *   · Es una fecha de contrato operativa: pasa la allow-list sin `trabajadores.ver`, como fecha_ingreso.
 *   · Inicio de gerencia, 7.º tema «Contratos por vencer»: solo con `trabajadores.ver`, UNA consulta, activos sin
 *     prueba ni obras de prueba/finalizadas, vencidos o que vencen en 30 días, del más vencido al más holgado.
 */
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const jwt = require('jsonwebtoken');

jest.mock('../src/config/db', () => ({
    query: jest.fn().mockResolvedValue([[]]),
    getConnection: jest.fn().mockResolvedValue({
        beginTransaction: jest.fn(), query: jest.fn().mockResolvedValue([[]]),
        commit: jest.fn(), rollback: jest.fn(), release: jest.fn(),
    }),
}));

const pool = require('../src/config/db');
const app = require('../index');
const service = require('../src/services/inicioGerencia.service');
const { resetSchemaCache } = require('../src/utils/schema');
const { sanitizeTrabajadorPersonal, CAMPOS_TRABAJADOR_OPERATIVOS } = require('../src/utils/sanitizeFinancialFields');

const SECRET = process.env.JWT_SECRET || 'secret';
const token = (p) => jwt.sign({ id: 1, email: 'rrhh@lols.cl', rol_id: 2, rv: 1, p }, SECRET);
const EDITA = token(['trabajadores.ver', 'trabajadores.crear', 'trabajadores.editar']);
const sqls = () => pool.query.mock.calls.map(([sql]) => String(sql));

/** La BD con la columna de la mig 138 (o sin ella) y el INSERT/UPDATE respondiendo bien. */
function bd({ conColumna = true } = {}) {
    pool.query.mockImplementation(async (sql) => {
        const s = String(sql);
        if (s.includes('INFORMATION_SCHEMA.COLUMNS')) {
            const cols = ['id', 'rut', 'nombres', 'fecha_ingreso', ...(conColumna ? ['fecha_termino_contrato'] : [])];
            return [cols.map(c => ({ COLUMN_NAME: c }))];
        }
        if (/^\s*INSERT INTO trabajadores/i.test(s)) return [{ insertId: 30, affectedRows: 1 }];
        if (/^\s*UPDATE trabajadores/i.test(s)) return [{ affectedRows: 1 }];
        return [[]];
    });
}
/** [sql, params] del INSERT o UPDATE de trabajadores. */
const ESCRITURA = { INSERT: /^\s*INSERT INTO trabajadores/i, UPDATE: /^\s*UPDATE trabajadores/i };
const escritura = (verbo) => pool.query.mock.calls.find(([sql]) => ESCRITURA[verbo].test(String(sql)));

beforeEach(() => resetSchemaCache());
afterEach(() => {
    jest.restoreAllMocks();
    pool.query.mockReset();
    pool.query.mockResolvedValue([[]]);
});

describe('migración 138_fecha_termino_contrato.sql', () => {
    const SQL = fs.readFileSync(path.resolve(__dirname, '../db/migrations/138_fecha_termino_contrato.sql'), 'utf8');
    const sentencias = SQL.split(/\r?\n/).filter(l => !l.trim().startsWith('--')).join('\n');
    const lista = sentencias.split(';').map(s => s.trim()).filter(Boolean);

    test('una sola sentencia: la columna nueva, DATE NULL, idempotente', () => {
        expect(lista).toHaveLength(1);
        expect(lista[0]).toMatch(/^ALTER TABLE trabajadores\s+ADD COLUMN IF NOT EXISTS fecha_termino_contrato DATE NULL\b/);
    });

    test('no toca datos ni otras columnas: sin UPDATE, DELETE, DROP, MODIFY ni tipo_contrato', () => {
        expect(sentencias).not.toMatch(/\b(UPDATE|DELETE|DROP|TRUNCATE|RENAME|MODIFY|CHANGE)\b/i);
        expect(sentencias).not.toMatch(/tipo_contrato/);
    });

    test('comentado en español (por qué existe y qué significa vacía)', () => {
        expect(SQL).toMatch(/-- .*Migración 138/);
        expect(SQL).toMatch(/Vacía\s+= contrato indefinido/);
    });
});

describe('CRUD de trabajadores: fecha_termino_contrato', () => {
    test('POST con la fecha → va en el INSERT tal cual', async () => {
        bd();
        const r = await request(app).post('/api/trabajadores').set('Authorization', `Bearer ${EDITA}`)
            .send({ rut: '17.611.988-8', nombres: 'Carlos', apellido_paterno: 'López', fecha_ingreso: '2026-10-01', fecha_termino_contrato: '2026-12-31' });
        expect(r.status).toBe(201);
        const [sql, params] = escritura('INSERT');
        const cols = sql.match(/\(([^)]+)\) VALUES/)[1].split(',').map(c => c.trim());
        expect(params[cols.indexOf('fecha_termino_contrato')]).toBe('2026-12-31');
    });

    test('PUT con la fecha → la escribe; con "" → NULL (vacía = indefinido)', async () => {
        bd();
        let r = await request(app).put('/api/trabajadores/5').set('Authorization', `Bearer ${EDITA}`)
            .send({ fecha_termino_contrato: '2027-01-15' });
        expect(r.status).toBe(200);
        let [sql, params] = escritura('UPDATE');
        expect(sql).toMatch(/fecha_termino_contrato = \?/);
        expect(params[0]).toBe('2027-01-15');

        pool.query.mockClear();
        r = await request(app).put('/api/trabajadores/5').set('Authorization', `Bearer ${EDITA}`)
            .send({ nombres: 'Carlos', fecha_termino_contrato: '' });
        expect(r.status).toBe(200);
        [sql, params] = escritura('UPDATE');
        const cols = sql.match(/SET (.+) WHERE/)[1].split(',').map(c => c.trim().replace(/ = \?$/, ''));
        expect(params[cols.indexOf('fecha_termino_contrato')]).toBeNull();
    });

    test('fecha que no existe o con otro formato → 400 y no escribe', async () => {
        bd();
        for (const mala of ['2026-02-30', '31-12-2026', '2026-12-31T00:00:00.000Z', 'mañana', 20261231]) {
            const r = await request(app).put('/api/trabajadores/5').set('Authorization', `Bearer ${EDITA}`)
                .send({ fecha_termino_contrato: mala });
            expect(r.status).toBe(400);
            expect(r.body.error).toMatch(/fecha de término del contrato no es válida/);
        }
        expect(escritura('UPDATE')).toBeUndefined();
    });

    test('antes del ingreso (si vienen las dos) → 400; el mismo día o después, bien', async () => {
        bd();
        const antes = await request(app).put('/api/trabajadores/5').set('Authorization', `Bearer ${EDITA}`)
            .send({ fecha_ingreso: '2026-10-10', fecha_termino_contrato: '2026-10-09' });
        expect(antes.status).toBe(400);
        expect(antes.body.error).toMatch(/no puede ser anterior a la fecha de ingreso/);
        const mismo = await request(app).put('/api/trabajadores/5').set('Authorization', `Bearer ${EDITA}`)
            .send({ fecha_ingreso: '2026-10-10', fecha_termino_contrato: '2026-10-10' });
        expect(mismo.status).toBe(200);
    });

    test('sin la mig 138 (columna ausente): se descarta el campo y el resto se guarda', async () => {
        bd({ conColumna: false });
        const r = await request(app).put('/api/trabajadores/5').set('Authorization', `Bearer ${EDITA}`)
            .send({ nombres: 'Carlos', fecha_termino_contrato: '2026-12-31' });
        expect(r.status).toBe(200);
        const [sql] = escritura('UPDATE');
        expect(sql).toMatch(/nombres = \?/);
        expect(sql).not.toMatch(/fecha_termino_contrato/);
    });

    test('sin el campo en el body no se consulta el esquema (los otros guardados no pagan nada)', async () => {
        bd();
        await request(app).put('/api/trabajadores/5').set('Authorization', `Bearer ${EDITA}`).send({ nombres: 'Carlos' });
        expect(sqls().some(s => s.includes('INFORMATION_SCHEMA'))).toBe(false);
    });

    test('editar exige trabajadores.editar (como el resto de la ficha)', async () => {
        bd();
        const r = await request(app).put('/api/trabajadores/5').set('Authorization', `Bearer ${token(['trabajadores.ver'])}`)
            .send({ fecha_termino_contrato: '2026-12-31' });
        expect(r.status).toBe(403);
    });

    test('es operativa: pasa la allow-list sin trabajadores.ver, como la fecha de ingreso', () => {
        expect(CAMPOS_TRABAJADOR_OPERATIVOS).toContain('fecha_termino_contrato');
        const out = sanitizeTrabajadorPersonal({ id: 1, fecha_ingreso: '2026-10-01', fecha_termino_contrato: '2026-12-31', direccion: 'X' }, []);
        expect(out).toEqual({ id: 1, fecha_ingreso: '2026-10-01', fecha_termino_contrato: '2026-12-31' });
    });
});

describe('Inicio de gerencia: «Contratos por vencer»', () => {
    const FILAS = [
        { id: 3, rut: '14.120.877-5', nombres: 'Iván', apellido_paterno: 'Saavedra', apellido_materno: 'Lagos', obra: 'Gorbea 3082', cargo: 'Maestro', ingreso: '2026-09-01', fecha: '2026-10-20', dias: -6 },
        { id: 4, rut: '13.664.209-1', nombres: 'Raúl', apellido_paterno: 'Espinoza', apellido_materno: null, obra: 'Domeyko', cargo: null, ingreso: null, fecha: '2026-10-26', dias: '0' },
        { id: 5, rut: '16.902.418-0', nombres: 'Marcelo', apellido_paterno: 'Aguilera', apellido_materno: 'Paz', obra: null, cargo: 'Jornal', ingreso: '2026-10-12', fecha: '2026-11-10', dias: 15 },
    ];
    const bdContratos = (filas = FILAS) => pool.query.mockImplementation(async (sql) => (String(sql).includes('fecha_termino_contrato') ? [filas] : [[]]));

    test('sin trabajadores.ver: null y no se consulta', async () => {
        bdContratos();
        const r = await service.getGerencia(['inicio.gerencia', 'documentos.ver']);
        expect(r.contratos).toBeNull();
        expect(sqls().some(s => s.includes('fecha_termino_contrato'))).toBe(false);
    });

    test('con trabajadores.ver: vencidos y por vencer (hoy cuenta como por vencer), nombre completo, obra y cargo', async () => {
        bdContratos();
        const r = await service.getGerencia(['inicio.gerencia', 'trabajadores.ver']);
        expect(r.contratos).toMatchObject({ dias: 30, vencidos: 1, por_vencer: 2 });
        expect(r.contratos.lista[0]).toEqual({
            trabajador_id: 3, rut: '14.120.877-5', nombre: 'Iván Saavedra Lagos', obra: 'Gorbea 3082', cargo: 'Maestro',
            ingreso: '2026-09-01', fecha: '2026-10-20', dias: -6,
        });
        expect(r.contratos.lista[1]).toMatchObject({ nombre: 'Raúl Espinoza', cargo: null, ingreso: null, dias: 0 });
        expect(r.contratos.lista[2]).toMatchObject({ obra: null, dias: 15 });
    });

    test('UNA consulta con las reglas del tablero: activos, sin prueba, sin obras de prueba/finalizadas, ≤ 30 días', async () => {
        bdContratos();
        await service.getGerencia(['inicio.gerencia', 'trabajadores.ver']);
        expect(pool.query).toHaveBeenCalledTimes(1);
        const [sql, params] = pool.query.mock.calls[0];
        expect(sql).toMatch(/t\.activo = 1 AND t\.es_prueba = 0/);
        expect(sql).toMatch(/o\.es_prueba = 0 AND o\.finalizada = 0/);
        expect(sql).toMatch(/t\.fecha_termino_contrato IS NOT NULL/);
        expect(sql).toMatch(/t\.fecha_termino_contrato <= DATE_ADD\(CURDATE\(\), INTERVAL \? DAY\)/);
        expect(sql).toMatch(/ORDER BY t\.fecha_termino_contrato ASC/);
        expect(params).toEqual([30]);
    });

    test('lista con tope; los totales son reales', async () => {
        const muchas = Array.from({ length: service._internal.TOPE + 7 }, (_, i) => ({
            id: i + 1, rut: null, nombres: `T${i}`, apellido_paterno: 'X', apellido_materno: null, obra: null, cargo: null, ingreso: null,
            fecha: '2026-11-01', dias: i < 10 ? -1 : 3,
        }));
        bdContratos(muchas);
        const r = await service.getGerencia(['inicio.gerencia', 'trabajadores.ver']);
        expect(r.contratos.lista).toHaveLength(service._internal.TOPE);
        expect(r.contratos.vencidos).toBe(10);
        expect(r.contratos.por_vencer).toBe(service._internal.TOPE - 3);
    });

    test('si la consulta falla (p. ej. mig 138 pendiente): null y los otros temas siguen', async () => {
        pool.query.mockImplementation(async (sql) => {
            if (String(sql).includes('fecha_termino_contrato')) throw Object.assign(new Error("Unknown column 't.fecha_termino_contrato'"), { errno: 1054 });
            if (String(sql).includes('SUM(d.fecha_vencimiento < CURDATE())')) return [[{ vencidos: 0, por_vencer: 0 }]];
            return [[]];
        });
        const r = await service.getGerencia(['inicio.gerencia', 'trabajadores.ver', 'documentos.ver']);
        expect(r.contratos).toBeNull();
        expect(r.documentos).toMatchObject({ vencidos: 0, por_vencer: 0 });
    });

    test('GET /api/dashboard/gerencia: el bloque llega en la respuesta (y null sin el permiso)', async () => {
        bdContratos();
        const gerente = (p) => jwt.sign({ id: 9, email: 'luislazcano@lols.cl', rol_id: 5, rv: 1, p }, SECRET);
        let r = await request(app).get('/api/dashboard/gerencia').set('Authorization', `Bearer ${gerente(['inicio.gerencia', 'trabajadores.ver'])}`);
        expect(r.status).toBe(200);
        expect(r.body.data.contratos).toMatchObject({ vencidos: 1, por_vencer: 2 });
        r = await request(app).get('/api/dashboard/gerencia').set('Authorization', `Bearer ${gerente(['inicio.gerencia'])}`);
        expect(r.body.data.contratos).toBeNull();
    });
});
