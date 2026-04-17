/**
 * ══════════════════════════════════════════════════════════════
 * TESTS INTEGRALES DEL SISTEMA DE ASISTENCIA — Bóveda LOLS
 * ══════════════════════════════════════════════════════════════
 * 
 * Cubre los siguientes flujos críticos:
 * 
 * 1. REGISTRO MASIVO (bulkCreate)
 *    - Crear registros nuevos
 *    - Actualizar registros existentes
 *    - Bloqueo de feriados y fines de semana
 *    - Bloqueo de fechas fuera de contrato
 *    - Rollback ante errores
 * 
 * 2. CONSULTAS
 *    - Asistencia por obra y fecha
 *    - Resumen diario (KPIs)
 *    - Estados activos
 *    - Reportes con filtros
 * 
 * 3. ACTUALIZACIÓN INDIVIDUAL (update)
 *    - Whitelist de campos
 *    - Log de auditoría
 *    - Asistencia no encontrada
 * 
 * 4. PERÍODOS DE AUSENCIA
 *    - Crear período con generación de registros por día
 *    - Validación de campos requeridos
 *    - Validación de rango de fechas
 *    - Cancelar período (soft delete + limpio de asistencias)
 * 
 * 5. TRASLADO DE OBRA
 *    - Registrar TO en origen + A en destino
 *    - Actualizar obra_id del trabajador
 *    - Datos faltantes generan error
 * 
 * 6. PERMISOS RBAC
 *    - 403 sin permiso
 *    - Cada endpoint exige su permiso
 * 
 * 7. SEGURIDAD
 *    - 401 sin token
 *    - Validación de inputs
 * 
 * 8. EXPORTACIÓN
 *    - Token público para descarga
 *    - Token inválido rechazado
 */

// ── Mock de la BD ──
const mockConnection = {
    beginTransaction: jest.fn(),
    query: jest.fn().mockResolvedValue([[]]),
    commit: jest.fn(),
    rollback: jest.fn(),
    release: jest.fn()
};

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

jest.mock('../src/middleware/logger', () => ({
    logManualActivity: jest.fn(),
    activityLogger: (req, res, next) => next(),
    requestLogger: (req, res, next) => next(),
    loggerMiddleware: (req, res, next) => next(),
}));

const request = require('supertest');
const app = require('../index');
const db = require('../src/config/db');
const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'secret';

// ── Helpers de tokens ──
const makeToken = (permisos) => jwt.sign({
    id: 1, email: 'admin@lols.cl', rol_id: 1, rv: 1, p: permisos
}, SECRET);

const fullToken = makeToken([
    'asistencia.ver', 'asistencia.guardar', 'asistencia.exportar_excel',
    'asistencia.periodo.ver', 'asistencia.periodo.eliminar',
    'asistencia.horarios.ver', 'asistencia.horarios.editar',
]);
const viewOnlyToken = makeToken(['asistencia.ver']);
const noPermsToken = makeToken(['dashboard.view']);


// ══════════════════════════════════════════════════
//  1. REGISTRO MASIVO (POST /api/asistencias/bulk)
// ══════════════════════════════════════════════════
describe('Registro Masivo de Asistencia (bulkCreate)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // Reset connection mock
        const conn = {
            beginTransaction: jest.fn(),
            query: jest.fn(),
            commit: jest.fn(),
            rollback: jest.fn(),
            release: jest.fn()
        };
        db.getConnection.mockResolvedValue(conn);
    });

    test('POST /api/asistencias/bulk/1 → crear registro nuevo (día hábil)', async () => {
        const conn = await db.getConnection();
        conn.query
            // 1. Check feriado → no es feriado
            .mockResolvedValueOnce([[]])
            // 2. Check worker dates
            .mockResolvedValueOnce([[{ fecha_ingreso: '2024-01-01', fecha_desvinculacion: null }]])
            // 3. Check existing → no existe
            .mockResolvedValueOnce([[]])
            // 4. INSERT
            .mockResolvedValueOnce([{ insertId: 100 }]);

        // Mock for _logBulkChanges (runs after commit)
        db.query
            .mockResolvedValueOnce([[{ id: 1, nombres: 'Juan', apellido_paterno: 'Pérez' }]])  // workers
            .mockResolvedValueOnce([[{ id: 1, nombre: 'Presente' }]])                            // estados
            .mockResolvedValueOnce([[]]);                                                         // tipos_ausencia

        const res = await request(app)
            .post('/api/asistencias/bulk/1')
            .set('Authorization', `Bearer ${fullToken}`)
            .send({
                registros: [{
                    trabajador_id: 1,
                    fecha: '2025-03-03',  // lunes
                    estado_id: 1,
                    hora_entrada: '08:00',
                    hora_salida: '18:00'
                }]
            });

        expect(res.status).toBe(201);
        expect(res.body.data).toHaveLength(1);
        expect(res.body.data[0].action).toBe('created');
        expect(conn.commit).toHaveBeenCalled();
    });

    test('POST /api/asistencias/bulk/1 → actualizar registro existente', async () => {
        const conn = await db.getConnection();
        conn.query
            .mockResolvedValueOnce([[]])  // feriado check
            .mockResolvedValueOnce([[{ fecha_ingreso: '2024-01-01', fecha_desvinculacion: null }]])
            // Registro existente
            .mockResolvedValueOnce([[{
                id: 50,
                trabajador_id: 1,
                obra_id: 1,
                fecha: '2025-03-03',
                estado_id: 1,
                tipo_ausencia_id: null,
                observacion: null,
                hora_entrada: '08:00',
                hora_salida: '17:00',
                hora_colacion_inicio: null,
                hora_colacion_fin: null,
                horas_extra: 0,
                es_sabado: 0
            }]])
            .mockResolvedValueOnce([{ affectedRows: 1 }]);  // UPDATE

        db.query
            .mockResolvedValueOnce([[{ id: 1, nombres: 'Juan', apellido_paterno: 'Pérez' }]])
            .mockResolvedValueOnce([[{ id: 1, nombre: 'Presente' }]])
            .mockResolvedValueOnce([[]]);

        const res = await request(app)
            .post('/api/asistencias/bulk/1')
            .set('Authorization', `Bearer ${fullToken}`)
            .send({
                registros: [{
                    trabajador_id: 1,
                    fecha: '2025-03-03',
                    estado_id: 1,
                    hora_entrada: '08:00',
                    hora_salida: '18:00',  // cambió
                    horas_extra: 2
                }]
            });

        expect(res.status).toBe(201);
        expect(res.body.data[0].action).toBe('updated');
        expect(res.body.data[0].id).toBe(50);
    });

    test('POST /api/asistencias/bulk/1 → BLOQUEA fines de semana', async () => {
        const conn = await db.getConnection();
        conn.query
            .mockResolvedValueOnce([[]])  // no es feriado
            .mockResolvedValueOnce([[{ fecha_ingreso: '2024-01-01', fecha_desvinculacion: null }]]);

        const res = await request(app)
            .post('/api/asistencias/bulk/1')
            .set('Authorization', `Bearer ${fullToken}`)
            .send({
                registros: [{
                    trabajador_id: 1,
                    fecha: '2025-03-08',  // sábado
                    estado_id: 1
                }]
            });

        expect(res.status).toBe(500);
        expect(conn.rollback).toHaveBeenCalled();
    });

    test('POST /api/asistencias/bulk/1 → BLOQUEA feriados', async () => {
        const conn = await db.getConnection();
        conn.query
            .mockResolvedValueOnce([[{ id: 10, nombre: 'Día del Trabajador' }]])  // ES feriado
            .mockResolvedValueOnce([[{ fecha_ingreso: '2024-01-01', fecha_desvinculacion: null }]]);

        const res = await request(app)
            .post('/api/asistencias/bulk/1')
            .set('Authorization', `Bearer ${fullToken}`)
            .send({
                registros: [{
                    trabajador_id: 1,
                    fecha: '2025-05-01',  // feriado
                    estado_id: 1
                }]
            });

        expect(res.status).toBe(500);
        expect(conn.rollback).toHaveBeenCalled();
    });

    test('POST /api/asistencias/bulk/1 → BLOQUEA fecha antes de contratación', async () => {
        const conn = await db.getConnection();
        conn.query
            .mockResolvedValueOnce([[]])  // no feriado
            .mockResolvedValueOnce([[{ fecha_ingreso: '2025-06-01', fecha_desvinculacion: null }]]);

        const res = await request(app)
            .post('/api/asistencias/bulk/1')
            .set('Authorization', `Bearer ${fullToken}`)
            .send({
                registros: [{
                    trabajador_id: 1,
                    fecha: '2025-03-03',  // antes de contratación
                    estado_id: 1
                }]
            });

        expect(res.status).toBe(500);
        expect(conn.rollback).toHaveBeenCalled();
    });

    test('POST /api/asistencias/bulk/1 → BLOQUEA fecha después de finiquito', async () => {
        const conn = await db.getConnection();
        conn.query
            .mockResolvedValueOnce([[]])  // no feriado
            .mockResolvedValueOnce([[{ fecha_ingreso: '2024-01-01', fecha_desvinculacion: '2025-02-28' }]]);

        const res = await request(app)
            .post('/api/asistencias/bulk/1')
            .set('Authorization', `Bearer ${fullToken}`)
            .send({
                registros: [{
                    trabajador_id: 1,
                    fecha: '2025-03-03',  // después de finiquito
                    estado_id: 1
                }]
            });

        expect(res.status).toBe(500);
        expect(conn.rollback).toHaveBeenCalled();
    });

    test('POST /api/asistencias/bulk/1 → 400 sin registros', async () => {
        const res = await request(app)
            .post('/api/asistencias/bulk/1')
            .set('Authorization', `Bearer ${fullToken}`)
            .send({});

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('requeridos');
    });

    test('POST /api/asistencias/bulk/1 → 400 con registros no-array', async () => {
        const res = await request(app)
            .post('/api/asistencias/bulk/1')
            .set('Authorization', `Bearer ${fullToken}`)
            .send({ registros: 'no soy un array' });

        expect(res.status).toBe(400);
    });
});


// ══════════════════════════════════════════════════
//  2. CONSULTAS DE ASISTENCIA
// ══════════════════════════════════════════════════
describe('Consultas de Asistencia', () => {
    beforeEach(() => jest.clearAllMocks());

    test('GET /api/asistencias/obra/1?fecha=2025-03-03 → listar por obra y fecha', async () => {
        db.query
            .mockResolvedValueOnce([[{ nombre: 'Año Nuevo' }]])  // feriado check — no feriado for testing
            .mockResolvedValueOnce([[]]);  // no feriado

        // Override: first call returns feriado empty, second returns attendance rows
        db.query.mockReset();
        db.query
            .mockResolvedValueOnce([[]])  // feriados
            .mockResolvedValueOnce([[
                { id: 1, trabajador_id: 1, estado_id: 1, estado_nombre: 'Presente', nombres: 'Juan' }
            ]]);

        const res = await request(app)
            .get('/api/asistencias/obra/1?fecha=2025-03-03')
            .set('Authorization', `Bearer ${fullToken}`);

        expect(res.status).toBe(200);
        expect(res.body.data).toBeDefined();
    });

    test('GET /api/asistencias/obra/1 → 400 sin fecha', async () => {
        const res = await request(app)
            .get('/api/asistencias/obra/1')
            .set('Authorization', `Bearer ${fullToken}`);

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('fecha');
    });

    test('GET /api/asistencias/resumen/1?fecha=2025-03-03 → KPIs diarios', async () => {
        db.query
            .mockResolvedValueOnce([[]])  // feriados
            .mockResolvedValueOnce([[
                { nombre: 'Presente', codigo: 'A', color: '#00A651', es_presente: 1, cantidad: 15 },
                { nombre: 'Falta', codigo: 'F', color: '#FF3B30', es_presente: 0, cantidad: 3 }
            ]])
            .mockResolvedValueOnce([[{ total_horas_extra: 8.5 }]]);

        const res = await request(app)
            .get('/api/asistencias/resumen/1?fecha=2025-03-03')
            .set('Authorization', `Bearer ${fullToken}`);

        expect(res.status).toBe(200);
        expect(res.body.data.total_trabajadores).toBe(18);
        expect(res.body.data.presentes).toBe(15);
        expect(res.body.data.porcentaje_asistencia).toBe(83); // Math.round(15/18*100)
        expect(res.body.data.total_horas_extra).toBe(8.5);
    });

    test('GET /api/asistencias/resumen/1 → 400 sin fecha', async () => {
        const res = await request(app)
            .get('/api/asistencias/resumen/1')
            .set('Authorization', `Bearer ${fullToken}`);

        expect(res.status).toBe(400);
    });

    test('GET /api/asistencias/estados → listar estados activos', async () => {
        db.query.mockResolvedValueOnce([[
            { id: 1, nombre: 'Asiste', codigo: 'A', color: '#00A651', activo: 1, es_presente: 1 },
            { id: 2, nombre: 'Falta', codigo: 'F', color: '#FF3B30', activo: 1, es_presente: 0 }
        ]]);

        const res = await request(app)
            .get('/api/asistencias/estados')
            .set('Authorization', `Bearer ${fullToken}`);

        expect(res.status).toBe(200);
        expect(res.body.data).toHaveLength(2);
    });

    test('GET /api/asistencias/reporte → reporte con filtros', async () => {
        db.query
            .mockResolvedValueOnce([[{ id: 1, estado_nombre: 'Presente' }]])  // registros
            .mockResolvedValueOnce([[]]);  // feriados

        const res = await request(app)
            .get('/api/asistencias/reporte?obra_id=1&fecha_inicio=2025-03-01&fecha_fin=2025-03-31')
            .set('Authorization', `Bearer ${fullToken}`);

        expect(res.status).toBe(200);
    });
});


// ══════════════════════════════════════════════════
//  3. ACTUALIZACIÓN INDIVIDUAL (PUT)
// ══════════════════════════════════════════════════
describe('Actualización Individual de Asistencia', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        const conn = {
            beginTransaction: jest.fn(),
            query: jest.fn(),
            commit: jest.fn(),
            rollback: jest.fn(),
            release: jest.fn()
        };
        db.getConnection.mockResolvedValue(conn);
    });

    test('PUT /api/asistencias/1 → actualizar con log de auditoría', async () => {
        const conn = await db.getConnection();
        conn.query
            .mockResolvedValueOnce([[{
                id: 1, estado_id: 1, tipo_ausencia_id: null,
                observacion: null, hora_entrada: '08:00', hora_salida: '17:00',
                horas_extra: 0, es_sabado: 0,
                hora_colacion_inicio: null, hora_colacion_fin: null
            }]])
            .mockResolvedValueOnce([{ affectedRows: 1 }])  // INSERT log
            .mockResolvedValueOnce([{ affectedRows: 1 }])  // INSERT log (hora_salida)
            .mockResolvedValueOnce([{ affectedRows: 1 }]); // UPDATE asistencias

        const res = await request(app)
            .put('/api/asistencias/1')
            .set('Authorization', `Bearer ${fullToken}`)
            .send({ estado_id: 2, hora_salida: '18:00' });

        expect(res.status).toBe(200);
        expect(res.body.id).toBe('1');
        expect(conn.commit).toHaveBeenCalled();
    });

    test('PUT /api/asistencias/999 → 404 si no existe', async () => {
        const conn = await db.getConnection();
        conn.query.mockResolvedValueOnce([[]]);  // no existe

        const res = await request(app)
            .put('/api/asistencias/999')
            .set('Authorization', `Bearer ${fullToken}`)
            .send({ estado_id: 2 });

        expect(res.status).toBe(404);
        expect(conn.rollback).toHaveBeenCalled();
    });

    test('PUT /api/asistencias/1 → whitelist rechaza campos peligrosos', async () => {
        const conn = await db.getConnection();
        // No hay campos válidos después del filtro → 400
        const res = await request(app)
            .put('/api/asistencias/1')
            .set('Authorization', `Bearer ${fullToken}`)
            .send({ registrado_por: 999, trabajador_id: 666, fecha: '2020-01-01' });

        expect(res.status).toBe(400);
    });
});


// ══════════════════════════════════════════════════
//  4. PERÍODOS DE AUSENCIA
// ══════════════════════════════════════════════════
describe('Períodos de Ausencia', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        const conn = {
            beginTransaction: jest.fn(),
            query: jest.fn(),
            commit: jest.fn(),
            rollback: jest.fn(),
            release: jest.fn()
        };
        db.getConnection.mockResolvedValue(conn);
    });

    test('POST /api/asistencias/periodos → crear período (genera registros diarios)', async () => {
        const conn = await db.getConnection();
        conn.query
            // Worker check (fecha_ingreso, fecha_desvinculacion)
            .mockResolvedValueOnce([[{ fecha_ingreso: '2024-01-01', fecha_desvinculacion: null }]])
            // Check nuevo estado código
            .mockResolvedValueOnce([[{ codigo: 'V' }]])
            // Desactivar períodos superpuestos
            .mockResolvedValueOnce([{ affectedRows: 0 }])
            // INSERT período
            .mockResolvedValueOnce([{ insertId: 7 }])
            // Registros por día (3 días: lun, mar, mie)
            .mockResolvedValueOnce([{ affectedRows: 1 }])
            .mockResolvedValueOnce([{ affectedRows: 1 }])
            .mockResolvedValueOnce([{ affectedRows: 1 }]);

        // Post-commit log queries
        db.query
            .mockResolvedValueOnce([[{ nombres: 'María', apellido_paterno: 'López' }]])
            .mockResolvedValueOnce([[{ nombre: 'Vacaciones' }]]);

        const res = await request(app)
            .post('/api/asistencias/periodos')
            .set('Authorization', `Bearer ${fullToken}`)
            .send({
                trabajador_id: 1,
                obra_id: 1,
                estado_id: 3,  // Vacaciones
                fecha_inicio: '2025-03-03',  // lunes
                fecha_fin: '2025-03-05'      // miércoles
            });

        expect(res.status).toBe(201);
        expect(res.body.data.id).toBe(7);
        expect(res.body.data.dias_afectados).toBe(3);
        expect(conn.commit).toHaveBeenCalled();
    });

    test('POST /api/asistencias/periodos → 500 sin campos requeridos', async () => {
        const res = await request(app)
            .post('/api/asistencias/periodos')
            .set('Authorization', `Bearer ${fullToken}`)
            .send({ trabajador_id: 1 });  // faltan campos

        expect(res.status).toBe(500);
    });

    test('POST /api/asistencias/periodos → 500 si fecha_fin < fecha_inicio', async () => {
        const conn = await db.getConnection();
        conn.query.mockResolvedValueOnce([[{ fecha_ingreso: '2024-01-01', fecha_desvinculacion: null }]]);

        const res = await request(app)
            .post('/api/asistencias/periodos')
            .set('Authorization', `Bearer ${fullToken}`)
            .send({
                trabajador_id: 1, obra_id: 1, estado_id: 3,
                fecha_inicio: '2025-03-10',
                fecha_fin: '2025-03-05'  // ← anterior
            });

        expect(res.status).toBe(500);
    });

    test('POST /api/asistencias/periodos → BLOQUEA período antes de contratación', async () => {
        const conn = await db.getConnection();
        conn.query.mockResolvedValueOnce([[{ fecha_ingreso: '2025-06-01', fecha_desvinculacion: null }]]);

        const res = await request(app)
            .post('/api/asistencias/periodos')
            .set('Authorization', `Bearer ${fullToken}`)
            .send({
                trabajador_id: 1, obra_id: 1, estado_id: 3,
                fecha_inicio: '2025-03-03',
                fecha_fin: '2025-03-05'
            });

        expect(res.status).toBe(500);
    });

    test('GET /api/asistencias/periodos → listar períodos', async () => {
        const periodoToken = makeToken(['asistencia.periodo.ver']);
        db.query.mockResolvedValueOnce([[
            { id: 1, trabajador_id: 1, estado_nombre: 'Vacaciones', fecha_inicio: '2025-03-03' }
        ]]);

        const res = await request(app)
            .get('/api/asistencias/periodos')
            .set('Authorization', `Bearer ${periodoToken}`);

        expect(res.status).toBe(200);
    });

    test('DELETE /api/asistencias/periodos/1 → cancelar período', async () => {
        const deleteToken = makeToken(['asistencia.periodo.eliminar']);
        db.query
            .mockResolvedValueOnce([[{
                id: 1, trabajador_id: 1, obra_id: 1,
                fecha_inicio: '2025-03-03', fecha_fin: '2025-03-05',
                estado_id: 3
            }]])
            .mockResolvedValueOnce([{ affectedRows: 1 }])   // UPDATE activo=FALSE
            .mockResolvedValueOnce([{ affectedRows: 3 }]);   // DELETE asistencias

        const res = await request(app)
            .delete('/api/asistencias/periodos/1')
            .set('Authorization', `Bearer ${deleteToken}`);

        expect(res.status).toBe(200);
        expect(res.body.data.cancelado).toBe(true);
    });
});


// ══════════════════════════════════════════════════
//  5. TRASLADO DE OBRA
// ══════════════════════════════════════════════════
describe('Traslado de Obra (TO)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        const conn = {
            beginTransaction: jest.fn(),
            query: jest.fn(),
            commit: jest.fn(),
            rollback: jest.fn(),
            release: jest.fn()
        };
        db.getConnection.mockResolvedValue(conn);
    });

    test('POST /api/asistencias/traslado-obra → traslado exitoso', async () => {
        const conn = await db.getConnection();
        conn.query
            // 1. Lookup trabajador
            .mockResolvedValueOnce([[{ nombres: 'Carlos', apellido_paterno: 'Ruiz' }]])
            // 2. Lookup obra origen
            .mockResolvedValueOnce([[{ nombre: 'Obra Las Condes' }]])
            // 3. Lookup obra destino
            .mockResolvedValueOnce([[{ nombre: 'Obra Providencia' }]])
            // 4. Lookup estado TO
            .mockResolvedValueOnce([[{ id: 8 }]])
            // 5. Lookup estado A (Asiste)
            .mockResolvedValueOnce([[{ id: 1 }]])
            // 6. Check existing origen → no existe
            .mockResolvedValueOnce([[]])
            // 7. INSERT asistencia origen (TO)
            .mockResolvedValueOnce([{ insertId: 200 }])
            // 8. Check horario destino
            .mockResolvedValueOnce([[{ hora_entrada: '08:00', hora_salida: '18:00', hora_colacion_inicio: '13:00', hora_colacion_fin: '14:00' }]])
            // 9. Check existing destino → no existe
            .mockResolvedValueOnce([[]])
            // 10. INSERT asistencia destino (A)
            .mockResolvedValueOnce([{ insertId: 201 }])
            // 11. UPDATE trabajador obra_id
            .mockResolvedValueOnce([{ affectedRows: 1 }]);

        const res = await request(app)
            .post('/api/asistencias/traslado-obra')
            .set('Authorization', `Bearer ${fullToken}`)
            .send({
                trabajador_id: 1,
                obra_actual_id: 1,
                obra_destino_id: 2,
                fecha: '2025-03-03',
                comentario: 'Necesidad de obra'
            });

        expect(res.status).toBe(201);
        expect(res.body.data.success).toBe(true);
        expect(res.body.data.obra_destino_nombre).toBe('Obra Providencia');
        expect(conn.commit).toHaveBeenCalled();
    });

    test('POST /api/asistencias/traslado-obra → 500 si trabajador no encontrado', async () => {
        const conn = await db.getConnection();
        conn.query
            .mockResolvedValueOnce([[]])    // trabajador no existe
            .mockResolvedValueOnce([[]])    // obra origen
            .mockResolvedValueOnce([[]])    // obra destino
            .mockResolvedValueOnce([[]])    // estado TO
            .mockResolvedValueOnce([[]]);   // estado A

        const res = await request(app)
            .post('/api/asistencias/traslado-obra')
            .set('Authorization', `Bearer ${fullToken}`)
            .send({
                trabajador_id: 999,
                obra_actual_id: 1,
                obra_destino_id: 2,
                fecha: '2025-03-03'
            });

        expect(res.status).toBe(500);
        expect(conn.rollback).toHaveBeenCalled();
    });
});


// ══════════════════════════════════════════════════
//  6. ALERTAS DE FALTAS
// ══════════════════════════════════════════════════
describe('Alertas de Faltas', () => {
    beforeEach(() => jest.clearAllMocks());

    test('GET /api/asistencias/alertas/1 → detecta faltas consecutivas', async () => {
        db.query
            // estado F lookup
            .mockResolvedValueOnce([[{ id: 5 }]])
            // faltas del mes
            .mockResolvedValueOnce([[
                { trabajador_id: 1, fecha: '2025-03-03', nombres: 'Pedro', apellido_paterno: 'Soto', rut: '11.111.111-1' },
                { trabajador_id: 1, fecha: '2025-03-04', nombres: 'Pedro', apellido_paterno: 'Soto', rut: '11.111.111-1' },
            ]]);

        const res = await request(app)
            .get('/api/asistencias/alertas/1?mes=3&anio=2025')
            .set('Authorization', `Bearer ${fullToken}`);

        expect(res.status).toBe(200);
        expect(res.body.data).toHaveLength(1);
        expect(res.body.data[0].alertas[0].tipo).toBe('consecutivas');
    });

    test('GET /api/asistencias/alertas/1 → detecta 2+ faltas en lunes', async () => {
        db.query
            .mockResolvedValueOnce([[{ id: 5 }]])
            .mockResolvedValueOnce([[
                { trabajador_id: 2, fecha: '2025-03-03', nombres: 'Ana', apellido_paterno: 'Gil', rut: '22.222.222-2' },
                { trabajador_id: 2, fecha: '2025-03-10', nombres: 'Ana', apellido_paterno: 'Gil', rut: '22.222.222-2' },
            ]]);

        const res = await request(app)
            .get('/api/asistencias/alertas/1?mes=3&anio=2025')
            .set('Authorization', `Bearer ${fullToken}`);

        expect(res.status).toBe(200);
        const alertTypes = res.body.data[0].alertas.map(a => a.tipo);
        expect(alertTypes).toContain('lunes');
    });

    test('GET /api/asistencias/alertas/1 → detecta 3+ faltas acumuladas', async () => {
        db.query
            .mockResolvedValueOnce([[{ id: 5 }]])
            .mockResolvedValueOnce([[
                { trabajador_id: 3, fecha: '2025-03-03', nombres: 'Luis', apellido_paterno: 'Mora', rut: '33.333.333-3' },
                { trabajador_id: 3, fecha: '2025-03-07', nombres: 'Luis', apellido_paterno: 'Mora', rut: '33.333.333-3' },
                { trabajador_id: 3, fecha: '2025-03-14', nombres: 'Luis', apellido_paterno: 'Mora', rut: '33.333.333-3' },
            ]]);

        const res = await request(app)
            .get('/api/asistencias/alertas/1?mes=3&anio=2025')
            .set('Authorization', `Bearer ${fullToken}`);

        expect(res.status).toBe(200);
        const alertTypes = res.body.data[0].alertas.map(a => a.tipo);
        expect(alertTypes).toContain('acumuladas');
    });

    test('GET /api/asistencias/alertas/1 → 400 sin mes/anio', async () => {
        const res = await request(app)
            .get('/api/asistencias/alertas/1')
            .set('Authorization', `Bearer ${fullToken}`);

        expect(res.status).toBe(400);
    });
});


// ══════════════════════════════════════════════════
//  7. HORARIOS
// ══════════════════════════════════════════════════
describe('Configuración de Horarios', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        const conn = {
            beginTransaction: jest.fn(),
            query: jest.fn().mockResolvedValue([{ affectedRows: 1 }]),
            commit: jest.fn(),
            rollback: jest.fn(),
            release: jest.fn()
        };
        db.getConnection.mockResolvedValue(conn);
    });

    test('GET /api/asistencias/horarios/1 → listar horarios', async () => {
        db.query.mockResolvedValueOnce([[
            { dia_semana: 'lun', hora_entrada: '08:00', hora_salida: '18:00', colacion_minutos: 60 }
        ]]);

        const horariosToken = makeToken(['asistencia.horarios.ver']);
        const res = await request(app)
            .get('/api/asistencias/horarios/1')
            .set('Authorization', `Bearer ${horariosToken}`);

        expect(res.status).toBe(200);
    });

    test('POST /api/asistencias/horarios/1 → guardar horarios (upsert)', async () => {
        const horariosToken = makeToken(['asistencia.horarios.editar']);
        const res = await request(app)
            .post('/api/asistencias/horarios/1')
            .set('Authorization', `Bearer ${horariosToken}`)
            .send({
                horarios: [
                    { dia_semana: 'lun', hora_entrada: '08:00', hora_salida: '18:00', colacion_minutos: 60 },
                    { dia_semana: 'mar', hora_entrada: '08:00', hora_salida: '18:00', colacion_minutos: 60 }
                ]
            });

        expect(res.status).toBe(200);
        expect(res.body.data.saved).toBe(2);
    });

    test('POST /api/asistencias/horarios/1 → 400 sin horarios[]', async () => {
        const horariosToken = makeToken(['asistencia.horarios.editar']);
        const res = await request(app)
            .post('/api/asistencias/horarios/1')
            .set('Authorization', `Bearer ${horariosToken}`)
            .send({});

        expect(res.status).toBe(400);
    });
});


// ══════════════════════════════════════════════════
//  8. EXPORTACIÓN Y TOKENS PÚBLICOS
// ══════════════════════════════════════════════════
describe('Exportación y Tokens Públicos', () => {
    beforeEach(() => jest.clearAllMocks());

    test('GET /api/asistencias/public-report-token → genera token JWT', async () => {
        const res = await request(app)
            .get('/api/asistencias/public-report-token?obra_id=1&fecha_inicio=2025-03-01&fecha_fin=2025-03-31')
            .set('Authorization', `Bearer ${fullToken}`);

        expect(res.status).toBe(200);
        expect(res.body.data.token).toBeDefined();
        expect(typeof res.body.data.token).toBe('string');

        // Verificar que el token es decodificable
        const decoded = jwt.verify(res.body.data.token, SECRET);
        expect(decoded.obra_id).toBe('1');
    });

    test('GET /api/asistencias/d/:token → rechaza token inválido', async () => {
        const res = await request(app)
            .get('/api/asistencias/d/token_falso_123');

        expect(res.status).toBe(401);
        expect(res.body.error).toContain('inválido');
    });
});


// ══════════════════════════════════════════════════
//  9. PERMISOS RBAC
// ══════════════════════════════════════════════════
describe('Permisos RBAC — Asistencia', () => {
    beforeEach(() => jest.clearAllMocks());

    test('POST /api/asistencias/bulk/1 → 403 sin asistencia.guardar', async () => {
        const res = await request(app)
            .post('/api/asistencias/bulk/1')
            .set('Authorization', `Bearer ${viewOnlyToken}`)
            .send({ registros: [] });

        expect(res.status).toBe(403);
    });

    test('PUT /api/asistencias/1 → 403 sin asistencia.guardar', async () => {
        const res = await request(app)
            .put('/api/asistencias/1')
            .set('Authorization', `Bearer ${viewOnlyToken}`)
            .send({ estado_id: 2 });

        expect(res.status).toBe(403);
    });

    test('GET /api/asistencias/obra/1?fecha=2025-03-03 → 403 sin asistencia.ver', async () => {
        const res = await request(app)
            .get('/api/asistencias/obra/1?fecha=2025-03-03')
            .set('Authorization', `Bearer ${noPermsToken}`);

        expect(res.status).toBe(403);
    });

    test('POST /api/asistencias/traslado-obra → 403 sin asistencia.guardar', async () => {
        const res = await request(app)
            .post('/api/asistencias/traslado-obra')
            .set('Authorization', `Bearer ${viewOnlyToken}`)
            .send({ trabajador_id: 1, obra_actual_id: 1, obra_destino_id: 2, fecha: '2025-03-03' });

        expect(res.status).toBe(403);
    });

    test('GET /api/asistencias/exportar/excel → 403 sin asistencia.exportar_excel', async () => {
        const res = await request(app)
            .get('/api/asistencias/exportar/excel?fecha_inicio=2025-03-01&fecha_fin=2025-03-31')
            .set('Authorization', `Bearer ${viewOnlyToken}`);

        expect(res.status).toBe(403);
    });
});


// ══════════════════════════════════════════════════
//  10. SEGURIDAD GENERAL
// ══════════════════════════════════════════════════
describe('Seguridad General — Asistencia', () => {
    test('Todos los endpoints protegidos requieren token', async () => {
        const endpoints = [
            { method: 'get', url: '/api/asistencias/obra/1?fecha=2025-03-03' },
            { method: 'get', url: '/api/asistencias/resumen/1?fecha=2025-03-03' },
            { method: 'post', url: '/api/asistencias/bulk/1' },
            { method: 'put', url: '/api/asistencias/1' },
            { method: 'get', url: '/api/asistencias/reporte' },
            { method: 'get', url: '/api/asistencias/alertas/1?mes=3&anio=2025' },
            { method: 'post', url: '/api/asistencias/periodos' },
            { method: 'get', url: '/api/asistencias/periodos' },
            { method: 'delete', url: '/api/asistencias/periodos/1' },
            { method: 'post', url: '/api/asistencias/traslado-obra' },
        ];

        for (const ep of endpoints) {
            const res = await request(app)[ep.method](ep.url);
            expect(res.status).toBe(401);
        }
    });
});
