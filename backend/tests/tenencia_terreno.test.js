/**
 * Tenencia en terreno (jefatura 2026-10-21): máx. 4 días hábiles; el día del retiro es el día 1.
 * Octubre 2026: lun 19, mar 20, mié 21, jue 22, vie 23, sáb 24, dom 25, lun 26.
 */
const { diaTenencia, venceEl, tenencia, esHabil } = require('../src/utils/tenenciaTerreno');

describe('tenenciaTerreno', () => {
    test('lunes = día 1, jueves = día 4 (último permitido), viernes ya está atrasado', () => {
        expect(diaTenencia('2026-10-19', '2026-10-19')).toBe(1);
        expect(diaTenencia('2026-10-19', '2026-10-22')).toBe(4);
        expect(tenencia('2026-10-19', '2026-10-22')).toMatchObject({ dia: 4, atrasado: false, dias_atraso: 0, vence_el: '2026-10-22' });
        expect(tenencia('2026-10-19', '2026-10-23')).toMatchObject({ dia: 5, atrasado: true, dias_atraso: 1 });
    });

    test('el fin de semana no cuenta: retiro el jueves vence el martes', () => {
        expect(venceEl('2026-10-22')).toBe('2026-10-27');
        expect(tenencia('2026-10-22', '2026-10-25')).toMatchObject({ dia: 2, atrasado: false });
        expect(tenencia('2026-10-22', '2026-10-28')).toMatchObject({ dia: 5, atrasado: true });
    });

    test('un feriado no cuenta', () => {
        const feriados = new Set(['2026-10-21']);
        expect(esHabil('2026-10-21', feriados)).toBe(false);
        expect(venceEl('2026-10-19', feriados)).toBe('2026-10-23');
        expect(tenencia('2026-10-19', '2026-10-23', feriados)).toMatchObject({ dia: 4, atrasado: false });
    });

    test('retiro en un día no hábil: el día 1 es el primer hábil siguiente', () => {
        expect(diaTenencia('2026-10-24', '2026-10-24')).toBe(1);
        expect(diaTenencia('2026-10-24', '2026-10-26')).toBe(1);
        expect(venceEl('2026-10-24')).toBe('2026-10-29');
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
            .mockResolvedValueOnce([[lote(5, '2026-10-19'), lote(8, '2026-10-20')]])
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
        expect(db.query.mock.calls[0][1]).toEqual([7]);
    });
});
