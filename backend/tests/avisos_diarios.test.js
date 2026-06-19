/**
 * Tests del motor del Resumen de Novedades (avisosDiarios.service).
 * `db` se inyecta como parámetro → mock directo, sin jest.mock.
 */
const svc = require('../src/services/avisosDiarios.service');

describe('avisosDiarios.service', () => {
    test('getDiaPrevio devuelve la ventana del día ANTERIOR a la fecha dada', () => {
        const r = svc.getDiaPrevio('2026-06-19');
        expect(r.desde).toBe('2026-06-18 00:00:00');
        expect(r.hasta).toBe('2026-06-19 00:00:00');
    });

    test('construirResumen incluye categorías que cruzan el umbral y excluye las que no', async () => {
        const reglas = [
            { categoria: 'trabajadores', etiqueta: 'Trabajadores nuevos', umbral: 3 },
            { categoria: 'obras', etiqueta: 'Obras nuevas', umbral: 1 },
        ];
        const db = {
            query: jest.fn(async (sql, params) => {
                if (/FROM avisos_reglas/.test(sql)) return [reglas];
                if (params && params.includes('trabajadores')) return [[{ entidad_label: 'A' }, { entidad_label: 'B' }]]; // 2 < 3 → excluida
                if (params && params.includes('obras')) return [[{ entidad_label: 'Obra X', usuario: 'Marco' }]];          // 1 >= 1 → incluida
                return [[]];
            }),
        };

        const res = await svc.construirResumen(db, { desde: 'a', hasta: 'b', label: 'c' });
        const keys = res.categorias.map(c => c.key);

        expect(keys).toContain('obras');
        expect(keys).not.toContain('trabajadores');
        expect(res.total).toBe(1);
        expect(res.categorias[0].muestras[0]).toEqual({ label: 'Obra X', usuario: 'Marco' });
    });

    test('construirResumen tolera que la tabla avisos_reglas no exista todavía (errno 1146)', async () => {
        const db = { query: jest.fn(async () => { const e = new Error('no table'); e.errno = 1146; throw e; }) };
        const res = await svc.construirResumen(db, { desde: 'a', hasta: 'b', label: 'c' });
        expect(res).toEqual({ rango: { desde: 'a', hasta: 'b', label: 'c' }, categorias: [], total: 0 });
    });
});
