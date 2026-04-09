/**
 * ══════════════════════════════════════════════════════════════
 * TESTS INTEGRALES DE FILTROS Y CONSULTAS — Bóveda LOLS
 * ══════════════════════════════════════════════════════════════
 * 
 * Este suite valida el corazón del módulo "Consultas", poniendo a prueba
 * los motores de búsqueda y filtrado estructurado tanto para Trabajadores
 * como para Reportes de Asistencia.
 * 
 * Cobertura de Listado (crud.service.js):
 * - Filtros exactos (obra_id, empresa_id, cargo_id)
 * - Búsqueda por texto (rut, nombres)
 * - Filtro de estados (activos, inactivos, todos)
 * - Búsqueda multicriterio ("Juan 17611")
 * 
 * Cobertura de Reportes (asistencia.service.js - getReporte):
 * - Filtros por rango de fechas
 * - Filtros combinados (fecha + obra + cargo + empresa)
 * - Selección específica (trabajador_ids array vs CSV)
 * - Ignorar parámetros nulos ('null', 'undefined', '')
 */

const db = require('../src/config/db');

// Mockear la base de datos
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
const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'secret';
const adminToken = jwt.sign({
    id: 1, email: 'admin@lols.cl', rol_id: 1, rv: 1,
    p: ['trabajadores.ver', 'asistencia.ver']
}, SECRET);

describe('Motor de Filtros — Trabajadores (CRUD Genérico)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('GET /api/trabajadores → Búsqueda de texto limpia y colapsada (Rut sin puntos ni guión)', async () => {
        db.query.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[{ total: 0 }]]);
        
        await request(app)
            .get('/api/trabajadores?q=17.611.988-8')
            .set('Authorization', `Bearer ${adminToken}`);

        const executedQuery = db.query.mock.calls[0][0];
        const params = db.query.mock.calls[0][1];

        // Debe haber reemplazado los caracteres para buscar el rut plano
        expect(executedQuery).toContain("REPLACE(REPLACE(trabajadores.rut, '.', ''), '-', '') LIKE ?");
        // Además, al ser más de una "palabra" por los separadores temporales o similares, 
        // debe incluir el collapsedQuery '%176119888%'
        expect(params).toContain('%176119888%');
    });

    test('GET /api/trabajadores → Búsqueda de múltiples palabras (Nombres)', async () => {
        db.query.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[{ total: 0 }]]);
        
        await request(app)
            .get('/api/trabajadores?q=Juan Perez')
            .set('Authorization', `Bearer ${adminToken}`);

        const executedQuery = db.query.mock.calls[0][0];
        const params = db.query.mock.calls[0][1];

        // Debe haber separado por "Juan" y "Perez" construyendo bloques OR
        expect(executedQuery).toContain('LIKE ?');
        expect(executedQuery.match(/LIKE \?/g).length).toBeGreaterThan(2); 
        expect(params).toContain('%Juan%');
        expect(params).toContain('%Perez%');
    });

    test('GET /api/trabajadores → Filtros estructurados exactos (obra_id, cargo_id)', async () => {
        db.query.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[{ total: 0 }]]);
        
        await request(app)
            .get('/api/trabajadores?obra_id=5&cargo_id=2')
            .set('Authorization', `Bearer ${adminToken}`);

        const executedQuery = db.query.mock.calls[0][0];
        const params = db.query.mock.calls[0][1];

        expect(executedQuery).toContain('trabajadores.obra_id = ?');
        expect(executedQuery).toContain('trabajadores.cargo_id = ?');
        // LIMIT y OFFSET son los últimos, los parámetros del where vienen antes (filtro 1, filtro 2)
        expect(params[0]).toBe('5');
        expect(params[1]).toBe('2');
    });

    test('GET /api/trabajadores → Filtro de Activos (activo=true vs activo=false)', async () => {
        // Test activo = false
        db.query.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[{ total: 0 }]]);
        await request(app)
            .get('/api/trabajadores?activo=false')
            .set('Authorization', `Bearer ${adminToken}`);
        
        let executedQuery = db.query.mock.calls[0][0];
        let params = db.query.mock.calls[0][1];

        // params[0] debe ser 0 para activo=false
        expect(executedQuery).toContain('trabajadores.activo = ?');
        expect(params[0]).toBe(0);

        jest.clearAllMocks();

        // Test activo por defecto (SoftDelete) => debe buscar = 1
        db.query.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[{ total: 0 }]]);
        await request(app)
            .get('/api/trabajadores')
            .set('Authorization', `Bearer ${adminToken}`);

        executedQuery = db.query.mock.calls[0][0];
        expect(executedQuery).toContain('trabajadores.activo = 1');
    });
});

describe('Motor de Filtros — Reportes de Asistencia (getReporte)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('GET /api/asistencias/reporte → Ignora parámetros nulos o stringificados como "null"', async () => {
        db.query.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[]]);
        
        await request(app)
            .get('/api/asistencias/reporte?obra_id=null&empresa_id=undefined&cargo_id=')
            .set('Authorization', `Bearer ${adminToken}`);

        const executedQuery = db.query.mock.calls[0][0];
        expect(executedQuery).not.toContain('a.obra_id = ?');
        expect(executedQuery).not.toContain('t.empresa_id = ?');
        expect(executedQuery).not.toContain('t.cargo_id = ?');
    });

    test('GET /api/asistencias/reporte → Filtro de fechas (fecha_inicio y fecha_fin)', async () => {
        db.query.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[]]); // Asistencias + Feriados
        
        await request(app)
            .get('/api/asistencias/reporte?fecha_inicio=2025-01-01&fecha_fin=2025-01-31')
            .set('Authorization', `Bearer ${adminToken}`);

        const executedQuery = db.query.mock.calls[0][0];
        const params = db.query.mock.calls[0][1];

        expect(executedQuery).toContain('a.fecha >= ?');
        expect(executedQuery).toContain('a.fecha <= ?');
        expect(params).toContain('2025-01-01');
        expect(params).toContain('2025-01-31');
    });

    test('GET /api/asistencias/reporte → Selección múltiple (trabajador_ids csv)', async () => {
        db.query.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[]]); 
        
        await request(app)
            .get('/api/asistencias/reporte?trabajador_ids=1,2,5')
            .set('Authorization', `Bearer ${adminToken}`);

        const executedQuery = db.query.mock.calls[0][0];
        const params = db.query.mock.calls[0][1];

        expect(executedQuery).toContain('a.trabajador_id IN (?,?,?)');
        expect(params).toEqual(expect.arrayContaining(['1', '2', '5']));
    });

    test('GET /api/asistencias/reporte → Filtros combinados de cruce (obra + empresa + estado_activo)', async () => {
        db.query.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[]]); 
        
        await request(app)
            .get('/api/asistencias/reporte?obra_id=10&empresa_id=3&activo=true')
            .set('Authorization', `Bearer ${adminToken}`);

        const executedQuery = db.query.mock.calls[0][0];
        const params = db.query.mock.calls[0][1];

        expect(executedQuery).toContain('a.obra_id = ?');
        expect(executedQuery).toContain('t.empresa_id = ?');
        expect(executedQuery).toContain('t.activo = ?');
        
        expect(params).toContain('10');
        expect(params).toContain('3');
        expect(params).toContain(1); // true se convierte en 1
    });

    test('GET /api/asistencias/reporte → Tolerancia a finiquitados', async () => {
        db.query.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[]]); 
        
        // Si mando 'todos', el query NO debe filtrar por t.activo
        await request(app)
            .get('/api/asistencias/reporte?activo=todos')
            .set('Authorization', `Bearer ${adminToken}`);

        const executedQuery = db.query.mock.calls[0][0];
        expect(executedQuery).not.toContain('t.activo = ?');
    });
});
