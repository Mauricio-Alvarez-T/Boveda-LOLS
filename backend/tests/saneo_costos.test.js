/**
 * Obras de ejemplo de Presupuestos en staging (saneoCostos.service, 2026-10-16).
 *
 * Lo que fijan:
 *   · son exactamente tres: «Obra demo 1», «Obra demo 2» y «Obra demo 3»,
 *   · se siembra UNA vez por obra: si ya existe no se toca (lo editado al probar no reaparece),
 *   · si las tablas de costos no existen todavía (mig 122 sin correr) no hace nada,
 *   · cada gasto va a una partida que existe en su obra, y las fechas son relativas a hoy
 *     (la vencida queda vencida, la por vencer queda por vencer).
 * `db` se inyecta → mock directo, sin base real.
 */
const costosDemo = require('../src/services/saneoCostos.service');

const HOY = new Date(2026, 9, 16);

/**
 * Mock de BD: `existentes` = nombres de obra que ya están; `marcadas` = obras que ya recibieron
 * superficie y cobros; `tablas` = si existen las tablas de costos.
 */
function dbCon({ existentes = [], marcadas = [], tablas = true } = {}) {
    let id = 100;
    const llamadas = [];
    const creadas = [];
    const idDe = nombre => 10 + ['Obra demo 1', 'Obra demo 2', 'Obra demo 3'].indexOf(nombre);
    const db = {
        llamadas,
        query: jest.fn(async (sql, params) => {
            llamadas.push([sql, params]);
            if (/SELECT 1 FROM costo_(presupuestos|cobros)/.test(sql)) {
                if (!tablas) throw Object.assign(new Error('no existe'), { code: 'ER_NO_SUCH_TABLE', errno: 1146 });
                return [[]];
            }
            if (/SELECT nombre FROM obras/.test(sql)) return [existentes.map(nombre => ({ nombre }))];
            if (/FROM obras o JOIN costo_presupuestos p/.test(sql)) {
                return [[...existentes, ...creadas].map(nombre => ({ obra_id: idDe(nombre), nombre, presupuesto_id: 700 + idDe(nombre) }))];
            }
            if (/FROM costo_historial/.test(sql)) return [marcadas.map(n => ({ obra_id: idDe(n) }))];
            if (/INSERT INTO obras/.test(sql)) { creadas.push(params[0]); return [{ insertId: idDe(params[0]) }]; }
            if (/FROM empresas/.test(sql)) return [[{ id: 1 }]];
            if (/FROM usuarios/.test(sql)) return [[{ id: 9 }]];
            if (/INSERT INTO costo_partidas/.test(sql)) {
                db.ultimasPartidas = params[0];
                return [{ affectedRows: params[0].length }];
            }
            if (/SELECT id, codigo FROM costo_partidas/.test(sql)) {
                return [db.ultimasPartidas.map((p, i) => ({ id: 500 + i, codigo: p[2] }))];
            }
            if (/^\s*INSERT/.test(sql)) return [{ insertId: ++id }];
            return [[]];
        }),
    };
    return db;
}

describe('saneoCostos — obras de ejemplo de Presupuestos', () => {
    test('son tres, con esos nombres, y cada una tiene partidas', () => {
        expect(costosDemo.NOMBRES_DEMO).toEqual(['Obra demo 1', 'Obra demo 2', 'Obra demo 3']);
        costosDemo.OBRAS_DEMO.forEach(o => expect(o.partidas.length).toBeGreaterThan(0));
    });

    test('cada gasto apunta a un ítem que existe en su propia obra', () => {
        for (const o of costosDemo.OBRAS_DEMO) {
            const items = new Set(o.partidas.map(p => p[1]));
            o.gastos.filter(g => g[6]).forEach(g => expect(items.has(g[6])).toBe(true));
        }
    });

    test('sin las tablas de costos (mig 122 sin correr) no hay nada pendiente ni se siembra', async () => {
        const db = dbCon({ tablas: false });
        expect(await costosDemo.pendiente(db)).toBe(false);
        expect(await costosDemo.sembrar(db, { hoy: HOY })).toEqual({ obras: 0, partidas: 0, gastos: 0, cobros: 0 });
        expect(db.llamadas.some(([sql]) => /INSERT/.test(sql))).toBe(false);
    });

    test('con las tres ya creadas y completas no toca nada (lo editado al probar no reaparece)', async () => {
        const todas = ['Obra demo 1', 'Obra demo 2', 'Obra demo 3'];
        const db = dbCon({ existentes: todas, marcadas: todas });
        expect(await costosDemo.pendiente(db)).toBe(false);
        await costosDemo.sembrar(db, { hoy: HOY });
        expect(db.llamadas.some(([sql]) => /INSERT/.test(sql))).toBe(false);
    });

    test('siembra solo las que faltan, con presupuesto, partidas, gastos e historial', async () => {
        const db = dbCon({ existentes: ['Obra demo 2'] });
        expect(await costosDemo.pendiente(db)).toBe(true);
        const r = await costosDemo.sembrar(db, { hoy: HOY });

        const obrasCreadas = db.llamadas.filter(([sql]) => /INSERT INTO obras/.test(sql)).map(([, p]) => p[0]);
        expect(obrasCreadas).toEqual(['Obra demo 1', 'Obra demo 3']);
        const d1 = costosDemo.OBRAS_DEMO[0], d3 = costosDemo.OBRAS_DEMO[2];
        const nCobros = Object.values(costosDemo.EXTRAS).reduce((t, e) => t + e.cobros.length, 0);
        expect(r).toEqual({ obras: 2, partidas: d1.partidas.length + d3.partidas.length, gastos: d1.gastos.length, cobros: nCobros });
        // Historial: «datos de ejemplo» de las 2 nuevas + la marca de superficie y cobros de las 3.
        expect(db.llamadas.filter(([sql]) => /INSERT INTO costo_historial/.test(sql))).toHaveLength(5);

        // es_prueba = 0: con 1 la obra se escondería de los selectores y del propio módulo.
        expect(db.llamadas.find(([sql]) => /INSERT INTO obras/.test(sql))[0]).toMatch(/1, 0\)/);
    });

    test('a las obras demo que ya existían se les agrega superficie y cobros una sola vez', async () => {
        const todas = ['Obra demo 1', 'Obra demo 2', 'Obra demo 3'];
        const db = dbCon({ existentes: todas, marcadas: ['Obra demo 3'] });
        expect(await costosDemo.pendiente(db)).toBe(true);
        const r = await costosDemo.sembrar(db, { hoy: HOY });
        expect(db.llamadas.some(([sql]) => /INSERT INTO obras/.test(sql))).toBe(false);
        expect(r.cobros).toBe(costosDemo.EXTRAS['Obra demo 1'].cobros.length + costosDemo.EXTRAS['Obra demo 2'].cobros.length);
        // La superficie no pisa una que alguien ya escribió.
        const upd = db.llamadas.filter(([sql]) => /UPDATE costo_presupuestos SET superficie_m2/.test(sql));
        expect(upd.map(([sql, p]) => [/superficie_m2 IS NULL/.test(sql), p[0]])).toEqual([[true, 210], [true, 120]]);
        // EP 2 de la Obra demo 1: en 10 días, con IVA y 5 % de retención, por cobrar.
        const ep2 = db.llamadas.find(([sql, p]) => /INSERT INTO costo_cobros/.test(sql) && p[0] === 10 && p[2] === 'EP 2')[1];
        expect(ep2).toEqual([10, '2026-10-26', 'EP 2', 6500000, 1235000, 325000, 'por_cobrar', null, 9]);
        const marcas = db.llamadas.filter(([sql, p]) => /INSERT INTO costo_historial/.test(sql) && String(p[2]).startsWith(costosDemo.MARCA_EXTRAS));
        expect(marcas).toHaveLength(2);
    });

    test('fechas relativas a hoy: la factura vencida queda vencida y la por vencer, por vencer', async () => {
        const db = dbCon();
        await costosDemo.sembrar(db, { hoy: HOY });
        const gastos = db.llamadas.filter(([sql]) => /INSERT INTO costo_gastos/.test(sql)).map(([, p]) => p);
        const arriendo = gastos.find(p => p[3] === 'Arriendos Faena SpA');
        const melon = gastos.find(p => p[3] === 'Melón Hormigones');
        expect(arriendo[10]).toBe('por_pagar');
        expect(arriendo[11]).toBe('2026-10-06');          // venció hace 10 días
        expect(melon[11]).toBe('2026-11-15');             // vence en 30 días
        expect(melon[9]).toBeGreaterThanOrEqual(500);     // va a la partida 2.2 (id del mock)
        // La boleta sin completar: sin proveedor, sin partida, sin categoría.
        const boleta = gastos.find(p => p[7] === 89900);
        expect([boleta[3], boleta[8], boleta[9]]).toEqual([null, null, null]);
    });
});
