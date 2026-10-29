/**
 * PUT /usuarios/:id debe invalidar la sesión de la persona cuando cambia su rol_id o su bodega_id (ambos viajan en el
 * JWT). Desde la mig 146 se cierra SOLO la sesión de esa persona (versionService.cerrarSesionDe), ya no se sube la
 * versión del rol (eso sacaba a todas las personas del rol). Respaldo si cerrarSesionDe falla (mig 146 sin correr):
 * subir la versión del rol VIEJO — el JWT de la persona lleva el rol_id viejo, así que bumpear el viejo fuerza el logout.
 */

jest.mock('../src/config/db', () => ({
    query: jest.fn(),
    getConnection: jest.fn(),
}));

jest.mock('../src/services/version.service', () => ({
    increment: jest.fn().mockResolvedValue(2),
    get: jest.fn().mockReturnValue(1),
    init: jest.fn().mockResolvedValue(undefined),
    cerrarSesionDe: jest.fn().mockResolvedValue(1730000000),
    sesionCerradaPara: jest.fn().mockReturnValue(false),
}));

// Mock CRUD service factory para controlar usuariosService.update
const mockUpdate = jest.fn();
jest.mock('../src/services/crud.service', () => {
    return jest.fn().mockImplementation(() => ({
        update: mockUpdate,
        getAll: jest.fn().mockResolvedValue([]),
        getById: jest.fn().mockResolvedValue({}),
        softDelete: jest.fn().mockResolvedValue(undefined),
    }));
});

// Stub middleware auth + checkPermission para evitar JWT real
jest.mock('../src/middleware/auth', () => (req, res, next) => {
    req.user = { id: 1, rol_id: 1, p: ['usuarios.editar'] };
    next();
});
jest.mock('../src/middleware/rbac', () => ({
    checkPermission: () => (req, res, next) => next(),
}));

// Stub bcrypt para evitar costos reales de hashing
jest.mock('bcryptjs', () => ({ hash: jest.fn().mockResolvedValue('hashed') }));

// Stub createCrudRoutes — el factory que usa el roles sub-router (no nos interesa testearlo acá)
jest.mock('../src/routes/crud.routes', () => () => require('express').Router());

const express = require('express');
const request = require('supertest');
const db = require('../src/config/db');
const versionService = require('../src/services/version.service');

let app;

beforeAll(() => {
    // Cargar el router DESPUÉS de aplicar mocks
    const router = require('../src/routes/usuarios.routes');
    app = express();
    app.use(express.json());
    app.use('/usuarios', router);
    // Error handler genérico para que supertest reciba status codes correctos
    // eslint-disable-next-line no-unused-vars
    app.use((err, req, res, next) => res.status(err.statusCode || 500).json({ error: err.message }));
});

beforeEach(() => {
    jest.clearAllMocks();
});

const errorColumna = () => Object.assign(new Error('Unknown column permisos_cambiados_en'), { errno: 1054 });

describe('PUT /usuarios/:id — cierre de sesión por cambio de rol', () => {
    test('cambio de rol_id → cierra la sesión SOLO de esa persona (no sube la versión de ningún rol)', async () => {
        // SELECT inicial devuelve rol_id viejo = 3
        db.query.mockResolvedValueOnce([[{ rol_id: 3 }]]);
        mockUpdate.mockResolvedValueOnce({ id: 42, nombre: 'Test', rol_id: 5 });

        const res = await request(app)
            .put('/usuarios/42')
            .send({ nombre: 'Test', rol_id: 5 });

        expect(res.status).toBe(200);
        expect(versionService.cerrarSesionDe).toHaveBeenCalledTimes(1);
        expect(versionService.cerrarSesionDe).toHaveBeenCalledWith('42');
        expect(versionService.increment).not.toHaveBeenCalled();
    });

    test('respaldo: si cerrarSesionDe falla (mig 146 sin correr) → sube la versión del rol VIEJO', async () => {
        db.query.mockResolvedValueOnce([[{ rol_id: 3 }]]);
        mockUpdate.mockResolvedValueOnce({ id: 42, nombre: 'Test', rol_id: 5 });
        versionService.cerrarSesionDe.mockRejectedValueOnce(errorColumna());

        const res = await request(app)
            .put('/usuarios/42')
            .send({ nombre: 'Test', rol_id: 5 });

        expect(res.status).toBe(200);
        expect(versionService.increment).toHaveBeenCalledTimes(1);
        expect(versionService.increment).toHaveBeenCalledWith(3);
        // El rol viejo ya se conocía: no hace falta otra consulta
        expect(db.query).toHaveBeenCalledTimes(1);
    });

    test('mismo rol_id (no cambio) → no cierra nada', async () => {
        db.query.mockResolvedValueOnce([[{ rol_id: 3 }]]);
        mockUpdate.mockResolvedValueOnce({ id: 42, nombre: 'Test', rol_id: 3 });

        const res = await request(app)
            .put('/usuarios/42')
            .send({ nombre: 'Test', rol_id: 3 });

        expect(res.status).toBe(200);
        expect(versionService.cerrarSesionDe).not.toHaveBeenCalled();
        expect(versionService.increment).not.toHaveBeenCalled();
    });

    test('PUT sin rol_id en body (solo actualiza nombre) → NO consulta DB ni cierra nada', async () => {
        mockUpdate.mockResolvedValueOnce({ id: 42, nombre: 'Nuevo Nombre' });

        const res = await request(app)
            .put('/usuarios/42')
            .send({ nombre: 'Nuevo Nombre' });

        expect(res.status).toBe(200);
        expect(db.query).not.toHaveBeenCalled();
        expect(versionService.cerrarSesionDe).not.toHaveBeenCalled();
        expect(versionService.increment).not.toHaveBeenCalled();
    });

    test('rol_id como string vs number (form HTML) → no coerce bug', async () => {
        // DB devuelve rol_id 3 (numérico), body envía "3" (string)
        db.query.mockResolvedValueOnce([[{ rol_id: 3 }]]);
        mockUpdate.mockResolvedValueOnce({ id: 42, rol_id: '3' });

        const res = await request(app)
            .put('/usuarios/42')
            .send({ rol_id: '3' });

        expect(res.status).toBe(200);
        // Number(3) === Number("3") → no cierra
        expect(versionService.cerrarSesionDe).not.toHaveBeenCalled();
        expect(versionService.increment).not.toHaveBeenCalled();
    });

    test('usuario inexistente (SELECT vacío) → no cierra nada (sin oldRolId)', async () => {
        db.query.mockResolvedValueOnce([[]]);
        // El service genérico podría devolver null o lanzar — para este test
        // simulamos un update sin crash.
        mockUpdate.mockResolvedValueOnce(null);

        const res = await request(app)
            .put('/usuarios/999')
            .send({ rol_id: 5 });

        expect(res.status).toBe(200);
        expect(versionService.cerrarSesionDe).not.toHaveBeenCalled();
        expect(versionService.increment).not.toHaveBeenCalled();
    });

    test('cambio de password sin cambio de rol → hash + no cierra', async () => {
        mockUpdate.mockResolvedValueOnce({ id: 42 });

        const res = await request(app)
            .put('/usuarios/42')
            .send({ password: 'newpass' });

        expect(res.status).toBe(200);
        expect(versionService.cerrarSesionDe).not.toHaveBeenCalled();
        expect(versionService.increment).not.toHaveBeenCalled();
        // Verificar que password_hash llegó al update (no password en plano)
        expect(mockUpdate).toHaveBeenCalledWith('42', expect.objectContaining({ password_hash: 'hashed' }));
        expect(mockUpdate).toHaveBeenCalledWith('42', expect.not.objectContaining({ password: 'newpass' }));
    });
});

describe('PUT /usuarios/:id — cierre de sesión por cambio de bodega', () => {
    test('cambio de bodega_id (mismo rol) → cierra la sesión SOLO de esa persona', async () => {
        db.query
            .mockResolvedValueOnce([[{ rol_id: 3 }]])       // SELECT rol_id
            .mockResolvedValueOnce([[{ bodega_id: 2 }]]);   // SELECT bodega_id
        mockUpdate.mockResolvedValueOnce({ id: 42, bodega_id: 5 });

        const res = await request(app)
            .put('/usuarios/42')
            .send({ bodega_id: 5 });

        expect(res.status).toBe(200);
        expect(versionService.cerrarSesionDe).toHaveBeenCalledTimes(1);
        expect(versionService.cerrarSesionDe).toHaveBeenCalledWith('42');
        expect(versionService.increment).not.toHaveBeenCalled();
    });

    test('misma bodega_id → no cierra nada', async () => {
        db.query
            .mockResolvedValueOnce([[{ rol_id: 3 }]])
            .mockResolvedValueOnce([[{ bodega_id: 2 }]]);
        mockUpdate.mockResolvedValueOnce({ id: 42, bodega_id: 2 });

        const res = await request(app)
            .put('/usuarios/42')
            .send({ bodega_id: 2 });

        expect(res.status).toBe(200);
        expect(versionService.cerrarSesionDe).not.toHaveBeenCalled();
        expect(versionService.increment).not.toHaveBeenCalled();
    });

    test('cambian rol Y bodega → la sesión se cierra UNA sola vez', async () => {
        db.query
            .mockResolvedValueOnce([[{ rol_id: 3 }]])
            .mockResolvedValueOnce([[{ bodega_id: null }]]);
        mockUpdate.mockResolvedValueOnce({ id: 42, rol_id: 5, bodega_id: 7 });

        const res = await request(app)
            .put('/usuarios/42')
            .send({ rol_id: 5, bodega_id: 7 });

        expect(res.status).toBe(200);
        expect(versionService.cerrarSesionDe).toHaveBeenCalledTimes(1);
        expect(versionService.cerrarSesionDe).toHaveBeenCalledWith('42');
        expect(versionService.increment).not.toHaveBeenCalled();
    });

    test('respaldo: cambio de bodega y cerrarSesionDe falla → sube la versión de su rol (una vez)', async () => {
        db.query
            .mockResolvedValueOnce([[{ rol_id: 3 }]])
            .mockResolvedValueOnce([[{ bodega_id: 2 }]]);
        mockUpdate.mockResolvedValueOnce({ id: 42, rol_id: 3, bodega_id: null });
        versionService.cerrarSesionDe.mockRejectedValueOnce(errorColumna());

        const res = await request(app)
            .put('/usuarios/42')
            .send({ rol_id: 3, bodega_id: null });

        expect(res.status).toBe(200);
        expect(versionService.increment).toHaveBeenCalledTimes(1);
        expect(versionService.increment).toHaveBeenCalledWith(3);
    });
});
