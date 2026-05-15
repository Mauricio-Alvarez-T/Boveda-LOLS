/**
 * Tests del sistema de Permisos Financieros (Sprint 1).
 *
 * Cubre dos capas:
 *
 *  1) Helper puro `sanitizeFinancialFields` — sin DB:
 *     omite valor_compra / valor_arriendo / costo / agregados financieros
 *     en función del array de permisos.
 *
 *  2) Catálogo de permisos: las 10 claves financieras existen en
 *     `permisos.config.js` (7 en módulo 'Financiero' = inventario; 3 en
 *     sus módulos naturales Asistencia/Trabajadores con prefijo "$" en el
 *     nombre). `PERMISOS_FINANCIEROS` expone sólo el subset de inventario.
 *
 * No requiere DB real — el helper trabaja sobre objetos JS.
 */
const PERMISOS_MAESTRO = require('../src/config/permisos.config');
const { PERMISOS_FINANCIEROS } = require('../src/config/permisos.config');
const {
    has,
    sanitizeItemCosto,
    sanitizeItemsCosto,
    sanitizeResumenInventario,
    sanitizeRegistroBomba,
    sanitizeRegistrosBomba,
    sanitizeTrabajadorFinanciero,
    guardEditCostos,
} = require('../src/utils/sanitizeFinancialFields');

describe('Permisos Financieros — catálogo', () => {
    test('las 10 claves financieras están en el catálogo MAESTRO_PERMISOS', () => {
        const claves = PERMISOS_MAESTRO.map(p => p[0]);
        const esperadas = [
            'inventario.costos.ver',
            'inventario.costos.editar',
            'inventario.facturas.ver',
            'inventario.facturas.gestionar',
            'inventario.bombas.ver_costos',
            'inventario.descuentos.gestionar',
            'inventario.resumen.ver_valores',
            'asistencia.horas_extra.ver',
            'trabajadores.financiero.ver',
            'trabajadores.financiero.editar',
        ];
        esperadas.forEach(clave => {
            expect(claves).toContain(clave);
        });
    });

    test('el módulo "Financiero" contiene sólo los 7 permisos de inventario', () => {
        const financieros = PERMISOS_MAESTRO.filter(p => p[1] === 'Financiero');
        expect(financieros.length).toBe(7);
    });

    test('asistencia.horas_extra.ver vive en módulo Asistencia', () => {
        const fila = PERMISOS_MAESTRO.find(p => p[0] === 'asistencia.horas_extra.ver');
        expect(fila[1]).toBe('Asistencia');
    });

    test('trabajadores.financiero.* viven en módulo Trabajadores', () => {
        const ver = PERMISOS_MAESTRO.find(p => p[0] === 'trabajadores.financiero.ver');
        const ed  = PERMISOS_MAESTRO.find(p => p[0] === 'trabajadores.financiero.editar');
        expect(ver[1]).toBe('Trabajadores');
        expect(ed[1]).toBe('Trabajadores');
    });

    test('PERMISOS_FINANCIEROS exporta exactamente las 7 claves financieras de inventario', () => {
        expect(PERMISOS_FINANCIEROS).toHaveLength(7);
        const modulosFinancieros = PERMISOS_MAESTRO
            .filter(p => p[1] === 'Financiero')
            .map(p => p[0]);
        expect([...PERMISOS_FINANCIEROS].sort()).toEqual(modulosFinancieros.sort());
    });
});

describe('sanitizeFinancialFields — has()', () => {
    test('devuelve true cuando el permiso está presente', () => {
        expect(has(['inventario.costos.ver'], 'inventario.costos.ver')).toBe(true);
    });

    test('devuelve false cuando falta', () => {
        expect(has(['otra'], 'inventario.costos.ver')).toBe(false);
    });

    test('devuelve false con array nulo o no-array', () => {
        expect(has(null, 'x')).toBe(false);
        expect(has(undefined, 'x')).toBe(false);
        expect(has('string', 'x')).toBe(false);
    });
});

describe('sanitizeItemCosto', () => {
    const item = {
        id: 1,
        descripcion: 'Andamio',
        cantidad: 5,
        valor_compra: 10000,
        valor_arriendo: 500,
        valor_arriendo_override: 600,
    };

    test('preserva todos los campos cuando hay permiso', () => {
        const result = sanitizeItemCosto(item, ['inventario.costos.ver']);
        expect(result).toEqual(item);
        expect(result).toBe(item); // misma referencia (micro-optim)
    });

    test('omite valor_compra / valor_arriendo / override sin permiso', () => {
        const result = sanitizeItemCosto(item, []);
        expect(result).not.toHaveProperty('valor_compra');
        expect(result).not.toHaveProperty('valor_arriendo');
        expect(result).not.toHaveProperty('valor_arriendo_override');
        expect(result.id).toBe(1);
        expect(result.descripcion).toBe('Andamio');
        expect(result.cantidad).toBe(5);
    });

    test('maneja null/undefined sin romper', () => {
        expect(sanitizeItemCosto(null, [])).toBeNull();
        expect(sanitizeItemCosto(undefined, [])).toBeUndefined();
    });
});

describe('sanitizeItemsCosto (array)', () => {
    test('limpia cada elemento del array', () => {
        const arr = [
            { id: 1, valor_compra: 100, descripcion: 'a' },
            { id: 2, valor_compra: 200, descripcion: 'b' },
        ];
        const result = sanitizeItemsCosto(arr, []);
        expect(result).toHaveLength(2);
        result.forEach(item => {
            expect(item).not.toHaveProperty('valor_compra');
        });
    });

    test('devuelve el array original sin tocar cuando hay permiso', () => {
        const arr = [{ id: 1, valor_compra: 100 }];
        const result = sanitizeItemsCosto(arr, ['inventario.costos.ver']);
        expect(result).toBe(arr);
    });

    test('passthrough cuando no es array', () => {
        expect(sanitizeItemsCosto(null, [])).toBeNull();
        expect(sanitizeItemsCosto('hola', [])).toBe('hola');
    });
});

describe('sanitizeResumenInventario', () => {
    const resumen = {
        total_items: 50,
        valor_bruto: 1000000,
        valor_neto: 800000,
        subtotal_bruto: 1200000,
        top_obras: [
            { id: 1, nombre: 'O1', cantidad_items: 10, valor_neto: 100000, valor_bruto: 120000, descuento_porcentaje: 10 },
            { id: 2, nombre: 'O2', cantidad_items: 20, valor_neto: 200000, valor_bruto: 220000 },
        ],
        bombas: { eventos: 5, costo_externo: 50000, costo_total: 75000 },
    };

    test('preserva todo con permiso', () => {
        const r = sanitizeResumenInventario(resumen, ['inventario.resumen.ver_valores']);
        expect(r).toBe(resumen);
    });

    test('omite valor_bruto/neto y subtotales top-level sin permiso', () => {
        const r = sanitizeResumenInventario(resumen, []);
        expect(r).not.toHaveProperty('valor_bruto');
        expect(r).not.toHaveProperty('valor_neto');
        expect(r).not.toHaveProperty('subtotal_bruto');
        expect(r.total_items).toBe(50);
    });

    test('omite campos $ en top_obras sin permiso', () => {
        const r = sanitizeResumenInventario(resumen, []);
        r.top_obras.forEach(o => {
            expect(o).not.toHaveProperty('valor_neto');
            expect(o).not.toHaveProperty('valor_bruto');
            expect(o).not.toHaveProperty('descuento_porcentaje');
            expect(o.id).toBeDefined();
            expect(o.nombre).toBeDefined();
            expect(o.cantidad_items).toBeDefined();
        });
    });

    test('omite costo_externo/total en bombas sin permiso', () => {
        const r = sanitizeResumenInventario(resumen, []);
        expect(r.bombas).not.toHaveProperty('costo_externo');
        expect(r.bombas).not.toHaveProperty('costo_total');
        expect(r.bombas.eventos).toBe(5);
    });

    test('no muta el objeto original', () => {
        const copia = JSON.parse(JSON.stringify(resumen));
        sanitizeResumenInventario(resumen, []);
        expect(resumen).toEqual(copia);
    });
});

describe('sanitizeRegistroBomba', () => {
    test('omite costo sin permiso', () => {
        const reg = { id: 1, obra_id: 5, costo: 50000, externa: 1 };
        const r = sanitizeRegistroBomba(reg, []);
        expect(r).not.toHaveProperty('costo');
        expect(r.id).toBe(1);
        expect(r.externa).toBe(1);
    });

    test('preserva costo con permiso', () => {
        const reg = { id: 1, costo: 50000 };
        const r = sanitizeRegistroBomba(reg, ['inventario.bombas.ver_costos']);
        expect(r.costo).toBe(50000);
    });
});

describe('sanitizeRegistrosBomba (array)', () => {
    test('mapea sanitización sobre cada elemento', () => {
        const arr = [{ id: 1, costo: 10 }, { id: 2, costo: 20 }];
        const r = sanitizeRegistrosBomba(arr, []);
        r.forEach(item => expect(item).not.toHaveProperty('costo'));
    });
});

describe('sanitizeTrabajadorFinanciero', () => {
    test('omite campos $ futuros (sueldo, anticipo, bono, etc.) sin permiso', () => {
        const t = {
            id: 1, nombres: 'Juan', apellido_paterno: 'Pérez', rut: '12345678-9',
            sueldo_base: 500000, anticipo: 100000, bono: 50000, valor_hora: 2000,
        };
        const r = sanitizeTrabajadorFinanciero(t, []);
        expect(r).not.toHaveProperty('sueldo_base');
        expect(r).not.toHaveProperty('anticipo');
        expect(r).not.toHaveProperty('bono');
        expect(r).not.toHaveProperty('valor_hora');
        expect(r.nombres).toBe('Juan');
        expect(r.rut).toBe('12345678-9');
    });

    test('preserva todo con permiso', () => {
        const t = { id: 1, sueldo_base: 500000 };
        const r = sanitizeTrabajadorFinanciero(t, ['trabajadores.financiero.ver']);
        expect(r.sueldo_base).toBe(500000);
    });
});

describe('guardEditCostos', () => {
    test('permite cuando el body no toca campos $', () => {
        expect(guardEditCostos({ cantidad: 5 }, [])).toEqual({ ok: true });
    });

    test('permite con permiso aunque el body toque $', () => {
        expect(
            guardEditCostos({ valor_compra: 100 }, ['inventario.costos.editar'])
        ).toEqual({ ok: true });
    });

    test('bloquea cuando el body toca valor_compra sin permiso', () => {
        const r = guardEditCostos({ valor_compra: 100 }, []);
        expect(r.ok).toBe(false);
        expect(r.error).toMatch(/financieros/i);
    });

    test('bloquea cuando el body toca valor_arriendo sin permiso', () => {
        const r = guardEditCostos({ valor_arriendo: 50 }, []);
        expect(r.ok).toBe(false);
    });

    test('bloquea cuando el body toca valor_arriendo_override sin permiso', () => {
        const r = guardEditCostos({ valor_arriendo_override: 60 }, []);
        expect(r.ok).toBe(false);
    });

    test('null/undefined body → ok', () => {
        expect(guardEditCostos(null, [])).toEqual({ ok: true });
        expect(guardEditCostos(undefined, [])).toEqual({ ok: true });
    });
});
