jest.mock('../src/config/db', () => ({
    query: jest.fn(),
    getConnection: jest.fn(),
}));

const fs = require('fs');
const path = require('path');
const db = require('../src/config/db');
const transferenciaService = require('../src/services/transferencia.service');

/**
 * Fichas de la tarjeta «Inventario» del Inicio (opción A «Fichas por solicitud», 2026-10-22):
 * GET /api/transferencias/inicio/fichas devuelve las solicitudes detrás de las cifras de resumenInicio, con sus
 * ítems y lo que el usuario puede hacer con cada una. Mismo alcance que los conteos, sin N+1 y sin $.
 */

const P = (...k) => k.map(x => (x.includes('.') ? x : `inventario.transferencias.${x}`));

// Filas que «devuelve la BD» por etapa e ítems/diferencias en lote; cada test arma las suyas.
let filas;
function mockBD() {
    db.query.mockImplementation(async (sql) => {
        if (sql.includes('COUNT(')) return [[{ n: 0, dias: null }]];
        const etapa = sql.match(/'(\w+)' AS etapa/);
        if (etapa) return [filas[etapa[1]] || []];
        if (sql.includes('FROM transferencia_items_custom tic')) return [filas.custom || []];
        if (sql.includes('FROM transferencia_items ti')) return [filas.items || []];
        if (sql.includes('FROM transferencia_discrepancias d')) return [filas.diferencias || []];
        return [[]];
    });
}
const llamadas = () => db.query.mock.calls.map(([sql, params]) => ({ sql, params: params || [] }));
const deEtapa = () => llamadas().filter(c => /' AS etapa/.test(c.sql));
const etapaDe = (sql) => sql.match(/'(\w+)' AS etapa/)[1];
const lote = (marca) => llamadas().filter(c => c.sql.includes(marca) && !/' AS etapa/.test(c.sql));
const trf = (id, extra = {}) => ({
    id, codigo: `TRF-${id}`, estado: 'pendiente', tipo_flujo: 'solicitud', solicitante_id: 50, aprobador_id: null,
    transportista_id: null, destino_bodega_id: null, origen_nombre: 'Bodega Central', destino_nombre: 'Obra Uno',
    solicitante_nombre: 'Ana Rojas', dias: 1, dias_hasta_limite: 9, ...extra,
});

beforeEach(() => {
    jest.clearAllMocks();
    filas = {};
    mockBD();
});

describe('fichasInicio: alcance idéntico a resumenInicio', () => {
    // Grupo de resumenInicio al que corresponde cada COUNT (mis_solicitudes no genera fichas).
    const grupoResumen = (sql) => {
        if (sql.includes('transferencia_discrepancias')) return 'discrepancias';
        if (sql.includes("'pendiente', 'aprobada'")) return 'mis_solicitudes';
        if (sql.includes("t.estado = 'pendiente'")) return 'por_aprobar';
        if (sql.includes("t.estado = 'aprobada'")) return 'por_despachar';
        if (sql.includes("IN ('en_transito', 'recepcion_parcial')")) return 'por_recibir';
        return '?';
    };
    // Condiciones después de «WHERE t.activo = 1» (sin el ORDER BY). La única diferencia admitida: las fichas usan
    // EXISTS en vez del JOIN de resumenInicio (el JOIN repetiría una ficha por cada ítem con diferencia).
    const condiciones = (sql) => {
        const s = sql.replace(/\s+/g, ' ');
        const marca = 'WHERE t.activo = 1';
        expect(s).toContain(marca);
        return s.slice(s.indexOf(marca) + marca.length)
            .replace(/ ORDER BY .*$/, '')
            .replace(
                " AND EXISTS (SELECT 1 FROM transferencia_discrepancias d WHERE d.transferencia_id = t.id AND d.estado = 'pendiente' AND d.diferencia <> 0)",
                " AND d.estado = 'pendiente' AND d.diferencia <> 0"
            )
            .trim();
    };

    const perfiles = [
        ['aprobador con visión global', { id: 7, p: P('inventario.ver', 'aprobar', 'despachar', 'recibir', 'ver_todas') }],
        ['bodeguero sin ver_todas', { id: 9, bodega_id: 2, p: P('inventario.ver', 'despachar', 'recibir') }],
        ['receptor sin bodega ni ver_todas', { id: 12, p: P('inventario.ver', 'recibir') }],
        ['aprobador sin ver_todas', { id: 13, p: P('inventario.ver', 'aprobar', 'recibir') }],
        ['solo solicitante', { id: 11, p: P('inventario.ver', 'solicitar') }],
        // Mig 131 (Daphne): ve las diferencias sin aprobar; ni por aprobar ni por recibir.
        ['jefatura con diferencias_ver', { id: 14, p: P('inventario.ver', 'diferencias_ver', 'cancelar', 'ver_todas') }],
        ['diferencias_ver sin ver_todas', { id: 15, p: P('inventario.ver', 'diferencias_ver', 'recibir') }],
    ];

    test.each(perfiles)('%s: mismas etapas, condiciones y parámetros', async (_nombre, user) => {
        const resumen = await transferenciaService.resumenInicio(user);
        const delResumen = {};
        llamadas().forEach(c => { delResumen[grupoResumen(c.sql)] = c; });
        delete delResumen.mis_solicitudes;

        db.query.mockClear();
        const r = await transferenciaService.fichasInicio(user, { limite: 30 });
        expect(r.conteos).toEqual(resumen);
        const deFichas = {};
        deEtapa().forEach(c => { deFichas[etapaDe(c.sql)] = c; });

        expect(Object.keys(deFichas).sort()).toEqual(Object.keys(delResumen).sort());
        Object.keys(delResumen).forEach(g => {
            expect(condiciones(deFichas[g].sql)).toBe(condiciones(delResumen[g].sql));
            // Último parámetro = LIMIT (número); el resto, los mismos del conteo.
            expect(deFichas[g].params.slice(0, -1)).toEqual(delResumen[g].params);
            expect(deFichas[g].params[deFichas[g].params.length - 1]).toBe(30);
        });
    });

    test('bodeguero: el alcance es «las propias + las destinadas a su bodega»', async () => {
        await transferenciaService.fichasInicio({ id: 9, bodega_id: 2, p: P('recibir') });
        const [c] = deEtapa();
        expect(c.sql).toMatch(/t\.solicitante_id = \? OR t\.destino_bodega_id = \?/);
        expect(c.params).toEqual([9, 2, 50]);
    });

    test('limit por etapa: por defecto 50, máximo 100, siempre número', async () => {
        const user = { id: 7, p: P('aprobar') };
        await transferenciaService.fichasInicio(user);
        await transferenciaService.fichasInicio(user, { limite: '500' });
        await transferenciaService.fichasInicio(user, { limite: 'abc' });
        const limites = deEtapa().map(c => c.params[c.params.length - 1]);
        expect(limites).toEqual([50, 50, 100, 100, 50, 50]);
    });
});

describe('fichasInicio: consultas', () => {
    const aprobador = { id: 7, p: P('aprobar', 'ver_todas') };

    test('sin N+1: 20 solicitudes → una consulta de ítems con IN y las mismas consultas que con 1', async () => {
        filas.por_aprobar = [trf(1)];
        await transferenciaService.fichasInicio(aprobador);
        const conUna = db.query.mock.calls.length;

        db.query.mockClear();
        filas.por_aprobar = Array.from({ length: 20 }, (_, i) => trf(i + 1));
        const r = await transferenciaService.fichasInicio(aprobador);
        expect(r.fichas).toHaveLength(20);
        expect(db.query.mock.calls.length).toBe(conUna);
        const items = lote('FROM transferencia_items ti');
        expect(items).toHaveLength(1);
        expect(items[0].sql).toMatch(/ti\.transferencia_id IN \(\?\)/);
        expect(items[0].params).toEqual([Array.from({ length: 20 }, (_, i) => i + 1)]);
        expect(lote('FROM transferencia_items_custom tic')).toHaveLength(1);
        // Sin fichas en la etapa diferencias no se piden diferencias.
        expect(lote('FROM transferencia_discrepancias d')).toHaveLength(0);
        // resumenInicio (5) + 2 etapas + ítems + personalizados.
        expect(db.query.mock.calls.length).toBeLessThanOrEqual(5 + 4 + 3);
    });

    test('sin $: ningún SQL pide valor_* ni i.*, y la ficha no deja pasar columnas que no son del contrato', async () => {
        filas.por_aprobar = [trf(1, { valor_compra: 1000 })];
        filas.discrepancias = [trf(2, { estado: 'recibida' })];
        filas.items = [{ transferencia_id: 1, id: 10, nombre: 'Andamio', unidad: 'UN', cantidad_solicitada: '4.0000', cantidad_recibida: null, valor_compra: 999, valor_arriendo: 5 }];
        filas.custom = [{ transferencia_id: 1, id: 20, nombre: 'Cinta', unidad: null, cantidad: 2, cantidad_aprobada: null, cantidad_recibida: 0, valor_compra: 1 }];
        filas.diferencias = [{ transferencia_id: 2, id: 30, nombre: 'Tablón', unidad: 'UN', cantidad_enviada: 5, cantidad_recibida: 3, diferencia: 2, valor_compra: 7 }];
        const r = await transferenciaService.fichasInicio({ id: 7, p: P('aprobar', 'ver_todas', 'recibir', 'despachar') });
        llamadas().forEach(({ sql }) => {
            expect(sql).not.toMatch(/valor_/);
            expect(sql).not.toMatch(/\bi\.\*/);
            expect(sql).not.toMatch(/\bt\.\*/);
        });
        expect(JSON.stringify(r)).not.toMatch(/valor_/);
        const f1 = r.fichas.find(f => f.id === 1);
        expect(Object.keys(f1).sort()).toEqual([
            'accion', 'bloqueo', 'codigo', 'destino_nombre', 'dias', 'diferencias', 'estado', 'estancada', 'etapa',
            'faltan', 'id', 'items', 'origen_nombre', 'sobran', 'solicitante_id', 'solicitante_nombre', 'tipo_flujo',
        ]);
        f1.items.forEach(i => expect(Object.keys(i).sort()).toEqual(['cantidad', 'id', 'nombre', 'recibida', 'unidad']));
    });

    test('sin filas: fichas [] y no se lanzan las consultas en lote (un IN () vacío da error)', async () => {
        const r = await transferenciaService.fichasInicio({ id: 7, p: P('aprobar', 'despachar', 'recibir', 'ver_todas') });
        expect(r.fichas).toEqual([]);
        expect(r.limite).toBe(50);
        expect(deEtapa()).toHaveLength(4);
        expect(lote('FROM transferencia_items')).toHaveLength(0);
        expect(lote('FROM transferencia_discrepancias d')).toHaveLength(0);
    });

    test('perfil sin etapas (solo solicitante): ni consultas de fichas ni en lote, solo los conteos', async () => {
        const r = await transferenciaService.fichasInicio({ id: 11, p: P('inventario.ver', 'solicitar') });
        expect(r.fichas).toEqual([]);
        expect(r.conteos.mis_solicitudes).toEqual({ total: 0, dias: null });
        llamadas().forEach(({ sql }) => expect(sql).toContain('COUNT('));
    });

    test('obras de prueba y finalizadas: toda consulta sobre transferencias las excluye; las de lote usan solo esos ids', async () => {
        filas.por_aprobar = [trf(1)];
        filas.discrepancias = [trf(2, { estado: 'recibida' })];
        await transferenciaService.fichasInicio({ id: 7, p: P('aprobar', 'despachar', 'recibir', 'ver_todas') });
        const sobreTransferencias = llamadas().filter(c => /FROM transferencias t\b/.test(c.sql));
        expect(sobreTransferencias.length).toBeGreaterThan(4);
        sobreTransferencias.forEach(({ sql }) => expect(sql).toMatch(/es_prueba = 1 OR finalizada = 1/));
        const enLote = llamadas().filter(c => !/FROM transferencias t\b/.test(c.sql));
        expect(enLote).toHaveLength(3);
        enLote.forEach(c => c.params[0].forEach(id => expect([1, 2]).toContain(id)));
        expect(lote('FROM transferencia_discrepancias d')[0].params).toEqual([[2]]);
    });
});

describe('fichasInicio: acción y bloqueo de este usuario', () => {
    const fichaDe = (r, id) => r.fichas.find(f => f.id === id);

    test('por aprobar: quien pidió no puede aprobar (sod_solicitante); con sod_bypass sí', async () => {
        filas.por_aprobar = [trf(1, { solicitante_id: 7 }), trf(2, { solicitante_id: 8 })];
        const sin = await transferenciaService.fichasInicio({ id: 7, p: P('aprobar') });
        expect(fichaDe(sin, 1)).toMatchObject({ accion: null, bloqueo: 'sod_solicitante' });
        expect(fichaDe(sin, 2)).toMatchObject({ accion: 'aprobar', bloqueo: null });
        const con = await transferenciaService.fichasInicio({ id: 7, p: P('aprobar', 'sod_bypass') });
        expect(fichaDe(con, 1)).toMatchObject({ accion: 'aprobar', bloqueo: null });
    });

    test('aprobada (por despachar): la acción es Recibir; quien aprobó no (sod_aprobador), con bypass sí; sin recibir → sin_permiso', async () => {
        filas.por_despachar = [trf(1, { estado: 'aprobada', aprobador_id: 7 }), trf(2, { estado: 'aprobada', aprobador_id: 8 })];
        const r = await transferenciaService.fichasInicio({ id: 7, p: P('despachar', 'recibir', 'ver_todas') });
        expect(fichaDe(r, 1)).toMatchObject({ accion: null, bloqueo: 'sod_aprobador' });
        expect(fichaDe(r, 2)).toMatchObject({ accion: 'recibir', bloqueo: null });
        const bypass = await transferenciaService.fichasInicio({ id: 7, p: P('despachar', 'recibir', 'sod_bypass') });
        expect(fichaDe(bypass, 1)).toMatchObject({ accion: 'recibir', bloqueo: null });
        const soloDespachar = await transferenciaService.fichasInicio({ id: 7, p: P('despachar') });
        expect(fichaDe(soloDespachar, 2)).toMatchObject({ accion: null, bloqueo: 'sin_permiso' });
    });

    test('en tránsito: quien despachó no recibe (sod_transportista); el bodeguero solo recibe lo de su bodega (otra_bodega)', async () => {
        filas.por_recibir = [
            trf(1, { estado: 'en_transito', transportista_id: 9, destino_bodega_id: 2 }),
            trf(2, { estado: 'recepcion_parcial', transportista_id: 4, destino_bodega_id: 3 }),
            trf(3, { estado: 'en_transito', transportista_id: 4, destino_bodega_id: 2 }),
            trf(4, { estado: 'en_transito', transportista_id: 4, destino_bodega_id: null }),
        ];
        const r = await transferenciaService.fichasInicio({ id: 9, bodega_id: 2, p: P('recibir') });
        expect(fichaDe(r, 1)).toMatchObject({ accion: null, bloqueo: 'sod_transportista' });
        expect(fichaDe(r, 2)).toMatchObject({ accion: null, bloqueo: 'otra_bodega' });
        expect(fichaDe(r, 3)).toMatchObject({ accion: 'recibir', bloqueo: null });
        expect(fichaDe(r, 4)).toMatchObject({ accion: null, bloqueo: 'otra_bodega' });
        // Sin bodega asignada no hay restricción de bodega.
        const sinBodega = await transferenciaService.fichasInicio({ id: 12, p: P('recibir') });
        expect(fichaDe(sinBodega, 2)).toMatchObject({ accion: 'recibir', bloqueo: null });
    });

    test('diferencias: resolver', async () => {
        filas.discrepancias = [trf(1, { estado: 'recibida' })];
        const r = await transferenciaService.fichasInicio({ id: 7, p: P('aprobar') });
        expect(fichaDe(r, 1)).toMatchObject({ etapa: 'discrepancias', accion: 'resolver', bloqueo: null });
    });

    // Mig 131: con solo «Ver diferencias» la ficha aparece, sin acción y sin bloqueo (la ficha dice «Ver diferencia»).
    test('diferencias con solo diferencias_ver: la ficha aparece sin acción ni bloqueo; con los dos, resolver', async () => {
        filas.discrepancias = [trf(1, { estado: 'recibida' })];
        filas.por_aprobar = [trf(2)];
        const ver = await transferenciaService.fichasInicio({ id: 14, p: P('diferencias_ver', 'ver_todas') });
        expect(ver.fichas).toHaveLength(1);
        expect(fichaDe(ver, 1)).toMatchObject({ etapa: 'discrepancias', accion: null, bloqueo: null });
        expect(deEtapa().map(c => etapaDe(c.sql))).toEqual(['discrepancias']);
        const ambos = await transferenciaService.fichasInicio({ id: 7, p: P('diferencias_ver', 'aprobar') });
        expect(fichaDe(ambos, 1)).toMatchObject({ accion: 'resolver', bloqueo: null });
    });
});

describe('fichasInicio: armado de la ficha', () => {
    const todo = { id: 7, p: P('aprobar', 'despachar', 'recibir', 'ver_todas') };

    test('una solicitud en dos etapas da una sola ficha: discrepancias > por_recibir > por_despachar > por_aprobar', async () => {
        filas.por_aprobar = [trf(5), trf(1)];
        filas.discrepancias = [trf(5, { estado: 'recibida' })];
        filas.por_despachar = [trf(6, { estado: 'aprobada' })];
        filas.por_recibir = [trf(6, { estado: 'recepcion_parcial' })];
        const r = await transferenciaService.fichasInicio(todo);
        expect(r.fichas.map(f => [f.id, f.etapa]).sort((a, b) => a[0] - b[0])).toEqual([
            [1, 'por_aprobar'], [5, 'discrepancias'], [6, 'por_recibir'],
        ]);
        expect(lote('FROM transferencia_items ti')[0].params[0].sort()).toEqual([1, 5, 6]);
    });

    test('días desde que entró a cada etapa; nunca negativos; orden días DESC, id ASC', async () => {
        filas.por_aprobar = [trf(3, { dias: '4' }), trf(1, { dias: 4 })];
        filas.por_despachar = [trf(2, { estado: 'aprobada', dias: 9 })];
        filas.por_recibir = [trf(4, { estado: 'en_transito', dias: -2 }), trf(7, { estado: 'en_transito', dias: null })];
        filas.discrepancias = [trf(8, { estado: 'recibida', dias: 1 })];
        const r = await transferenciaService.fichasInicio(todo);
        expect(r.fichas.map(f => [f.id, f.dias])).toEqual([[2, 9], [1, 4], [3, 4], [8, 1], [4, 0], [7, 0]]);
        const desde = Object.fromEntries(deEtapa().map(c => [etapaDe(c.sql), c.sql.replace(/\s+/g, ' ')]));
        expect(desde.por_aprobar).toContain('DATEDIFF(CURDATE(), t.fecha_solicitud) AS dias');
        expect(desde.por_despachar).toContain('DATEDIFF(CURDATE(), COALESCE(t.fecha_aprobacion, t.fecha_solicitud)) AS dias');
        expect(desde.por_recibir).toContain('DATEDIFF(CURDATE(), COALESCE(t.fecha_despacho, t.fecha_aprobacion, t.fecha_solicitud)) AS dias');
        expect(desde.discrepancias).toContain('DATEDIFF(CURDATE(), COALESCE(t.fecha_recepcion, t.fecha_despacho, t.fecha_solicitud)) AS dias');
        Object.values(desde).forEach(sql => expect(sql).toContain('ORDER BY dias DESC, t.id ASC LIMIT ?'));
    });

    test('estancada: solo por aprobar, con la regla de 10 días o la prórroga (prorroga_hasta)', async () => {
        filas.por_aprobar = [
            trf(1, { dias: 10, dias_hasta_limite: 0 }),
            trf(2, { dias: 15, dias_hasta_limite: -5 }),
            trf(3, { dias: 15, dias_hasta_limite: 3 }), // prorrogada: aún no vence
        ];
        filas.por_recibir = [trf(4, { estado: 'en_transito', dias: 30, dias_hasta_limite: -20 })];
        const r = await transferenciaService.fichasInicio(todo);
        const est = Object.fromEntries(r.fichas.map(f => [f.id, f.estancada]));
        expect(est).toEqual({ 1: true, 2: true, 3: false, 4: false });
        const sql = deEtapa().find(c => etapaDe(c.sql) === 'por_aprobar').sql;
        expect(sql).toContain('DATEDIFF(COALESCE(t.prorroga_hasta, DATE_ADD(DATE(t.fecha_solicitud), INTERVAL 10 DAY)), CURDATE()) AS dias_hasta_limite');
    });

    test('ítems: catálogo + personalizados aprobados; «recibida» solo después de una recepción', async () => {
        filas.por_aprobar = [trf(1)];
        filas.por_recibir = [trf(2, { estado: 'recepcion_parcial' })];
        filas.items = [
            { transferencia_id: 1, id: 10, nombre: 'Andamio', unidad: 'UN', cantidad_solicitada: '4.5000', cantidad_recibida: null },
            { transferencia_id: 2, id: 11, nombre: 'Tablón', unidad: 'UN', cantidad_solicitada: '10.0000', cantidad_recibida: '6.0000' },
            { transferencia_id: 2, id: 12, nombre: 'Puntal', unidad: null, cantidad_solicitada: 3, cantidad_recibida: null },
        ];
        filas.custom = [
            { transferencia_id: 1, id: 20, nombre: 'Cinta', unidad: 'rollo', cantidad: 5, cantidad_aprobada: null, cantidad_recibida: '0.0000' },
            { transferencia_id: 2, id: 21, nombre: 'Malla', unidad: 'm', cantidad: 8, cantidad_aprobada: '6.0000', cantidad_recibida: '2.0000' },
        ];
        const r = await transferenciaService.fichasInicio(todo);
        const f = (id) => r.fichas.find(x => x.id === id);
        expect(f(1).items).toEqual([
            { id: 10, nombre: 'Andamio', unidad: 'UN', cantidad: 4.5, recibida: null },
            { id: 20, nombre: 'Cinta', unidad: 'rollo', cantidad: 5, recibida: null },
        ]);
        expect(f(2).items).toEqual([
            { id: 11, nombre: 'Tablón', unidad: 'UN', cantidad: 10, recibida: 6 },
            { id: 12, nombre: 'Puntal', unidad: null, cantidad: 3, recibida: 0 },
            { id: 21, nombre: 'Malla', unidad: 'm', cantidad: 6, recibida: 2 },
        ]);
        // Los personalizados que el aprobador quitó (aprobado = FALSE) no se piden.
        expect(lote('FROM transferencia_items_custom tic')[0].sql).toMatch(/tic\.aprobado = 1/);
        expect(f(1)).toMatchObject({ diferencias: [], faltan: 0, sobran: 0, origen_nombre: 'Bodega Central', destino_nombre: 'Obra Uno', solicitante_nombre: 'Ana Rojas', tipo_flujo: 'solicitud' });
    });

    test('diferencias pendientes: faltan (positivas) y sobran (negativas)', async () => {
        filas.discrepancias = [trf(1, { estado: 'recibida', origen_nombre: null })];
        filas.diferencias = [
            { transferencia_id: 1, id: 30, nombre: 'Tablón', unidad: 'UN', cantidad_enviada: 5, cantidad_recibida: 3, diferencia: 2 },
            { transferencia_id: 1, id: 31, nombre: 'Puntal', unidad: 'UN', cantidad_enviada: '4.0000', cantidad_recibida: '5.5000', diferencia: '-1.5000' },
            { transferencia_id: 1, id: 32, nombre: 'Malla', unidad: null, cantidad_enviada: 2, cantidad_recibida: 1, diferencia: 1 },
        ];
        const r = await transferenciaService.fichasInicio({ id: 7, p: P('aprobar') });
        const [f] = r.fichas;
        expect(f.diferencias[1]).toEqual({ id: 31, nombre: 'Puntal', unidad: 'UN', enviada: 4, recibida: 5.5, diferencia: -1.5 });
        expect(f).toMatchObject({ faltan: 3, sobran: 1.5, origen_nombre: null });
        const sql = lote('FROM transferencia_discrepancias d')[0].sql;
        expect(sql).toMatch(/d\.estado = 'pendiente' AND d\.diferencia <> 0/);
    });
});

describe('ruta GET /api/transferencias/inicio/fichas', () => {
    const src = fs.readFileSync(path.join(__dirname, '../src/routes/transferencias.routes.js'), 'utf8');

    test('se registra antes de /:id (si no, Express toma «inicio» como un ID)', () => {
        expect(src.indexOf("router.get('/inicio/fichas'")).toBeGreaterThan(-1);
        expect(src.indexOf("router.get('/inicio/fichas'")).toBeLessThan(src.indexOf("router.get('/:id'"));
    });

    test('pide inventario.ver y normaliza limit (por defecto 50, máximo 100)', () => {
        expect(src).toMatch(/router\.get\('\/inicio\/fichas', auth, checkPermission\('inventario\.ver'\)/);
        expect(src).toMatch(/normalizePagination\(req\.query, 50, 100\)/);
    });
});
