/**
 * Tests del motor del Resumen de Novedades (avisosDiarios.service) — reporte con
 * aviso de "lo que falta". `db` se inyecta como parámetro → mock directo, sin jest.mock.
 */
const svc = require('../src/services/avisosDiarios.service');

describe('avisosDiarios.service', () => {
    test('getDiaPrevio devuelve la ventana del día ANTERIOR a la fecha dada', () => {
        const r = svc.getDiaPrevio('2026-06-19');
        expect(r.desde).toBe('2026-06-18 00:00:00');
        expect(r.hasta).toBe('2026-06-19 00:00:00');
    });

    test('obras: lista las nuevas y marca datos vacíos como faltantes', async () => {
        const reglas = [{ categoria: 'obras', etiqueta: 'Obras nuevas', umbral: 1 }];
        const db = {
            query: jest.fn(async (sql) => {
                if (/FROM avisos_reglas/.test(sql)) return [reglas];
                if (/FROM obras/.test(sql)) return [[
                    { id: 1, nombre: 'Edificio Norte', direccion: null, encargado_nombre: 'Juan', fecha_inicio: '2026-01-01' },
                    { id: 2, nombre: 'Plaza Sur', direccion: 'Calle 1', encargado_nombre: 'Ana', fecha_inicio: '2026-01-01' },
                ]];
                return [[]];
            }),
        };
        const res = await svc.construirResumen(db, { desde: 'a', hasta: 'b', label: 'c' });
        const obras = res.categorias.find(c => c.key === 'obras');
        expect(obras.count).toBe(2);
        expect(obras.conFaltantes).toBe(1);
        expect(obras.items.find(i => i.label === 'Edificio Norte').faltantes).toContain('sin dirección');
        expect(obras.items.find(i => i.label === 'Plaza Sur').faltantes).toEqual([]);
        expect(res.total).toBe(2);
    });

    test('trabajadores: marca campos clave vacíos + documentos obligatorios pendientes', async () => {
        const reglas = [{ categoria: 'trabajadores', etiqueta: 'Trabajadores nuevos', umbral: 1 }];
        const db = {
            query: jest.fn(async (sql) => {
                if (/FROM avisos_reglas/.test(sql)) return [reglas];
                if (/CROSS JOIN tipos_documento/.test(sql)) return [[{ trabajador_id: 5, faltan: 2 }]];
                if (/FROM trabajadores/.test(sql)) return [[
                    { id: 5, nombres: 'Ana', apellido_paterno: 'Soto', apellido_materno: null, rut: '1-9', cargo_id: null, obra_id: 3, empresa_id: 2 },
                ]];
                return [[]];
            }),
        };
        const res = await svc.construirResumen(db, { desde: 'a', hasta: 'b', label: 'c' });
        const trab = res.categorias.find(c => c.key === 'trabajadores');
        expect(trab.count).toBe(1);
        const item = trab.items[0];
        expect(item.label).toBe('Ana Soto');
        expect(item.faltantes).toContain('sin cargo');
        expect(item.faltantes).toContain('2 documento(s) obligatorio(s) pendiente(s)');
        expect(item.faltantes).not.toContain('sin obra'); // obra_id presente
    });

    test('vehículos: marca documentos esperados que no se cargaron', async () => {
        const reglas = [{ categoria: 'vehiculos', etiqueta: 'Vehículos nuevos', umbral: 1 }];
        const db = {
            query: jest.fn(async (sql) => {
                if (/FROM avisos_reglas/.test(sql)) return [reglas];
                if (/FROM vehiculo_documentos/.test(sql)) return [[{ vehiculo_id: 7, categoria: 'poliza' }]];
                if (/FROM vehiculos/.test(sql)) return [[{ id: 7, patente: 'ABCD12', marca: 'Toyota', modelo: 'Hilux' }]];
                return [[]];
            }),
        };
        const res = await svc.construirResumen(db, { desde: 'a', hasta: 'b', label: 'c' });
        const veh = res.categorias.find(c => c.key === 'vehiculos');
        expect(veh.items[0].label).toBe('ABCD12 · Toyota Hilux');
        expect(veh.items[0].faltantes).toHaveLength(3); // 4 esperados − póliza presente
        expect(veh.items[0].faltantes).toContain('falta permiso de circulación');
    });

    test('una categoría con pocos registros igual aparece si hay pendientes (umbral alto)', async () => {
        const reglas = [{ categoria: 'obras', etiqueta: 'Obras nuevas', umbral: 10 }];
        const db = {
            query: jest.fn(async (sql) => {
                if (/FROM avisos_reglas/.test(sql)) return [reglas];
                if (/FROM obras/.test(sql)) return [[{ id: 1, nombre: 'Obra X', direccion: null, encargado_nombre: null, fecha_inicio: null }]];
                return [[]];
            }),
        };
        const res = await svc.construirResumen(db, { desde: 'a', hasta: 'b', label: 'c' });
        expect(res.categorias.map(c => c.key)).toContain('obras'); // 1 < 10 pero hay pendientes
    });

    test('construirResumen tolera que la tabla avisos_reglas no exista todavía (errno 1146)', async () => {
        const db = { query: jest.fn(async () => { const e = new Error('no table'); e.errno = 1146; throw e; }) };
        const res = await svc.construirResumen(db, { desde: 'a', hasta: 'b', label: 'c' });
        expect(res).toEqual({ rango: { desde: 'a', hasta: 'b', label: 'c' }, categorias: [], total: 0, modo: 'diario' });
    });

    test('getRangoHistorico cubre todo hasta hoy (desde antiguo, hasta = inicio de mañana)', () => {
        const r = svc.getRangoHistorico('2026-06-22');
        expect(r.desde).toBe('2000-01-01 00:00:00');
        expect(r.hasta).toBe('2026-06-23 00:00:00');
        expect(r.label).toBe('22 jun 2026');
    });

    test('modo histórico funciona sin la tabla avisos_reglas (usa categorías por defecto)', async () => {
        const db = {
            query: jest.fn(async (sql) => {
                if (/FROM avisos_reglas/.test(sql)) { const e = new Error('no table'); e.errno = 1146; throw e; }
                if (/FROM obras/.test(sql)) return [[{ id: 1, nombre: 'Obra Z', direccion: null, encargado_nombre: null, fecha_inicio: null }]];
                return [[]]; // trabajadores, vehiculos, docs, logs → vacíos
            }),
        };
        const res = await svc.construirResumen(db, { desde: 'a', hasta: 'b', label: 'c' }, { modo: 'historico' });
        expect(res.modo).toBe('historico');
        expect(res.categorias.map(c => c.key)).toContain('obras'); // categoría por defecto, sin tabla de config
    });
});
