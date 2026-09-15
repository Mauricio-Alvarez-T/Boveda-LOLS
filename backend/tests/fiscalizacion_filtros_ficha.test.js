/**
 * Filtros nuevos de la grilla de Trabajadores (2026-09-15): falta en la ficha, le falta este
 * documento, vigencia de papeles, salió entre, no recontratar, finiquito pendiente y fichas de
 * prueba. Más los dos arreglos que entraron con ellos (ausentes en hora del servidor + fila
 * vigente, y el predicado de vigencia en el conteo de completitud).
 *
 * Mismo molde que fiscalizacion_filtros.test.js: se mockea `db` y se lee la SEGUNDA llamada
 * (`db.query.mock.calls[1]`), porque la primera es el COUNT de tipos obligatorios.
 */
const db = require('../src/config/db');
const fiscalizacionService = require('../src/services/fiscalizacion.service');

jest.mock('../src/config/db', () => ({ query: jest.fn() }));

/** Permisos de quien SÍ puede ver los datos personales de la ficha. */
const CON_PERSONAL = ['documentos.ver', 'trabajadores.ver'];
const SIN_PERSONAL = ['documentos.ver'];

const correr = async (filtros, perms = CON_PERSONAL) => {
    db.query.mockReset();
    db.query.mockResolvedValueOnce([[{ total: 5 }]]).mockResolvedValueOnce([[]]);
    await fiscalizacionService.searchTrabajadores(filtros, perms);
    const [sql, params] = db.query.mock.calls[1];
    return { sql, params };
};

describe('falta en la ficha (falta_dato)', () => {
    test('contrato: pregunta por los cinco datos personales que imprime el contrato', async () => {
        const { sql, params } = await correr({ falta_dato: 'contrato' });
        expect(sql).toContain('t.nacionalidad IS NULL');
        expect(sql).toContain('t.estado_civil IS NULL');
        expect(sql).toContain('t.fecha_nacimiento IS NULL');
        expect(sql).toContain('t.direccion IS NULL');
        expect(sql).toContain('t.comuna IS NULL');
        expect(params).toEqual([5]);                      // sin params: no mueve el array
    });

    test('pago: solo cuenta como incompleto si NO tiene cuenta RUT', async () => {
        const { sql } = await correr({ falta_dato: 'pago' });
        expect(sql).toContain('COALESCE(t.cuenta_rut, 0) = 0');
        expect(sql).toContain("COALESCE(t.banco, '') = ''");
        expect(sql).toContain("COALESCE(t.numero_cuenta, '') = ''");
    });

    test('tallas: las tres', async () => {
        const { sql } = await correr({ falta_dato: 'tallas' });
        expect(sql).toContain('t.talla_calzado IS NULL');
        expect(sql).toContain('t.talla_pantalon IS NULL');
        expect(sql).toContain("COALESCE(t.talla_polera, '') = ''");
    });

    test('sin trabajadores.ver se ignora contrato y pago, pero tallas sí aplica', async () => {
        const contrato = await correr({ falta_dato: 'contrato' }, SIN_PERSONAL);
        expect(contrato.sql).not.toContain('t.nacionalidad IS NULL');

        const pago = await correr({ falta_dato: 'pago' }, SIN_PERSONAL);
        expect(pago.sql).not.toContain('t.cuenta_rut');

        // Las tallas están en la allow-list operativa: sirven para comprar EPP, no identifican nada.
        const tallas = await correr({ falta_dato: 'tallas' }, SIN_PERSONAL);
        expect(tallas.sql).toContain('t.talla_calzado IS NULL');
    });

    test('un valor fuera de la lista blanca no toca la query', async () => {
        const { sql, params } = await correr({ falta_dato: 'cualquier_cosa' });
        expect(sql).not.toContain('t.nacionalidad');
        expect(sql).not.toContain('t.talla_calzado');
        expect(sql).not.toContain('t.cuenta_rut');
        expect(params).toEqual([5]);
    });

    test('la lista blanca es un Map: constructor/__proto__ no se interpolan', async () => {
        for (const veneno of ['constructor', '__proto__', 'toString', 'valueOf']) {
            const { sql, params } = await correr({ falta_dato: veneno });
            expect(sql).toContain('ORDER BY');
            expect(sql).not.toMatch(/function|\[object/i);
            expect(params).toEqual([5]);
        }
    });
});

describe('le falta este documento (doc_tipo_falta)', () => {
    test('NOT EXISTS por tipo_documento_id, nunca por codigo', async () => {
        const { sql, params } = await correr({ doc_tipo_falta: '11' });
        expect(sql).toContain('NOT EXISTS');
        expect(sql).toContain('d.tipo_documento_id = ?');
        expect(sql).not.toContain('td.codigo');
        expect(params).toEqual([5, 11]);                  // parseado a número
    });

    test('valores no numéricos o <= 0 se ignoran', async () => {
        for (const v of ['abc', '0', '-3', '', 'DROP TABLE']) {
            const { sql, params } = await correr({ doc_tipo_falta: v });
            expect(sql).not.toContain('NOT EXISTS');
            expect(params).toEqual([5]);
        }
    });
});

describe('vigencia de papeles (doc_vigencia)', () => {
    test('vencido: EXISTS con fecha menor a hoy, sin parámetro', async () => {
        const { sql, params } = await correr({ doc_vigencia: 'vencido' });
        expect(sql).toContain('d.fecha_vencimiento < CURDATE()');
        expect(sql).toContain('d.fecha_vencimiento IS NOT NULL');
        expect(params).toEqual([5]);
    });

    test('por vencer: solo 30, 60 y 90 días', async () => {
        for (const [valor, dias] of [['30', 30], ['60', 60], ['90', 90]]) {
            const { sql, params } = await correr({ doc_vigencia: valor });
            expect(sql).toContain('BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL ? DAY)');
            expect(params).toEqual([5, dias]);
        }
    });

    test('un plazo arbitrario no entra', async () => {
        for (const v of ['365', '1 OR 1=1', 'constructor']) {
            const { sql, params } = await correr({ doc_vigencia: v });
            expect(sql).not.toContain('DATE_ADD');
            expect(params).toEqual([5]);
        }
    });
});

describe('salió entre (rango de fecha_desvinculacion)', () => {
    test('rango inclusivo por ambos extremos', async () => {
        const { sql, params } = await correr({ fecha_desvinc_desde: '2026-08-01', fecha_desvinc_hasta: '2026-08-31' });
        expect(sql).toContain('t.fecha_desvinculacion >= ?');
        expect(sql).toContain('t.fecha_desvinculacion <= ?');
        expect(params).toEqual([5, '2026-08-01', '2026-08-31']);
    });

    test('formato inválido se ignora, igual que el rango de ingreso', async () => {
        const { sql, params } = await correr({ fecha_desvinc_desde: '2026-8-1', fecha_desvinc_hasta: "2026-08-31' OR 1=1" });
        expect(sql).not.toContain('t.fecha_desvinculacion');
        expect(params).toEqual([5]);
    });

    test('convive con el rango de ingreso sin pisarlo', async () => {
        const { sql, params } = await correr({
            fecha_ingreso_desde: '2026-01-01',
            fecha_desvinc_hasta: '2026-08-31',
        });
        expect(sql).toContain('t.fecha_ingreso >= ?');
        expect(sql).toContain('t.fecha_desvinculacion <= ?');
        // El de ingreso va primero: el orden de los bloques importa para los tests existentes.
        expect(params).toEqual([5, '2026-01-01', '2026-08-31']);
    });
});

describe('no recontratar', () => {
    test('con trabajadores.ver filtra por la columna', async () => {
        const { sql, params } = await correr({ no_recontratar: 'true' });
        expect(sql).toContain('t.no_recontratar = 1');
        expect(params).toEqual([5]);
    });

    test('sin trabajadores.ver se ignora: es un juicio sobre una persona', async () => {
        const { sql } = await correr({ no_recontratar: 'true' }, SIN_PERSONAL);
        expect(sql).not.toContain('t.no_recontratar');
    });

    test('cualquier valor distinto de true/1 no filtra', async () => {
        for (const v of ['false', '0', 'sí', '']) {
            const { sql } = await correr({ no_recontratar: v });
            expect(sql).not.toContain('t.no_recontratar');
        }
    });
});

describe('finiquito pendiente', () => {
    test('exige desvinculado y sin documento de tipo FINIQUITO', async () => {
        const { sql, params } = await correr({ finiquito: 'pendiente' });
        expect(sql).toContain('t.activo = 0');
        expect(sql).toContain("td2.codigo = 'FINIQUITO'");
        expect(sql).toContain('NOT EXISTS');
        expect(params).toEqual([5]);
    });

    test('otro valor no filtra', async () => {
        const { sql } = await correr({ finiquito: 'emitido' });
        expect(sql).not.toContain('FINIQUITO');
    });
});

describe('fichas de prueba', () => {
    test('aisla las de prueba', async () => {
        const { sql } = await correr({ solo_prueba: 'true' });
        expect(sql).toContain('t.es_prueba = 1');
    });

    test('no choca con la exclusión por defecto de es_prueba', async () => {
        // Gestiones manda incluir_prueba=true; sin él, la query excluye es_prueba = 0 y el filtro
        // de "solo prueba" daría siempre vacío. Se comprueba que ambos predicados conviven.
        const { sql } = await correr({ solo_prueba: 'true', incluir_prueba: 'true' });
        expect(sql).toContain('t.es_prueba = 1');
        expect(sql).not.toContain('t.es_prueba = 0');
    });
});

describe('arreglos que entraron con la tanda', () => {
    test('ausentes usa la fecha del servidor, no UTC', async () => {
        const { sql, params } = await correr({ ausentes: 'true' });
        expect(sql).toContain('WHERE fecha = CURDATE()');
        expect(params).toEqual([5]);                      // ya no empuja la fecha calculada en JS
        expect(sql).not.toContain('a.fecha = ?');
    });

    test('ausentes aplica la regla de fila vigente (traslados)', async () => {
        const { sql } = await correr({ ausentes: 'true' });
        expect(sql).toContain('MAX(id) AS mid');
        expect(sql).toContain('v.mid = a.id');
        expect(sql).toContain('ea.es_presente = FALSE');
    });

    test('el conteo de completitud descarta los documentos vencidos', async () => {
        const { sql } = await correr({});
        expect(sql).toContain('td.dias_vigencia IS NULL OR d.fecha_vencimiento IS NULL OR d.fecha_vencimiento >= CURDATE()');
    });
});

describe('combinación', () => {
    test('todos juntos producen una sola query válida y los params en orden', async () => {
        const { sql, params } = await correr({
            obra_id: '7',
            fecha_ingreso_desde: '2026-01-01',
            falta_dato: 'tallas',
            doc_tipo_falta: '11',
            doc_vigencia: '60',
            fecha_desvinc_hasta: '2026-08-31',
            no_recontratar: 'true',
            finiquito: 'pendiente',
            solo_prueba: 'true',
        });
        // El ORDER BY va al final: ningún bloque se coló después.
        expect(sql.trim().endsWith('t.nombres ASC')).toBe(true);
        expect(sql.indexOf('ORDER BY')).toBeGreaterThan(sql.lastIndexOf('AND t.es_prueba = 1'));
        expect(params).toEqual([5, '7', '2026-01-01', 11, 60, '2026-08-31']);
    });
});
