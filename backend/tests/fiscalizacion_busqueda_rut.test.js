/**
 * Búsqueda por texto (`q`) en la búsqueda avanzada de Gestiones
 * (fiscalizacion.service.searchTrabajadores).
 *
 * Regresión: el RUT se guarda FORMATEADO ('19.742.932-1') porque WorkerForm aplica `formatRut` antes de
 * guardar, y esta query comparaba `t.rut LIKE '%19742932%'` contra la columna cruda → teclear el RUT de
 * memoria, sin puntos, no encontraba a nadie. Se pasó a `t.rut_normalized` (columna generada de la
 * migración 053) con el término ya sin separadores, que además es la única variante capaz de usar el
 * índice `idx_trab_rut_norm`.
 *
 * Desde 2026-09-17 la grilla de Gestiones filtra el texto en el navegador y ya no manda `q`; Exportar y
 * Enviar tampoco lo mandan (y `asistencia.service.generarExcel`, que arma el Excel, nunca lo leyó). `q`
 * queda como parámetro público del endpoint: estos tests fijan su contrato para que el arreglo del RUT
 * no se pierda si alguien lo vuelve a usar.
 */
jest.mock('../src/config/db', () => ({
    query: jest.fn(),
}));

const fiscalizacionService = require('../src/services/fiscalizacion.service');
const db = require('../src/config/db');

describe('searchTrabajadores — búsqueda por texto', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        db.query
            .mockResolvedValueOnce([[{ total: 5 }]]) // COUNT tipos_documento obligatorios
            .mockResolvedValueOnce([[]]);            // query principal
    });

    const sqlYParams = () => db.query.mock.calls[1];

    test('usa la columna normalizada, no el RUT crudo', async () => {
        await fiscalizacionService.searchTrabajadores({ q: '19742932' });
        const [sql] = sqlYParams();
        expect(sql).toMatch(/t\.rut_normalized LIKE \?/);
        expect(sql).not.toMatch(/t\.rut LIKE \?/);
    });

    test('el RUT tecleado con puntos llega sin puntos al parámetro (el bug)', async () => {
        await fiscalizacionService.searchTrabajadores({ q: '19.742.932-1' });
        const [, params] = sqlYParams();
        // Primer parámetro tras el COUNT: el del RUT, ya colapsado.
        expect(params[1]).toBe('%197429321%');
        // Los otros tres (nombres, apellidos) conservan el término tal cual.
        expect(params.slice(2, 5)).toEqual(['%19.742.932-1%', '%19.742.932-1%', '%19.742.932-1%']);
    });

    test('sin puntos también busca el mismo cuerpo', async () => {
        await fiscalizacionService.searchTrabajadores({ q: '19742932' });
        const [, params] = sqlYParams();
        expect(params[1]).toBe('%19742932%');
    });

    test('multi-palabra: AND entre bloques, un bloque por palabra', async () => {
        await fiscalizacionService.searchTrabajadores({ q: 'perez juan' });
        const [sql, params] = sqlYParams();
        // Dos bloques de 4 columnas cada uno = 8 parámetros tras el COUNT…
        expect(params.slice(1, 9)).toEqual([
            '%perez%', '%perez%', '%perez%', '%perez%',
            '%juan%', '%juan%', '%juan%', '%juan%',
        ]);
        expect(sql).toMatch(/\) AND \(/);
    });

    test('RUT escrito con espacios: agrega el intento con el texto completo colapsado', async () => {
        await fiscalizacionService.searchTrabajadores({ q: '17 611 988-8' });
        const [sql, params] = sqlYParams();
        expect(sql).toMatch(/ OR t\.rut_normalized LIKE \?/);
        expect(params[params.length - 1]).toBe('%176119888%');
    });

    test('una sola palabra NO agrega el remate colapsado (sería redundante)', async () => {
        await fiscalizacionService.searchTrabajadores({ q: 'perez' });
        const [sql] = sqlYParams();
        expect(sql).not.toMatch(/ OR t\.rut_normalized LIKE \?/);
    });

    test('sin q no entra ninguna condición de texto', async () => {
        await fiscalizacionService.searchTrabajadores({});
        const [sql, params] = sqlYParams();
        expect(sql).not.toMatch(/rut_normalized/);
        expect(params).toEqual([5]);
    });

    test('q en blanco se ignora', async () => {
        await fiscalizacionService.searchTrabajadores({ q: '   ' });
        const [sql] = sqlYParams();
        expect(sql).not.toMatch(/rut_normalized/);
    });
});
