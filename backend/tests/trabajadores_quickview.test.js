/**
 * GET /api/trabajadores/:id/quick-view — saneamiento B1 (plan Gestiones, 2026-09-11).
 *
 * Antes: solo `auth` (cualquier usuario logueado) y `SELECT t.*` → desde las migs 108/109
 * la respuesta incluía dirección, AFP, salud, banco y número de cuenta del trabajador.
 * Ahora: gate `trabajadores.ver` OR `asistencia.ver` (la ficha rápida se abre también
 * desde Asistencia) y los datos personales/bancarios solo viajan con `trabajadores.ver`
 * (allow-list `CAMPOS_TRABAJADOR_OPERATIVOS`, deny-by-default: una columna nueva no se
 * filtra sola).
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
const jwt = require('jsonwebtoken');
const { sanitizeTrabajadorPersonal, CAMPOS_TRABAJADOR_OPERATIVOS } = require('../src/utils/sanitizeFinancialFields');

const SECRET = process.env.JWT_SECRET || 'secret';
const makeToken = (permisos) => jwt.sign({ id: 1, email: 'u@lols.cl', rol_id: 2, rv: 1, p: permisos }, SECRET);

const WORKER = {
    id: 5, rut: '12.345.678-9', nombres: 'Ana', apellido_paterno: 'Pérez', apellido_materno: null,
    empresa_id: 1, obra_id: 2, cargo_id: 3, empresa_nombre: 'LOLS', obra_nombre: 'Obra X', cargo_nombre: 'Jornal',
    email: 'ana@x.cl', telefono: '+56911111111', fecha_ingreso: '2026-01-01', fecha_desvinculacion: null,
    categoria_reporte: 'obra', activo: 1, es_prueba: 0,
    // personales / bancarios (migs 108/109)
    fecha_nacimiento: '1990-05-05', estado_civil: 'Soltero/a', direccion: 'Calle 1 #23', comuna: 'Cerrillos',
    afp: 'Modelo', salud: 'FONASA', nacionalidad: 'Chilena', cargas_familiares: 1,
    talla_calzado: 42, talla_pantalon: 44, talla_polera: 'L',
    cuenta_rut: 1, banco: 'BancoEstado', tipo_cuenta: 'vista', numero_cuenta: '12345678',
    // columna futura (B4) — debe filtrarse sin tocar la allow-list
    causal_desvinculacion: 'INASISTENCIA',
};

const mockQuickView = () => {
    db.query
        .mockResolvedValueOnce([[{ ...WORKER }]])   // worker
        .mockResolvedValueOnce([[{ total: 3 }]])    // tipos obligatorios
        .mockResolvedValueOnce([[{ completed: 1 }]]) // completados
        .mockResolvedValueOnce([[]]);               // asistencia reciente
};

const SENSIBLES = ['direccion', 'comuna', 'afp', 'salud', 'banco', 'tipo_cuenta', 'numero_cuenta', 'cuenta_rut',
    'telefono', 'email', 'fecha_nacimiento', 'estado_civil', 'nacionalidad', 'cargas_familiares', 'causal_desvinculacion'];

beforeEach(() => db.query.mockReset().mockResolvedValue([[]]));

describe('GET /api/trabajadores/:id/quick-view', () => {
    test('con solo asistencia.ver → 200 con datos operativos y SIN personales/bancarios', async () => {
        mockQuickView();
        const res = await request(app).get('/api/trabajadores/5/quick-view').set('Authorization', `Bearer ${makeToken(['asistencia.ver'])}`);
        expect(res.status).toBe(200);
        const w = res.body.worker;
        expect(w.rut).toBe('12.345.678-9');
        expect(w.nombres).toBe('Ana');
        expect(w.cargo_nombre).toBe('Jornal');
        expect(w.talla_calzado).toBe(42); // tallas = operativo (EPP)
        SENSIBLES.forEach(k => expect(w).not.toHaveProperty(k));
        expect(res.body.docs).toEqual({ total: 3, completed: 1 });
    });

    test('con trabajadores.ver → 200 con la ficha completa', async () => {
        mockQuickView();
        const res = await request(app).get('/api/trabajadores/5/quick-view').set('Authorization', `Bearer ${makeToken(['trabajadores.ver'])}`);
        expect(res.status).toBe(200);
        expect(res.body.worker.direccion).toBe('Calle 1 #23');
        expect(res.body.worker.numero_cuenta).toBe('12345678');
    });

    test('sin trabajadores.ver ni asistencia.ver → 403 y no toca la BD', async () => {
        const res = await request(app).get('/api/trabajadores/5/quick-view').set('Authorization', `Bearer ${makeToken(['inventario.ver'])}`);
        expect(res.status).toBe(403);
        expect(db.query).not.toHaveBeenCalled();
    });

    test('trabajador inexistente → 404', async () => {
        db.query.mockResolvedValueOnce([[]]);
        const res = await request(app).get('/api/trabajadores/999/quick-view').set('Authorization', `Bearer ${makeToken(['trabajadores.ver'])}`);
        expect(res.status).toBe(404);
    });
});

describe('sanitizeTrabajadorPersonal (allow-list)', () => {
    test('sin trabajadores.ver devuelve SOLO las columnas operativas conocidas', () => {
        const out = sanitizeTrabajadorPersonal(WORKER, ['asistencia.ver']);
        Object.keys(out).forEach(k => expect(CAMPOS_TRABAJADOR_OPERATIVOS).toContain(k));
        expect(out).not.toHaveProperty('causal_desvinculacion');
    });
    test('con trabajadores.ver devuelve el objeto intacto', () => {
        expect(sanitizeTrabajadorPersonal(WORKER, ['trabajadores.ver'])).toBe(WORKER);
    });
    test('null/undefined pasan sin romper', () => {
        expect(sanitizeTrabajadorPersonal(null, [])).toBeNull();
        expect(sanitizeTrabajadorPersonal(undefined, [])).toBeUndefined();
    });
});
