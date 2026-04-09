/**
 * Tests CRUD para Empresas, Obras, Cargos, Tipos de Documento,
 * Estados de Asistencia y Tipos de Ausencia.
 * 
 * Usa mocks de la BD para ejecutarse sin conexión real.
 */

jest.mock('../src/config/db', () => ({
    query: jest.fn().mockResolvedValue([[]]),
    getConnection: jest.fn().mockResolvedValue({
        beginTransaction: jest.fn(),
        query: jest.fn().mockResolvedValue([[]]),
        commit: jest.fn(),
        rollback: jest.fn(),
        release: jest.fn()
    })
}));

const request = require('supertest');
const app = require('../index');
const db = require('../src/config/db');
const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'secret';

// ── Helper: generar token con todos los permisos CRUD ──
const makeToken = (permisos) => {
    return jwt.sign({
        id: 1,
        email: 'admin@lols.cl',
        rol_id: 1,
        rv: 1,
        p: permisos
    }, SECRET);
};

const adminToken = makeToken([
    'empresas.ver', 'empresas.crear', 'empresas.editar', 'empresas.eliminar',
    'obras.ver', 'obras.crear', 'obras.editar', 'obras.eliminar',
    'cargos.ver', 'cargos.crear', 'cargos.editar', 'cargos.eliminar',
    'trabajadores.ver', 'trabajadores.crear', 'trabajadores.editar', 'trabajadores.eliminar',
    'sistema.tipos_doc.gestionar',
    'sistema.estados.gestionar',
    'sistema.tipos_ausencia.gestionar',
]);

const readOnlyToken = makeToken(['empresas.ver', 'obras.ver', 'cargos.ver']);

// ══════════════════════════════════════════════
// EMPRESAS
// ══════════════════════════════════════════════
describe('CRUD Empresas', () => {
    beforeEach(() => jest.clearAllMocks());

    test('GET /api/empresas → debería listar empresas', async () => {
        const mockRows = [
            { id: 1, rut: '76.123.456-7', razon_social: 'LOLS SpA', activo: 1 }
        ];
        db.query
            .mockResolvedValueOnce([mockRows])           // SELECT rows
            .mockResolvedValueOnce([[{ total: 1 }]]);    // COUNT

        const res = await request(app)
            .get('/api/empresas')
            .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        expect(res.body.data).toHaveLength(1);
        expect(res.body.data[0].razon_social).toBe('LOLS SpA');
        expect(res.body.pagination).toBeDefined();
    });

    test('POST /api/empresas → debería crear una empresa', async () => {
        db.query.mockResolvedValueOnce([{ insertId: 10, affectedRows: 1 }]);

        const res = await request(app)
            .post('/api/empresas')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ rut: '76.123.456-7', razon_social: 'Nueva Empresa' });

        expect(res.status).toBe(201);
        expect(res.body.razon_social).toBe('Nueva Empresa');
        expect(res.body.id).toBe(10);
    });

    test('PUT /api/empresas/1 → debería actualizar una empresa', async () => {
        db.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

        const res = await request(app)
            .put('/api/empresas/1')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ razon_social: 'Empresa Actualizada' });

        expect(res.status).toBe(200);
    });

    test('DELETE /api/empresas/1 → debería hacer soft-delete', async () => {
        db.query
            .mockResolvedValueOnce([[{ Field: 'activo' }]])  // SHOW COLUMNS
            .mockResolvedValueOnce([{ affectedRows: 1 }]);   // UPDATE SET activo = 0

        const res = await request(app)
            .delete('/api/empresas/1')
            .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
    });

    test('POST /api/empresas → 403 sin permiso', async () => {
        const res = await request(app)
            .post('/api/empresas')
            .set('Authorization', `Bearer ${readOnlyToken}`)
            .send({ rut: '76.123.456-7', razon_social: 'Prohibida' });

        expect(res.status).toBe(403);
    });

    test('POST /api/empresas → whitelist protege campos no permitidos', async () => {
        db.query.mockResolvedValueOnce([{ insertId: 11, affectedRows: 1 }]);

        await request(app)
            .post('/api/empresas')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ rut: '11.111.111-1', razon_social: 'Test', campo_inyectado: 'malicioso' });

        // El query que se ejecutó NO debería incluir 'campo_inyectado'
        const insertQuery = db.query.mock.calls[0][0];
        expect(insertQuery).not.toContain('campo_inyectado');
    });
});

// ══════════════════════════════════════════════
// OBRAS
// ══════════════════════════════════════════════
describe('CRUD Obras', () => {
    beforeEach(() => jest.clearAllMocks());

    test('GET /api/obras → debería listar obras', async () => {
        const mockRows = [
            { id: 1, nombre: 'Obra Las Condes', activa: 1, empresa_nombre: 'LOLS SpA' }
        ];
        db.query
            .mockResolvedValueOnce([mockRows])
            .mockResolvedValueOnce([[{ total: 1 }]]);

        const res = await request(app)
            .get('/api/obras')
            .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        expect(res.body.data[0].nombre).toBe('Obra Las Condes');
    });

    test('POST /api/obras → debería crear una obra', async () => {
        db.query.mockResolvedValueOnce([{ insertId: 5, affectedRows: 1 }]);

        const res = await request(app)
            .post('/api/obras')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ nombre: 'Obra Nueva', direccion: 'Av. Siempre Viva 742', empresa_id: 1 });

        expect(res.status).toBe(201);
        expect(res.body.nombre).toBe('Obra Nueva');
    });

    test('PUT /api/obras/1 → debería actualizar', async () => {
        db.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

        const res = await request(app)
            .put('/api/obras/1')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ nombre: 'Obra Renombrada' });

        expect(res.status).toBe(200);
    });

    test('DELETE /api/obras/1 → soft-delete con activa', async () => {
        db.query
            .mockResolvedValueOnce([[{ Field: 'activa' }]])
            .mockResolvedValueOnce([{ affectedRows: 1 }]);

        const res = await request(app)
            .delete('/api/obras/1')
            .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
    });
});

// ══════════════════════════════════════════════
// CARGOS
// ══════════════════════════════════════════════
describe('CRUD Cargos', () => {
    beforeEach(() => jest.clearAllMocks());

    test('GET /api/cargos → listar cargos', async () => {
        db.query
            .mockResolvedValueOnce([[{ id: 1, nombre: 'Jornalero', activo: 1 }]])
            .mockResolvedValueOnce([[{ total: 1 }]]);

        const res = await request(app)
            .get('/api/cargos')
            .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        expect(res.body.data[0].nombre).toBe('Jornalero');
    });

    test('POST /api/cargos → crear cargo', async () => {
        db.query.mockResolvedValueOnce([{ insertId: 3, affectedRows: 1 }]);

        const res = await request(app)
            .post('/api/cargos')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ nombre: 'Capataz' });

        expect(res.status).toBe(201);
        expect(res.body.nombre).toBe('Capataz');
    });

    test('DELETE /api/cargos/1 → soft-delete', async () => {
        db.query
            .mockResolvedValueOnce([[{ Field: 'activo' }]])
            .mockResolvedValueOnce([{ affectedRows: 1 }]);

        const res = await request(app)
            .delete('/api/cargos/1')
            .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
    });
});

// ══════════════════════════════════════════════
// TIPOS DE DOCUMENTO
// ══════════════════════════════════════════════
describe('CRUD Tipos de Documento', () => {
    beforeEach(() => jest.clearAllMocks());

    // Los permisos de tipos_doc se manejan con el módulo 'documentos'
    const tipoDocToken = makeToken(['sistema.tipos_doc.gestionar']);

    test('GET /api/documentos/tipos → listar tipos', async () => {
        db.query
            .mockResolvedValueOnce([[{ id: 1, nombre: 'Contrato', dias_vigencia: 365, obligatorio: 1 }]])
            .mockResolvedValueOnce([[{ total: 1 }]]);

        const res = await request(app)
            .get('/api/documentos/tipos')
            .set('Authorization', `Bearer ${tipoDocToken}`);

        expect(res.status).toBe(200);
        expect(res.body.data[0].nombre).toBe('Contrato');
    });

    test('POST /api/documentos/tipos → crear tipo de documento', async () => {
        db.query.mockResolvedValueOnce([{ insertId: 4, affectedRows: 1 }]);

        const res = await request(app)
            .post('/api/documentos/tipos')
            .set('Authorization', `Bearer ${tipoDocToken}`)
            .send({ nombre: 'Licencia Médica', dias_vigencia: 30, obligatorio: false });

        expect(res.status).toBe(201);
        expect(res.body.nombre).toBe('Licencia Médica');
    });
});

// ══════════════════════════════════════════════
// ESTADOS DE ASISTENCIA
// ══════════════════════════════════════════════
describe('CRUD Estados de Asistencia', () => {
    beforeEach(() => jest.clearAllMocks());

    const estadoToken = makeToken(['sistema.estados.gestionar']);

    test('GET /api/estados-asistencia → listar estados', async () => {
        db.query
            .mockResolvedValueOnce([[{ id: 1, nombre: 'Presente', codigo: 'P', color: '#00A651', es_presente: 1 }]])
            .mockResolvedValueOnce([[{ total: 1 }]]);

        const res = await request(app)
            .get('/api/estados-asistencia')
            .set('Authorization', `Bearer ${estadoToken}`);

        expect(res.status).toBe(200);
        expect(res.body.data[0].codigo).toBe('P');
    });

    test('POST /api/estados-asistencia → crear estado', async () => {
        db.query.mockResolvedValueOnce([{ insertId: 5, affectedRows: 1 }]);

        const res = await request(app)
            .post('/api/estados-asistencia')
            .set('Authorization', `Bearer ${estadoToken}`)
            .send({ nombre: 'Licencia', codigo: 'LIC', color: '#FF9500', es_presente: false });

        expect(res.status).toBe(201);
        expect(res.body.nombre).toBe('Licencia');
    });

    test('POST /api/estados-asistencia → whitelist protege campos', async () => {
        db.query.mockResolvedValueOnce([{ insertId: 6, affectedRows: 1 }]);

        await request(app)
            .post('/api/estados-asistencia')
            .set('Authorization', `Bearer ${estadoToken}`)
            .send({ nombre: 'Test', codigo: 'T', color: '#000', es_presente: true, sql_injection: 'DROP TABLE' });

        const insertQuery = db.query.mock.calls[0][0];
        expect(insertQuery).not.toContain('sql_injection');
    });
});

// ══════════════════════════════════════════════
// TIPOS DE AUSENCIA
// ══════════════════════════════════════════════
describe('CRUD Tipos de Ausencia', () => {
    beforeEach(() => jest.clearAllMocks());

    const ausenciaToken = makeToken(['sistema.tipos_ausencia.gestionar']);

    test('GET /api/tipos-ausencia → listar tipos', async () => {
        db.query
            .mockResolvedValueOnce([[{ id: 1, nombre: 'Vacaciones', es_justificada: 1, activo: 1 }]])
            .mockResolvedValueOnce([[{ total: 1 }]]);

        const res = await request(app)
            .get('/api/tipos-ausencia')
            .set('Authorization', `Bearer ${ausenciaToken}`);

        expect(res.status).toBe(200);
        expect(res.body.data[0].nombre).toBe('Vacaciones');
    });

    test('POST /api/tipos-ausencia → crear tipo', async () => {
        db.query.mockResolvedValueOnce([{ insertId: 3, affectedRows: 1 }]);

        const res = await request(app)
            .post('/api/tipos-ausencia')
            .set('Authorization', `Bearer ${ausenciaToken}`)
            .send({ nombre: 'Permiso Sin Goce', es_justificada: false });

        expect(res.status).toBe(201);
        expect(res.body.nombre).toBe('Permiso Sin Goce');
    });
});

// ══════════════════════════════════════════════
// TRABAJADORES
// ══════════════════════════════════════════════
describe('CRUD Trabajadores', () => {
    beforeEach(() => jest.clearAllMocks());

    test('GET /api/trabajadores → listar trabajadores', async () => {
        const mockRows = [
            { id: 1, rut: '17.611.988-8', nombres: 'Juan', apellido_paterno: 'Pérez', activo: 1, empresa_nombre: 'LOLS' }
        ];
        db.query
            .mockResolvedValueOnce([mockRows])
            .mockResolvedValueOnce([[{ total: 1 }]]);

        const res = await request(app)
            .get('/api/trabajadores')
            .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        expect(res.body.data[0].nombres).toBe('Juan');
    });

    test('POST /api/trabajadores → crear trabajador', async () => {
        db.query.mockResolvedValueOnce([{ insertId: 20, affectedRows: 1 }]);

        const res = await request(app)
            .post('/api/trabajadores')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                rut: '17.611.988-8',
                nombres: 'Carlos',
                apellido_paterno: 'López',
                apellido_materno: 'Soto',
                cargo_id: 1,
                obra_id: 1,
                empresa_id: 1
            });

        expect(res.status).toBe(201);
        expect(res.body.nombres).toBe('Carlos');
    });

    test('POST /api/trabajadores → whitelist rechaza password injection', async () => {
        db.query.mockResolvedValueOnce([{ insertId: 21, affectedRows: 1 }]);

        await request(app)
            .post('/api/trabajadores')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                rut: '11.111.111-1',
                nombres: 'Test',
                apellido_paterno: 'Test',
                password: 'hacked123',
                admin: true
            });

        const insertQuery = db.query.mock.calls[0][0];
        expect(insertQuery).not.toContain('password');
        expect(insertQuery).not.toContain('admin');
    });

    test('PUT /api/trabajadores/1 → actualizar', async () => {
        db.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

        const res = await request(app)
            .put('/api/trabajadores/1')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ nombres: 'Carlos Alberto', cargo_id: 2 });

        expect(res.status).toBe(200);
    });

    test('POST /api/trabajadores → 403 sin permiso de crear', async () => {
        const viewOnlyToken = makeToken(['trabajadores.ver']);

        const res = await request(app)
            .post('/api/trabajadores')
            .set('Authorization', `Bearer ${viewOnlyToken}`)
            .send({ rut: '11.111.111-1', nombres: 'No', apellido_paterno: 'Permitido' });

        expect(res.status).toBe(403);
    });
});

// ══════════════════════════════════════════════
// SEGURIDAD GENERAL
// ══════════════════════════════════════════════
describe('Seguridad General CRUD', () => {
    beforeEach(() => jest.clearAllMocks());

    test('Todas las rutas requieren autenticación (401 sin token)', async () => {
        const endpoints = [
            '/api/empresas',
            '/api/obras',
            '/api/cargos',
            '/api/trabajadores',
            '/api/estados-asistencia',
            '/api/tipos-ausencia',
        ];

        for (const endpoint of endpoints) {
            const res = await request(app).get(endpoint);
            expect(res.status).toBe(401);
        }
    });

    test('Token inválido → 401', async () => {
        const res = await request(app)
            .get('/api/empresas')
            .set('Authorization', 'Bearer token_invalido_123');

        expect(res.status).toBe(401);
    });
});
