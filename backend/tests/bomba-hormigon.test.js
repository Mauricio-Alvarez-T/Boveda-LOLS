/**
 * Test end-to-end (capa BACKEND) del flujo "nuevo uso de bomba de hormigón".
 *
 * Verifica que POST /api/bombas-hormigon persiste el registro con los MISMOS
 * checkbox/dropdown elegidos en el formulario (consistencia selección →
 * persistencia), el gate de permiso (`inventario.crear`) y el gate financiero
 * del `costo` (`inventario.bombas.ver_costos`).
 *
 * Par del test de frontend `frontend/src/utils/bombaHormigonWhatsApp.test.ts`:
 * usan la MISMA fixture y juntos cubren creación del uso → mensaje de WhatsApp.
 *
 * Usa mocks de la BD para correr sin conexión real (patrón de crud_entities.test.js).
 */

jest.mock('../src/config/db', () => ({
    query: jest.fn().mockResolvedValue([[]]),
    getConnection: jest.fn().mockResolvedValue({
        beginTransaction: jest.fn(),
        query: jest.fn().mockResolvedValue([[]]),
        commit: jest.fn(),
        rollback: jest.fn(),
        release: jest.fn(),
    }),
}));

const request = require('supertest');
const app = require('../index');
const db = require('../src/config/db');
const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'secret';
const USER_ID = 7;

const makeToken = (permisos) =>
    jwt.sign({ id: USER_ID, email: 'op@lols.cl', rol_id: 1, rv: 1, p: permisos }, SECRET);

// Fixture "rica" compartida con el test de frontend: un uso que ejercita todos
// los checkbox/dropdown del formulario con valores mixtos.
const usoPayload = () => ({
    obra_id: 5,
    fecha: '2026-06-24',
    tipo_trabajo: 'Coronación tapa',    // texto libre "tipo de trabajo"
    tipo_bomba: 'Telescópica',          // dropdown
    hora_inicio: '08:30',
    toma_muestras: true,                 // checkbox
    traslado_bombas: false,              // checkbox
    vibradores_origen: 'Externa',        // dropdown
    vibradores_detalle: '3 con sonda de 45',
    tipo_hormigon: 'H-30',
    cantidad_m3: 25.5,
    frecuencia: 'Cada 2 h',
    hidrofugo: true,                     // checkbox
    permiso_calzada: false,              // checkbox
    es_externa: true,                    // dropdown "Origen"
    observaciones: 'Hormigonado losa piso 3',
});

// Posición de cada parámetro en el INSERT de bomba-hormigon.service.js::registrar
// (mismo orden que la sentencia VALUES). Si cambia el INSERT, actualizar aquí.
const COL = {
    obra_id: 0, fecha: 1, tipo_bomba: 2, hora_inicio: 3, toma_muestras: 4,
    traslado_bombas: 5, vibradores: 6, es_externa: 7, proveedor: 8, costo: 9,
    observaciones: 10, tipo_hormigon: 11, cantidad_m3: 12, frecuencia: 13,
    hidrofugo: 14, vibradores_origen: 15, permiso_calzada: 16, vibradores_detalle: 17,
    tipo_trabajo: 18, registrado_por: 19,
};

const insertParams = () => db.query.mock.calls[0][1];

describe('POST /api/bombas-hormigon — nuevo uso de bomba', () => {
    beforeEach(() => jest.clearAllMocks());

    test('crea el uso y persiste los checkbox/dropdown acorde a lo seleccionado', async () => {
        const token = makeToken(['inventario.crear', 'inventario.bombas.ver_costos']);
        db.query.mockResolvedValueOnce([{ insertId: 100, affectedRows: 1 }]);

        const res = await request(app)
            .post('/api/bombas-hormigon')
            .set('Authorization', `Bearer ${token}`)
            .send({ ...usoPayload(), costo: 350000 });

        expect(res.status).toBe(201);
        expect(res.body.data.id).toBe(100);

        // El INSERT recibió exactamente las selecciones del formulario.
        const p = insertParams();
        expect(p[COL.tipo_trabajo]).toBe('Coronación tapa');     // texto libre
        expect(p[COL.tipo_bomba]).toBe('Telescópica');           // dropdown
        expect(p[COL.es_externa]).toBe(true);                    // dropdown "Origen" = Externa
        expect(p[COL.vibradores_origen]).toBe('Externa');        // dropdown
        expect(p[COL.vibradores_detalle]).toBe('3 con sonda de 45');
        expect(p[COL.toma_muestras]).toBe(1);                    // checkbox true → 1
        expect(p[COL.traslado_bombas]).toBe(0);                  // checkbox false → 0
        expect(p[COL.hidrofugo]).toBe(1);                        // checkbox true → 1
        expect(p[COL.permiso_calzada]).toBe(0);                  // checkbox false → 0
        expect(p[COL.tipo_hormigon]).toBe('H-30');
        expect(p[COL.cantidad_m3]).toBe(25.5);
        expect(p[COL.costo]).toBe(350000);                       // con permiso $, se persiste
        expect(p[COL.registrado_por]).toBe(USER_ID);             // userId del token
    });

    test('rechaza con 403 si el usuario no tiene inventario.crear', async () => {
        const token = makeToken(['inventario.ver']);

        const res = await request(app)
            .post('/api/bombas-hormigon')
            .set('Authorization', `Bearer ${token}`)
            .send(usoPayload());

        expect(res.status).toBe(403);
        expect(db.query).not.toHaveBeenCalled();                 // ni siquiera llega al INSERT
    });

    test('gate financiero: sin ver_costos descarta el costo pero crea el uso', async () => {
        const token = makeToken(['inventario.crear']);
        db.query.mockResolvedValueOnce([{ insertId: 101, affectedRows: 1 }]);

        const res = await request(app)
            .post('/api/bombas-hormigon')
            .set('Authorization', `Bearer ${token}`)
            .send({ ...usoPayload(), costo: 350000 });

        expect(res.status).toBe(201);
        const p = insertParams();
        expect(p[COL.costo]).toBeNull();                         // costo descartado por el gate $
        expect(p[COL.tipo_bomba]).toBe('Telescópica');           // el resto de selecciones intacto
        expect(p[COL.hidrofugo]).toBe(1);
        expect(p[COL.es_externa]).toBe(true);
    });
});
