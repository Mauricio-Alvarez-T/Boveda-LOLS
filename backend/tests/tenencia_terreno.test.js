/**
 * Tenencia en terreno: máx. 4 días hábiles, contados desde la HORA EXACTA del retiro confirmado
 * (dueño 2026-10-21). Octubre 2026: lun 19, mar 20, mié 21, jue 22, vie 23, sáb 24, dom 25, lun 26, mar 27.
 */
const { tenencia, esHabil, siguienteHabil, inicioTenencia } = require('../src/utils/tenenciaTerreno');
const { ahoraChile } = require('../src/utils/fechaChile');

describe('tenenciaTerreno', () => {
    test('aceptado el mié 21 a las 16:26: vence el mar 27 a las 16:26 (el ejemplo del dueño)', () => {
        const r = '2026-10-21 16:26';
        expect(tenencia(r, '2026-10-21 16:30')).toEqual({ dia: 1, max: 4, vence_el: '2026-10-27', vence_hora: '16:26', atrasado: false, dias_atraso: 0 });
        expect(tenencia(r, '2026-10-22 16:25').dia).toBe(1);
        expect(tenencia(r, '2026-10-22 16:26').dia).toBe(2);
        expect(tenencia(r, '2026-10-23 17:00').dia).toBe(3);
        expect(tenencia(r, '2026-10-25 12:00').dia).toBe(3); // el fin de semana queda dentro del día 3
        expect(tenencia(r, '2026-10-26 16:26').dia).toBe(4);
        expect(tenencia(r, '2026-10-27 16:25')).toMatchObject({ dia: 4, atrasado: false });
        expect(tenencia(r, '2026-10-27 16:26')).toMatchObject({ dia: 5, atrasado: true, dias_atraso: 1 });
        expect(tenencia(r, '2026-10-29 09:00')).toMatchObject({ dia: 6, dias_atraso: 2 });
    });

    test('la tarde del día de aceptación ya no se pierde: aceptado el lun 19 a las 18:00 vence el vie 23 a las 18:00', () => {
        expect(tenencia('2026-10-19 18:00', '2026-10-23 12:00')).toMatchObject({ dia: 4, atrasado: false, vence_el: '2026-10-23', vence_hora: '18:00' });
        expect(tenencia('2026-10-19 18:00', '2026-10-23 18:00')).toMatchObject({ dia: 5, atrasado: true });
    });

    test('un feriado no cuenta', () => {
        const feriados = new Set(['2026-10-22']);
        expect(esHabil('2026-10-22', feriados)).toBe(false);
        expect(siguienteHabil('2026-10-21', feriados)).toBe('2026-10-23');
        expect(tenencia('2026-10-21 10:00', '2026-10-28 09:59', feriados)).toMatchObject({ dia: 4, vence_el: '2026-10-28', atrasado: false });
    });

    test('aceptado en un día no hábil: el reloj parte el hábil siguiente a las 00:00', () => {
        expect(inicioTenencia('2026-10-24 11:00')).toEqual({ fecha: '2026-10-26', hora: '00:00' });
        // desde las 00:00 cada día hábil cuenta entero: lun, mar, mié, jue → vence al final del jue 29
        expect(tenencia('2026-10-24 11:00', '2026-10-25 20:00')).toMatchObject({ dia: 1, vence_el: '2026-10-29', vence_hora: null });
        expect(tenencia('2026-10-24 11:00', '2026-10-30 00:00')).toMatchObject({ dia: 5, atrasado: true });
        expect(tenencia('2026-10-24 11:00', '2026-10-27 08:00').dia).toBe(2);
    });

    test('sin hora del retiro y con `ahora` solo fecha da la cuenta por días de antes', () => {
        expect(tenencia('2026-10-19', '2026-10-22')).toMatchObject({ dia: 4, atrasado: false, vence_el: '2026-10-22', vence_hora: null });
        expect(tenencia('2026-10-19', '2026-10-23')).toMatchObject({ dia: 5, atrasado: true });
    });

    test('ahoraChile: reloj de pared de Chile', () => {
        expect(ahoraChile(new Date('2026-10-21T19:26:00Z'))).toBe('2026-10-21 16:26'); // UTC-3 en octubre
        expect(ahoraChile(new Date('2026-10-22T02:30:00Z'))).toBe('2026-10-21 23:30');
    });
});

describe('documentosLotes.atrasados', () => {
    jest.mock('../src/config/db', () => ({ query: jest.fn(), getConnection: jest.fn() }));
    const db = require('../src/config/db');
    const service = require('../src/services/documentosLotes.service');
    const lote = (id, dia, extra = {}) => ({ id, portador_id: 7, portador_nombre: 'Jhoan Vásquez', estado: 'en_terreno', retirado_en: `${dia} 09:00:00`, retirado_dia: dia, total: 2, en_terreno: 2, ...extra });

    beforeEach(() => {
        jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'setTimeout', 'setInterval'] });
        jest.setSystemTime(new Date('2026-10-23T15:00:00Z')); // viernes 23 en Chile
        db.query.mockReset();
    });
    afterEach(() => jest.useRealTimers());

    test('devuelve solo los lotes pasados de 4 días hábiles, con sus documentos en terreno', async () => {
        db.query
            // el 6 se aceptó el lun 19 a las 18:00: el vie 23 a mediodía aún va en su día 4 (vence 18:00)
            .mockResolvedValueOnce([[lote(5, '2026-10-19'), lote(8, '2026-10-20'), lote(6, '2026-10-19', { retirado_hora: '18:00' })]])
            .mockResolvedValueOnce([[]])
            .mockResolvedValueOnce([[{ id: 1, lote_id: 5, documento_id: 90, estado: 'retirado', tipo_nombre: 'DAS', nombres: 'Ana', apellido_paterno: 'Pérez', rut: '1-9', obra_nombre: 'Obra Sur', trabajador_id: 3 }]]);
        const out = await service.atrasados({ id: 3, p: ['documentos.entrega.registrar'] });
        expect(out.alcance).toBe('todos');
        expect(out.lotes).toHaveLength(1);
        expect(out.lotes[0]).toMatchObject({ lote_id: 5, tenencia: { dia: 5, atrasado: true, vence_el: '2026-10-22' } });
        expect(out.lotes[0].documentos).toEqual([{ documento_id: 90, tipo_nombre: 'DAS', trabajador_nombre: 'Pérez Ana', rut: '1-9', obra_nombre: 'Obra Sur' }]);
        expect(String(db.query.mock.calls[2][0])).toMatch(/i\.lote_id IN \(\?\) AND i\.estado = 'retirado'/);
    });

    test('el portador solo ve los suyos', async () => {
        db.query.mockResolvedValueOnce([[]]);
        const out = await service.atrasados({ id: 7, p: ['documentos.entrega.portar'] });
        expect(out).toMatchObject({ alcance: 'propios', lotes: [] });
        expect(String(db.query.mock.calls[0][0])).toMatch(/l\.portador_id = \?/);
        expect(String(db.query.mock.calls[0][0])).toMatch(/DATE_FORMAT\(l\.retirado_en, '%H:%i'\) AS retirado_hora/);
        expect(db.query.mock.calls[0][1]).toEqual([7]);
    });
});

describe('documentosLotes.flujo', () => {
    const db = require('../src/config/db');
    const service = require('../src/services/documentosLotes.service');
    beforeEach(() => {
        jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'setTimeout', 'setInterval'] });
        jest.setSystemTime(new Date('2026-10-21T15:00:00Z')); // miércoles 21
        db.query.mockReset().mockResolvedValue([[]]);
    });
    afterEach(() => jest.useRealTimers());

    test('arma las 5 etapas; firmados desde el lunes de la semana', async () => {
        db.query.mockImplementation(async (sql) => {
            const s = String(sql);
            if (s.includes('COUNT(*) AS n') && s.includes("d.estado = 'generado'")) return [[{ n: 7 }]];
            if (s.includes("d.estado = 'generado'")) return [[{ id: 1, tipo_nombre: 'Contrato', trabajador_id: 3, nombres: 'Ana', apellido_paterno: 'Pérez', rut: '1-9', obra_nombre: 'Sur', dias: 5 }]];
            if (s.includes('FROM documentos_lotes l')) return [[{ id: 9, estado: 'pendiente_retiro', total: 2 }, { id: 7, estado: 'en_terreno', retirado_dia: '2026-10-19', total: 3, en_terreno: 3 }]];
            return [[]];
        });
        const out = await service.flujo({ id: 3, p: ['documentos.entrega.registrar'] });
        expect(out.sin_imprimir.n).toBe(7);
        expect(out.sin_imprimir.items[0]).toMatchObject({ documento_id: 1, trabajador_nombre: 'Pérez Ana', dias: 5 });
        expect(out.en_oficina.map(l => l.id)).toEqual([9]);
        expect(out.en_terreno[0]).toMatchObject({ id: 7, tenencia: { dia: 3, atrasado: false } });
        expect(out.desde_firmados).toBe('2026-10-19');
        const firm = db.query.mock.calls.find(([sql]) => /d\.estado = 'firmado' AND d\.fecha_firmado >= \?/.test(String(sql)) && /LIMIT/.test(String(sql)));
        expect(firm[1][0]).toBe('2026-10-19');
    });

    test('la ruta exige registrar (el portador no la ve)', async () => {
        const request = require('supertest');
        const app = require('../index');
        const jwt = require('jsonwebtoken');
        const token = jwt.sign({ id: 7, email: 'j@lols.cl', rol_id: 2, rv: 1, p: ['documentos.entrega.portar'] }, process.env.JWT_SECRET || 'secret');
        jest.useRealTimers();
        const res = await request(app).get('/api/documentos-lotes/flujo').set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(403);
    });
});

describe('documentosLotes.misLotes', () => {
    const db = require('../src/config/db');
    const service = require('../src/services/documentosLotes.service');
    beforeEach(() => {
        jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'setTimeout', 'setInterval'] });
        jest.setSystemTime(new Date('2026-10-23T15:00:00Z')); // viernes 23
        db.query.mockReset().mockResolvedValue([[]]);
    });
    afterEach(() => jest.useRealTimers());

    test('separa en oficina / en mis manos con sus documentos y cuenta lo devuelto esta semana', async () => {
        db.query.mockImplementation(async (sql) => {
            const s = String(sql);
            if (s.includes('FROM documentos_lotes l') && s.includes('l.portador_id = ?') && !s.includes('COUNT(*) AS n')) {
                return [[{ id: 9, estado: 'pendiente_retiro', total: 1, pendientes: 1 }, { id: 5, estado: 'en_terreno', retirado_dia: '2026-10-19', total: 2, en_terreno: 2 }]];
            }
            if (s.includes('FROM documentos_lotes_items i') && s.includes('i.lote_id IN (?)')) {
                return [[{ id: 1, lote_id: 5, documento_id: 90, estado: 'retirado', tipo_nombre: 'DAS', nombres: 'Ana', apellido_paterno: 'Pérez', trabajador_id: 3 }]];
            }
            if (s.includes('COUNT(*) AS n')) return [[{ n: 4 }]];
            return [[]];
        });
        const out = await service.misLotes({ id: 7, p: ['documentos.entrega.registrar', 'documentos.entrega.portar'] });
        expect(out.en_oficina.map(l => l.id)).toEqual([9]);
        expect(out.en_mano[0]).toMatchObject({ id: 5, tenencia: { dia: 5, atrasado: true } });
        expect(out.en_mano[0].documentos[0]).toMatchObject({ documento_id: 90, trabajador_nombre: 'Pérez Ana' });
        expect(out.devueltos_semana).toBe(4);
        expect(db.query.mock.calls[0][1]).toEqual([7]);
    });
});
