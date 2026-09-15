/**
 * GET /api/fiscalizacion/trabajadores-avanzado — saneamiento (2026-09-15).
 *
 * Antes: gate `documentos.ver` (más amplio que `trabajadores.ver`) + `SELECT t.*` devuelto crudo
 * con `res.json({ data: result })` → domicilio, AFP, salud, banco, número de cuenta, fecha de
 * nacimiento y causal de baja viajaban al navegador de cualquiera que pudiera ver documentos.
 * Es el mismo agujero que B1 tapó en el quick-view, en el otro endpoint que hace `SELECT t.*`.
 *
 * Ahora: misma allow-list (`CAMPOS_TRABAJADOR_OPERATIVOS`, deny-by-default) y los agregados de
 * documentación se re-adjuntan porque no son datos personales y la grilla los necesita.
 */

jest.mock('../src/config/db', () => ({
    query: jest.fn(),
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

const SECRET = process.env.JWT_SECRET || 'secret';
const token = (p) => jwt.sign({ id: 1, email: 'u@lols.cl', rol_id: 2, rv: 1, p }, SECRET);

/** Fila tal como la devuelve `SELECT t.*` + los agregados del service. */
const FILA = {
    id: 5, rut: '12.345.678-9', nombres: 'Ana', apellido_paterno: 'Pérez', apellido_materno: 'Soto',
    empresa_id: 1, obra_id: 2, cargo_id: 3,
    empresa_nombre: 'LOLS', obra_nombre: 'Obra X', cargo_nombre: 'Jornal',
    fecha_ingreso: '2026-01-01', fecha_desvinculacion: null, categoria_reporte: 'obra',
    activo: 1, es_prueba: 0,
    talla_calzado: 42, talla_pantalon: 44, talla_polera: 'L',
    // ── lo que NO debe salir sin trabajadores.ver ──
    email: 'ana@x.cl', telefono: '+56911111111',
    fecha_nacimiento: '1990-05-05', estado_civil: 'Soltero/a',
    direccion: 'Calle 1 #23', comuna: 'Cerrillos', nacionalidad: 'Chilena', cargas_familiares: 1,
    afp: 'Modelo', salud: 'FONASA',
    cuenta_rut: 1, banco: 'BancoEstado', tipo_cuenta: 'vista', numero_cuenta: '12345678',
    causal_desvinculacion: 'INASISTENCIA', no_recontratar: 1,
    // agregados que calcula el service
    docs_subidos: 3, docs_totales: 6,
};

/** El service hace dos queries: el COUNT de tipos obligatorios y la principal. */
const mockBusqueda = () => {
    db.query.mockReset();
    db.query
        .mockResolvedValueOnce([[{ total: 6 }]])
        .mockResolvedValueOnce([[FILA]]);
};

const SENSIBLES = [
    'direccion', 'comuna', 'afp', 'salud', 'banco', 'numero_cuenta', 'tipo_cuenta', 'cuenta_rut',
    'fecha_nacimiento', 'estado_civil', 'nacionalidad', 'cargas_familiares',
    'email', 'telefono', 'causal_desvinculacion', 'no_recontratar',
];

describe('GET /fiscalizacion/trabajadores-avanzado — datos personales', () => {
    test('con solo documentos.ver NO viaja ningún dato personal ni bancario', async () => {
        mockBusqueda();
        const res = await request(app)
            .get('/api/fiscalizacion/trabajadores-avanzado')
            .set('Authorization', `Bearer ${token(['documentos.ver'])}`);

        expect(res.status).toBe(200);
        expect(res.body.data).toHaveLength(1);
        const fila = res.body.data[0];
        for (const campo of SENSIBLES) {
            expect(fila).not.toHaveProperty(campo);
        }
    });

    test('lo operativo sí viaja: la grilla sigue mostrando nombre, obra, estado y tallas', async () => {
        mockBusqueda();
        const res = await request(app)
            .get('/api/fiscalizacion/trabajadores-avanzado')
            .set('Authorization', `Bearer ${token(['documentos.ver'])}`);

        const fila = res.body.data[0];
        expect(fila.id).toBe(5);
        expect(fila.rut).toBe('12.345.678-9');
        expect(fila.apellido_paterno).toBe('Pérez');
        expect(fila.obra_nombre).toBe('Obra X');
        expect(fila.empresa_nombre).toBe('LOLS');
        expect(fila.cargo_nombre).toBe('Jornal');
        expect(fila.activo).toBe(1);
        expect(fila.es_prueba).toBe(0);
        expect(fila.talla_calzado).toBe(42);   // las tallas son operativas (compra de EPP)
    });

    test('la barra de completitud sobrevive al saneamiento', async () => {
        mockBusqueda();
        const res = await request(app)
            .get('/api/fiscalizacion/trabajadores-avanzado')
            .set('Authorization', `Bearer ${token(['documentos.ver'])}`);

        const fila = res.body.data[0];
        expect(fila.docs_subidos).toBe(3);
        expect(fila.docs_totales).toBe(6);
        expect(fila.docs_porcentaje).toBe(50);
    });

    test('con trabajadores.ver la respuesta va completa', async () => {
        mockBusqueda();
        const res = await request(app)
            .get('/api/fiscalizacion/trabajadores-avanzado')
            .set('Authorization', `Bearer ${token(['documentos.ver', 'trabajadores.ver'])}`);

        const fila = res.body.data[0];
        expect(fila.numero_cuenta).toBe('12345678');
        expect(fila.direccion).toBe('Calle 1 #23');
        expect(fila.salud).toBe('FONASA');
        expect(fila.no_recontratar).toBe(1);
        expect(fila.docs_porcentaje).toBe(50);
    });

    test('sin documentos.ver el endpoint responde 403 y no toca la base', async () => {
        db.query.mockReset();
        const res = await request(app)
            .get('/api/fiscalizacion/trabajadores-avanzado')
            .set('Authorization', `Bearer ${token(['asistencia.ver'])}`);

        expect(res.status).toBe(403);
        expect(db.query).not.toHaveBeenCalled();
    });
});
