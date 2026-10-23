jest.mock('../src/config/db', () => ({
    query: jest.fn(),
    getConnection: jest.fn(),
}));

const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const db = require('../src/config/db');
const transferenciaService = require('../src/services/transferencia.service');

/**
 * Detalle «Inventario» del Inicio por perfil (lienzo elegido 2026-10-22): GET /api/transferencias/inicio/perfil →
 * transferenciaService.inicioPerfil(user). Una respuesta con el circuito, las solicitudes (con ítems), las diferencias
 * (solo `aprobar` o `diferencias_ver`) y la SoD, con el alcance de GET /:id, consultas fijas y nunca columnas de $.
 */

const VER = 'inventario.ver';
const VER_TODAS = 'inventario.transferencias.ver_todas';
const APROBAR = 'inventario.transferencias.aprobar';
const DIF_VER = 'inventario.transferencias.diferencias_ver';
const BYPASS = 'inventario.transferencias.sod_bypass';

const LEONARDO = { id: 7, rol_id: 2, p: [VER, VER_TODAS, APROBAR] };
const DAPHNE = { id: 14, rol_id: 2, p: [VER, VER_TODAS, DIF_VER] };
const JEFE = { id: 20, rol_id: 5, obra_id: 3, p: [VER, 'inventario.transferencias.solicitar', 'inventario.transferencias.recibir'] };

/** Una fila de la lista (UNION ALL) con todas las columnas que pide el servicio. */
const fila = (o = {}) => ({
    id: 1, codigo: 'TRF-202610-0001', estado: 'pendiente', tipo_flujo: 'solicitud',
    origen_obra_id: null, origen_obra_nombre: null, origen_bodega_id: null, origen_bodega_nombre: null, origen_bodega_responsable: null,
    destino_obra_id: 3, destino_obra_nombre: 'Domeyko', destino_bodega_id: null, destino_bodega_nombre: null, destino_bodega_responsable: null,
    solicitante_id: 20, solicitante_nombre: 'Tomás Vera', solicitante_rol: 'Jefe de Obra',
    aprobador_id: null, aprobador_nombre: null, despachador_id: null, despachador_nombre: null,
    receptor_id: null, receptor_nombre: null, rechazador_id: null, rechazador_nombre: null, motivo_rechazo: null,
    parcial_receptor_id: null, parcial_receptor_nombre: null, parcial_fecha: null,
    fecha_solicitud: '2026-10-16', fecha_aprobacion: null, fecha_despacho: null, fecha_recepcion: null, fecha_rechazo: null,
    dias: 6, del_mes: 0,
    ...o,
});

/** Una fila de diferencias pendientes. */
const difFila = (o = {}) => ({
    id: 31, transferencia_id: 21, codigo: 'TRF-202610-0021', descripcion: 'Cemento', unidad: 'SACO',
    cantidad_enviada: '50.0000', cantidad_recibida: '48.0000', diferencia: '2.0000',
    origen_obra_id: null, origen_obra_nombre: null, origen_bodega_id: 2, origen_bodega_nombre: 'Bodega Cerrillos', origen_bodega_responsable: ' Juan Pérez ',
    destino_obra_id: 3, destino_obra_nombre: 'Domeyko', destino_bodega_id: null, destino_bodega_nombre: null, destino_bodega_responsable: null,
    aprobador_id: 7, aprobador_nombre: 'Leonardo López', fecha_aprobacion: '2026-10-06',
    despachador_id: 40, despachador_nombre: 'Jhoan Vásquez', fecha_despacho: '2026-10-07',
    receptor_id: 20, receptor_nombre: 'Tomás Vera', fecha_recepcion: '2026-10-08',
    dias: 14,
    ...o,
});

const CIRCUITO = {
    hoy: '2026-10-22', pedida_n: '6', pedida_dias: 9, aprobada_n: '2', aprobada_dias: 4, despachada_n: '2', despachada_dias: 2,
    recibida_n: '3', recibida_ultima: '2026-10-10', dif_n: 4, dif_items: '5', dif_dias: 14,
};

/** Responde cada consulta según su SQL (la del circuito primero: también nombra transferencia_discrepancias). */
function mockDb({ circuito = CIRCUITO, lista = [], items = [], custom = [], difs = [], aprobadores = [], obra = null, origenes = [] } = {}) {
    db.query.mockImplementation(async (sql) => {
        if (sql.includes('AS pedida_n')) return [[circuito]];
        if (sql.includes('UNION ALL')) return [lista];
        if (sql.includes('permisos_rol_v2')) return [aprobadores];
        if (sql.includes('FROM transferencia_discrepancias d')) return [difs];
        if (sql.includes('FROM obras WHERE id = ?')) return [obra ? [obra] : []];
        // Lugares de origen (antes que ítems y personalizados: la consulta también los nombra).
        if (sql.includes('FROM transferencia_item_origenes')) return [origenes];
        if (sql.includes('FROM transferencia_items_custom')) return [custom];
        if (sql.includes('FROM transferencia_items ti')) return [items];
        return [[]];
    });
}
const llamadas = () => db.query.mock.calls.map(([sql, params]) => ({ sql, params }));
const consulta = (marca) => llamadas().find(c => c.sql.includes(marca));
const SQL_LISTA = 'UNION ALL';
const SQL_CIRCUITO = 'AS pedida_n';
const SQL_DIFERENCIAS = 'JOIN items_inventario i ON i.id = d.item_id';

beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
    mockDb();
});

describe('inicioPerfil · alcance (el de GET /:id en producción)', () => {
    test('con ver_todas: todas las obras, sin filtro por solicitante; excluye obras de prueba y finalizadas', async () => {
        const r = await transferenciaService.inicioPerfil(LEONARDO);
        expect(r.alcance).toEqual({ todas: true, bodega_id: null });
        [SQL_CIRCUITO, SQL_LISTA, SQL_DIFERENCIAS].forEach(m => {
            const c = consulta(m);
            expect(c.sql).not.toMatch(/t\.solicitante_id = \?/);
            expect(c.sql).not.toMatch(/t\.destino_bodega_id = \?/);
            expect(c.sql).toMatch(/es_prueba = 1 OR finalizada = 1/);
        });
        // Las cinco partes de la lista (pendientes · aprobadas · despachadas · recibidas · rechazadas) excluyen pruebas
        // (origen y destino) y solo llevan sus topes.
        expect(consulta(SQL_LISTA).sql.match(/es_prueba = 1 OR finalizada = 1/g)).toHaveLength(10);
        expect(consulta(SQL_LISTA).params).toEqual([200, 200, 200, 100, 50]);
        expect(consulta(SQL_CIRCUITO).params).toEqual([]);
    });

    test('sin ver_todas: el MISMO alcance del listado (getAll): propias, y con bodega + las destinadas a su bodega', async () => {
        // El listado arma el alcance así; las cinco partes de la lista, el circuito y las diferencias lo repiten.
        db.query.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[{ total: 0 }]]);
        await transferenciaService.getAll({}, 9, 2);
        const sqlListado = db.query.mock.calls[0][0];
        const clausula = ' AND (t.solicitante_id = ? OR t.destino_bodega_id = ?)';
        expect(sqlListado).toContain(clausula);
        db.query.mockClear();
        mockDb();

        const bodeguero = { id: 9, bodega_id: 2, p: [VER, 'inventario.transferencias.recibir', DIF_VER] };
        const r = await transferenciaService.inicioPerfil(bodeguero);
        expect(r.alcance).toEqual({ todas: false, bodega_id: 2 });
        expect(consulta(SQL_LISTA).sql.split(clausula)).toHaveLength(6);
        expect(consulta(SQL_LISTA).params).toEqual([9, 2, 200, 9, 2, 200, 9, 2, 200, 9, 2, 100, 9, 2, 50]);
        expect(consulta(SQL_CIRCUITO).sql).toContain(clausula);
        expect(consulta(SQL_CIRCUITO).params).toEqual([9, 2]);
        expect(consulta(SQL_DIFERENCIAS).sql).toContain(clausula);
        expect(consulta(SQL_DIFERENCIAS).params).toEqual([9, 2, 100]);

        db.query.mockClear();
        await transferenciaService.inicioPerfil(JEFE);
        expect(consulta(SQL_LISTA).sql).toContain(' AND t.solicitante_id = ?');
        expect(consulta(SQL_LISTA).sql).not.toContain('t.destino_bodega_id = ?');
        expect(consulta(SQL_LISTA).params).toEqual([20, 200, 20, 200, 20, 200, 20, 100, 20, 50]);
    });

    test('quien aprueba SIN ver_todas no ve pendientes ajenas: en producción GET /:id le daría 403', async () => {
        await transferenciaService.inicioPerfil({ id: 7, p: [VER, APROBAR] });
        expect(consulta(SQL_LISTA).sql).toContain(' AND t.solicitante_id = ?');
        expect(consulta(SQL_CIRCUITO).params).toEqual([7]);
    });

    test('la obra asignada (token) no amplía el alcance: solo pone el nombre de la obra', async () => {
        mockDb({ obra: { id: 3, nombre: 'Domeyko' } });
        const r = await transferenciaService.inicioPerfil(JEFE);
        expect(r.obra).toEqual({ id: 3, nombre: 'Domeyko' });
        expect(consulta('FROM obras WHERE id = ?').params).toEqual([3]);
        expect(consulta(SQL_LISTA).sql).not.toMatch(/destino_obra_id = \?/);
        db.query.mockClear();
        const sinObra = await transferenciaService.inicioPerfil({ ...JEFE, obra_id: null });
        expect(sinObra.obra).toBeNull();
        expect(consulta('FROM obras WHERE id = ?')).toBeUndefined();
    });
});

describe('inicioPerfil · diferencias', () => {
    test('con aprobar: lista por ítem con faltan / sobran, quién despachó y quién recibió', async () => {
        mockDb({ difs: [difFila(), difFila({ id: 32, transferencia_id: 19, descripcion: 'Puntal metálico 3 m', unidad: 'UN',
            cantidad_enviada: '20.0000', cantidad_recibida: '21.0000', diferencia: '-1.0000', despachador_id: null, despachador_nombre: null,
            fecha_despacho: null, dias: 6 })] });
        const r = await transferenciaService.inicioPerfil(LEONARDO);
        expect(r.perfil).toBe('aprueba');
        expect(r.puede).toMatchObject({ aprobar: true, ver_diferencias: true, resolver_diferencias: true });
        expect(r.diferencias).toEqual([
            {
                id: 31, transferencia_id: 21, codigo: 'TRF-202610-0021', descripcion: 'Cemento', unidad: 'SACO',
                enviada: 50, recibida: 48, diferencia: 2, faltan: 2, sobran: 0,
                origen: { tipo: 'bodega', id: 2, nombre: 'Bodega Cerrillos', responsable: 'Juan Pérez' },
                destino: { tipo: 'obra', id: 3, nombre: 'Domeyko', responsable: null },
                aprobacion: { por: { id: 7, nombre: 'Leonardo López' }, fecha: '2026-10-06' },
                despacho: { por: { id: 40, nombre: 'Jhoan Vásquez' }, fecha: '2026-10-07' },
                recepcion: { por: { id: 20, nombre: 'Tomás Vera' }, fecha: '2026-10-08' },
                dias: 14,
            },
            expect.objectContaining({ id: 32, diferencia: -1, faltan: 0, sobran: 1, despacho: null }),
        ]);
        // Pendientes y ≠ 0, con tope; el receptor es quien la anotó (reportado_por) o el de la solicitud.
        const c = consulta(SQL_DIFERENCIAS);
        expect(c.sql).toMatch(/d\.estado = 'pendiente' AND d\.diferencia <> 0/);
        expect(c.sql).toMatch(/COALESCE\(d\.reportado_por, COALESCE\(t\.receptor_id, t\.recibido_por\)\)/);
        expect(c.params).toEqual([100]);
    });

    test('con solo diferencias_ver (Daphne): la MISMA consulta que quien aprueba, sin poder resolver', async () => {
        await transferenciaService.inicioPerfil(LEONARDO);
        const sqlAprobar = consulta(SQL_DIFERENCIAS).sql;
        db.query.mockClear();
        const r = await transferenciaService.inicioPerfil(DAPHNE);
        expect(consulta(SQL_DIFERENCIAS).sql).toBe(sqlAprobar);
        expect(r.perfil).toBe('jefatura');
        expect(r.puede).toMatchObject({ aprobar: false, ver_diferencias: true, resolver_diferencias: false });
        expect(r.diferencias).toEqual([]);
    });

    test('sin aprobar ni diferencias_ver: no se leen las diferencias, solo el conteo de su alcance (el aviso de la obra)', async () => {
        mockDb({ circuito: { ...CIRCUITO, dif_n: 1, dif_items: '1', dif_dias: 14, dif_mas_antigua: '21' } });
        const r = await transferenciaService.inicioPerfil(JEFE);
        expect(r.perfil).toBe('obra');
        expect(r.diferencias).toBeNull();
        expect(consulta(SQL_DIFERENCIAS)).toBeUndefined();
        // mas_antigua_id: la solicitud (propia) con la diferencia más antigua, para que el aviso la abra.
        expect(r.circuito.diferencias).toEqual({ total: 1, dias: 14, items: 1, mas_antigua_id: 21 });
        expect(consulta(SQL_CIRCUITO).params).toEqual([20]);
    });

    test('mas_antigua_id: la solicitud con la diferencia pendiente más antigua (misma fecha que dif_dias), o null sin diferencias', async () => {
        await transferenciaService.inicioPerfil(JEFE);
        const sql = consulta(SQL_CIRCUITO).sql;
        // Mismo orden que dif_dias (desde la recepción; si no hay, desde que se anotó) y solo filas con diferencia
        // pendiente ≠ 0: la primera del GROUP_CONCAT es la más antigua.
        expect(sql).toMatch(/SUBSTRING_INDEX\(GROUP_CONCAT\(CASE WHEN dd\.transferencia_id IS NOT NULL THEN t\.id END\s+ORDER BY COALESCE\(t\.fecha_recepcion, dd\.desde\) ASC, t\.id ASC SEPARATOR ','\), ',', 1\) AS dif_mas_antigua/);
        expect(sql).toMatch(/DATEDIFF\(CURDATE\(\), COALESCE\(t\.fecha_recepcion, dd\.desde\)\) END\) AS dif_dias/);

        mockDb({ circuito: { ...CIRCUITO, dif_n: 0, dif_items: null, dif_dias: null, dif_mas_antigua: null } });
        const sin = await transferenciaService.inicioPerfil(JEFE);
        expect(sin.circuito.diferencias).toEqual({ total: 0, dias: null, items: 0, mas_antigua_id: null });
    });
});

describe('inicioPerfil · SoD (solicitante ≠ aprobador)', () => {
    const lista = [
        fila({ id: 1, solicitante_id: 7, solicitante_nombre: 'Leonardo López' }),
        fila({ id: 2, solicitante_id: 20 }),
        fila({ id: 3, estado: 'aprobada', solicitante_id: 7, aprobador_id: 9, aprobador_nombre: 'Otro', fecha_aprobacion: '2026-10-18' }),
    ];

    test('la pendiente propia sin sod_bypass no se puede aprobar; la ajena sí; lo que no está pendiente no aplica', async () => {
        mockDb({ lista });
        const { solicitudes } = await transferenciaService.inicioPerfil(LEONARDO);
        const de = (id) => solicitudes.find(s => s.id === id);
        expect(de(1)).toMatchObject({ propia: true, puede_aprobar: false, bloqueo_aprobar: 'sod_solicitante' });
        expect(de(2)).toMatchObject({ propia: false, puede_aprobar: true, bloqueo_aprobar: null });
        expect(de(3)).toMatchObject({ propia: true, puede_aprobar: null, bloqueo_aprobar: null });
    });

    test('con sod_bypass la propia se puede aprobar; sin aprobar, nada aplica', async () => {
        mockDb({ lista });
        const conBypass = await transferenciaService.inicioPerfil({ ...LEONARDO, p: [...LEONARDO.p, BYPASS] });
        expect(conBypass.solicitudes[0]).toMatchObject({ puede_aprobar: true, bloqueo_aprobar: null });
        expect(conBypass.puede.sod_bypass).toBe(true);
        const sinAprobar = await transferenciaService.inicioPerfil(DAPHNE);
        sinAprobar.solicitudes.forEach(s => expect(s).toMatchObject({ puede_aprobar: null, bloqueo_aprobar: null }));
    });
});

describe('inicioPerfil · nunca dinero', () => {
    test('ni en el SQL ni en el JSON, aunque la BD devolviera columnas de $', async () => {
        const plata = { valor_compra: 12345, valor_arriendo: 678, costo_total: 9, precio: 1, monto_neto: 2 };
        mockDb({
            lista: [fila({ ...plata })],
            items: [{ transferencia_id: 1, id: 5, descripcion: 'Andamio marco 1,5 m', unidad: 'UN', cantidad_solicitada: '12.0000', cantidad_enviada: null, cantidad_recibida: null, ...plata }],
            custom: [{ transferencia_id: 1, id: 8, descripcion: 'Cemento', unidad: 'SACO', cantidad: '40', cantidad_aprobada: null, cantidad_recibida: '0', ...plata }],
            difs: [difFila({ ...plata })],
            aprobadores: [{ id: 7, nombre: 'Leonardo López', ...plata }],
        });
        const r = await transferenciaService.inicioPerfil(LEONARDO);
        expect(JSON.stringify(r)).not.toMatch(/valor|costo|precio|monto|12345|678/i);
        llamadas().forEach(({ sql }) => {
            expect(sql).not.toMatch(/valor_|costo|precio|monto|facturac/i);
            expect(sql).not.toMatch(/\b[a-z0-9]+\.\*|SELECT\s+\*/i);
        });
    });
});

describe('inicioPerfil · número fijo de consultas (sin N+1)', () => {
    const muchas = (n) => Array.from({ length: n }, (_, i) => fila({ id: i + 1, codigo: `TRF-202610-${String(i + 1).padStart(4, '0')}` }));

    test('1 o 40 solicitudes: las mismas consultas; ítems y personalizados en lote con IN (?)', async () => {
        mockDb({ lista: muchas(1) });
        await transferenciaService.inicioPerfil(LEONARDO);
        const una = db.query.mock.calls.length;
        // circuito, lista, aprobadores, diferencias, ítems, personalizados, lugares de origen
        expect(una).toBe(7);

        db.query.mockClear();
        mockDb({ lista: muchas(40) });
        const r = await transferenciaService.inicioPerfil(LEONARDO);
        expect(db.query.mock.calls.length).toBe(una);
        expect(r.solicitudes).toHaveLength(40);
        const ids = Array.from({ length: 40 }, (_, i) => i + 1);
        expect(consulta('FROM transferencia_items ti').sql).toMatch(/ti\.transferencia_id IN \(\?\)/);
        expect(consulta('FROM transferencia_items ti').params).toEqual([ids]);
        expect(consulta('FROM transferencia_items_custom').params).toEqual([ids]);
        expect(consulta('FROM transferencia_items_custom').sql).toMatch(/tic\.aprobado = 1/);
        expect(consulta('FROM transferencia_item_origenes').params).toEqual([ids, ids, ids]);
    });

    test('sin solicitudes no pide ítems; la obra del token suma una sola consulta', async () => {
        await transferenciaService.inicioPerfil(JEFE);
        // circuito, lista, aprobadores, obra (sin diferencias: no tiene el permiso)
        expect(db.query.mock.calls.length).toBe(4);
        expect(consulta('FROM transferencia_items')).toBeUndefined();
    });
});

describe('inicioPerfil · contrato de cada solicitud', () => {
    test('etapa, tipo, lugares, personas, fechas, días y cantidades (recibida solo tras una recepción)', async () => {
        mockDb({
            lista: [
                fila({ id: 42, tipo_flujo: 'solicitud_materiales', dias: '6' }),
                fila({
                    id: 33, codigo: 'TRF-202610-0033', estado: 'recepcion_parcial', tipo_flujo: 'solicitud',
                    origen_bodega_id: 4, origen_bodega_nombre: 'Paraguay', origen_bodega_responsable: '',
                    aprobador_id: 7, aprobador_nombre: 'Leonardo López', fecha_aprobacion: '2026-10-17',
                    despachador_id: 40, despachador_nombre: 'Jhoan Vásquez', fecha_despacho: '2026-10-21',
                    parcial_receptor_id: 20, parcial_receptor_nombre: 'Tomás Vera', parcial_fecha: '2026-10-22', dias: 1,
                }),
                fila({
                    id: 24, estado: 'rechazada', aprobador_id: 7, aprobador_nombre: 'Leonardo López', fecha_aprobacion: null,
                    rechazador_id: 7, rechazador_nombre: 'Leonardo López', fecha_rechazo: '2026-10-10',
                    motivo_rechazo: 'Ya hay stock en la obra (bodega de faena).', dias: 12, del_mes: 1,
                }),
            ],
            items: [
                { transferencia_id: 33, id: 5, descripcion: 'Betonera 150 L', unidad: 'UN', cantidad_solicitada: '1.0000', cantidad_enviada: '1.0000', cantidad_recibida: '0.0000' },
                { transferencia_id: 24, id: 6, descripcion: 'Taladro percutor', unidad: 'UN', cantidad_solicitada: '2.0000', cantidad_enviada: null, cantidad_recibida: null },
            ],
            custom: [{ transferencia_id: 42, id: 8, descripcion: 'Cemento', unidad: 'SACO', cantidad: '40.0000', cantidad_aprobada: null, cantidad_recibida: '0.0000' }],
            aprobadores: [{ id: 7, nombre: 'Leonardo López' }],
        });
        const r = await transferenciaService.inicioPerfil(JEFE);
        const [pedida, enCamino, rechazada] = r.solicitudes;

        expect(pedida).toEqual({
            id: 42, codigo: 'TRF-202610-0001', estado: 'pendiente', etapa: 'pedida', tipo_flujo: 'solicitud_materiales', tipo: 'materiales',
            origen: null, origenes_extra: 0, destino: { tipo: 'obra', id: 3, nombre: 'Domeyko', responsable: null },
            solicitante: { id: 20, nombre: 'Tomás Vera', rol: 'Jefe de Obra' }, propia: true,
            fecha_solicitud: '2026-10-16', aprobacion: null, despacho: null, recepcion: null, ultima_recepcion: null, rechazo: null,
            dias: 6, del_mes: false, puede_aprobar: null, bloqueo_aprobar: null,
            items: [{ clave: 'p8', personalizado: true, descripcion: 'Cemento', unidad: 'SACO', pedida: 40, enviada: null, recibida: null }],
        });
        expect(enCamino).toMatchObject({
            etapa: 'despachada', tipo: 'herramientas',
            origen: { tipo: 'bodega', id: 4, nombre: 'Paraguay', responsable: null },
            aprobacion: { por: { id: 7, nombre: 'Leonardo López' }, fecha: '2026-10-17' },
            despacho: { por: { id: 40, nombre: 'Jhoan Vásquez' }, fecha: '2026-10-21' },
            recepcion: null,
            ultima_recepcion: { por: { id: 20, nombre: 'Tomás Vera' }, fecha: '2026-10-22' },
            items: [{ clave: 'c5', personalizado: false, descripcion: 'Betonera 150 L', unidad: 'UN', pedida: 1, enviada: 1, recibida: 0 }],
        });
        expect(rechazada).toMatchObject({
            etapa: 'rechazada', del_mes: true,
            // rechazar() pisa la fecha de aprobación: la aprobación previa queda sin fecha.
            aprobacion: { por: { id: 7, nombre: 'Leonardo López' }, fecha: null },
            rechazo: { por: { id: 7, nombre: 'Leonardo López' }, fecha: '2026-10-10', motivo: 'Ya hay stock en la obra (bodega de faena).' },
            items: [expect.objectContaining({ enviada: null, recibida: null })],
        });

        expect(r).toMatchObject({
            hoy: '2026-10-22', perfil: 'obra', super_admin: false,
            alcance: { todas: false, bodega_id: null },
            puede: { aprobar: false, ver_diferencias: false, resolver_diferencias: false, solicitar: true, recibir: true, sod_bypass: false },
            aprobadores: [{ id: 7, nombre: 'Leonardo López' }],
            circuito: {
                pedida: { total: 6, dias: 9 }, aprobada: { total: 2, dias: 4 }, despachada: { total: 2, dias: 2 },
                recibida: { total: 3, ultima: '2026-10-10' }, diferencias: { total: 4, dias: 14, items: 5 },
            },
            limites: { en_curso: 200, recibidas: 100, recibidas_recientes: 10, rechazadas: 50, diferencias: 100, aprobadores: 10 },
        });
    });

    test('origenes_extra: lugares de origen distintos además del de la cabecera (splits, ítems y personalizados de obra)', async () => {
        mockDb({
            lista: [
                // Sale de Bodega Cerrillos (cabecera) y además de Paraguay y de la obra 8: 2 más.
                fila({ id: 31, estado: 'aprobada', origen_bodega_id: 2, origen_bodega_nombre: 'Bodega Cerrillos' }),
                // Un solo lugar (repetido en el split y en el ítem): 0.
                fila({ id: 32, estado: 'aprobada', origen_bodega_id: 2, origen_bodega_nombre: 'Bodega Cerrillos' }),
                // Pendiente: aún sin origen ni splits.
                fila({ id: 33 }),
            ],
            origenes: [
                { transferencia_id: 31, obra_id: null, bodega_id: 2 },
                { transferencia_id: 31, obra_id: null, bodega_id: 4 },
                { transferencia_id: 31, obra_id: 8, bodega_id: null },
                { transferencia_id: 32, obra_id: null, bodega_id: 2 },
                { transferencia_id: 32, obra_id: null, bodega_id: '2' },
            ],
        });
        const r = await transferenciaService.inicioPerfil(JEFE);
        expect(r.solicitudes.map(s => [s.id, s.origenes_extra])).toEqual([[31, 2], [32, 0], [33, 0]]);
        const c = consulta('FROM transferencia_item_origenes');
        // Solo splits con cantidad; UNION (sin ALL) para no repetir el mismo lugar; los personalizados que quitó el aprobador no cuentan.
        expect(c.sql).toMatch(/tio\.cantidad_enviada > 0/);
        expect(c.sql).toMatch(/\bUNION\b(?! ALL)/);
        expect(c.sql).toMatch(/tic\.aprobado = 1 AND tic\.origen_obra_id IS NOT NULL/);
    });

    test('días en la etapa calculados en SQL con CURDATE(); solo estados del circuito (nada de canceladas)', async () => {
        await transferenciaService.inicioPerfil(LEONARDO);
        const sql = consulta(SQL_LISTA).sql;
        expect(sql).toMatch(/DATEDIFF\(CURDATE\(\), CASE t\.estado/);
        // En curso: una parte por etapa (cada una con su tope).
        expect(sql).toMatch(/AND t\.estado = 'pendiente'\s+ORDER BY dias DESC/);
        expect(sql).toMatch(/AND t\.estado = 'aprobada'\s+ORDER BY dias DESC/);
        expect(sql).toMatch(/AND t\.estado IN \('en_transito', 'recepcion_parcial'\)\s+ORDER BY dias DESC/);
        expect(sql).toMatch(/t\.estado = 'recibida'/);
        expect(sql).toMatch(/t\.estado = 'rechazada' AND t\.fecha_aprobacion >= DATE_SUB\(CURDATE\(\)/);
        expect(sql).not.toMatch(/cancelada/);
        expect(consulta(SQL_CIRCUITO).sql).toMatch(/t\.fecha_recepcion >= DATE_SUB\(CURDATE\(\), INTERVAL DAYOFMONTH\(CURDATE\(\)\) - 1 DAY\)/);
    });

    test('recibidas: las del mes y, como mínimo, las últimas 10', async () => {
        const delMes = [201, 202, 203].map(id => fila({ id, estado: 'recibida', del_mes: 1 }));
        const viejas = Array.from({ length: 12 }, (_, i) => fila({ id: 101 + i, estado: 'recibida', del_mes: 0 }));
        mockDb({ lista: [fila({ id: 1 }), ...delMes, ...viejas] });
        const r = await transferenciaService.inicioPerfil(LEONARDO);
        expect(r.solicitudes.filter(s => s.estado === 'recibida').map(s => s.id))
            .toEqual([201, 202, 203, 101, 102, 103, 104, 105, 106, 107]);

        const muchasDelMes = Array.from({ length: 15 }, (_, i) => fila({ id: 300 + i, estado: 'recibida', del_mes: 1 }));
        mockDb({ lista: [...muchasDelMes, ...viejas] });
        const r2 = await transferenciaService.inicioPerfil(LEONARDO);
        expect(r2.solicitudes).toHaveLength(15);
    });

    test('el orden no depende de cómo devuelva la BD el UNION ALL: en curso (más días primero), recibidas y rechazadas (más nuevas primero)', async () => {
        mockDb({
            lista: [
                fila({ id: 5, estado: 'rechazada', fecha_rechazo: '2026-10-02', del_mes: 1 }),
                fila({ id: 4, estado: 'recibida', fecha_recepcion: '2026-10-03', del_mes: 1 }),
                fila({ id: 2, estado: 'aprobada', dias: 2 }),
                fila({ id: 6, estado: 'rechazada', fecha_rechazo: '2026-10-09', del_mes: 1 }),
                fila({ id: 3, estado: 'recibida', fecha_recepcion: '2026-10-08', del_mes: 1 }),
                fila({ id: 1, estado: 'pendiente', dias: 9 }),
                fila({ id: 7, estado: 'en_transito', dias: 2 }),
            ],
        });
        const r = await transferenciaService.inicioPerfil(LEONARDO);
        expect(r.solicitudes.map(s => s.id)).toEqual([1, 2, 7, 3, 4, 6, 5]);
    });

    test('aprobadores: permiso efectivo (rol + grant − deny), activos, sin Super Administrador', async () => {
        await transferenciaService.inicioPerfil(DAPHNE);
        const c = consulta('permisos_rol_v2');
        expect(c.sql).toMatch(/u\.activo = 1 AND u\.rol_id <> 1/);
        expect(c.sql).toMatch(/o\.tipo = 'deny'/);
        expect(c.sql).toMatch(/o\.tipo = 'grant'/);
        expect(c.params).toEqual([APROBAR, APROBAR, APROBAR, 10]);
    });

    test('Super Administrador: perfil «aprueba» y super_admin true; sin filas, circuito en cero y hoy del servidor', async () => {
        mockDb({ circuito: { hoy: '2026-10-22', pedida_n: null, pedida_dias: null, dif_n: 0 } });
        const r = await transferenciaService.inicioPerfil({ id: 1, rol_id: 1, p: [VER, VER_TODAS, APROBAR, DIF_VER] });
        expect(r.perfil).toBe('aprueba');
        expect(r.super_admin).toBe(true);
        expect(r.circuito.pedida).toEqual({ total: 0, dias: null });
        expect(r.circuito.recibida).toEqual({ total: 0, ultima: null });
        expect(r.solicitudes).toEqual([]);
    });
});

describe('inicioPerfil · topes de la lista en curso (uno por etapa)', () => {
    test('más aprobadas viejas que el tope no dejan fuera las pendientes (la bandeja de quien aprueba)', async () => {
        // Las aprobadas siguen «aprobada» hasta que la obra recibe (no hay «Despachar»): se juntan y son las más antiguas.
        const tabla = [
            ...Array.from({ length: 250 }, (_, i) => fila({ id: 1000 + i, estado: 'aprobada', dias: 40 + i })),
            ...[1, 2, 3].map(d => fila({ id: 10 + d, estado: 'pendiente', dias: d })),
            ...[5, 6].map(d => fila({ id: 20 + d, estado: 'en_transito', dias: d })),
        ];
        const resto = db.query.getMockImplementation();
        db.query.mockImplementation(async (sql, params) => {
            if (!sql.includes('UNION ALL')) return resto(sql, params);
            // Como la BD: cada parte filtra por SU estado, ordena por días y corta en SU tope (LEONARDO: sin alcance,
            // así que el parámetro i es el tope de la parte i).
            const filas = sql.split('\nUNION ALL\n').flatMap((parte, i) => {
                const condicion = parte.slice(parte.lastIndexOf(' AND t.estado')).split('ORDER BY')[0];
                const estados = [...condicion.matchAll(/'(\w+)'/g)].map(m => m[1]);
                return tabla.filter(r => estados.includes(r.estado)).sort((a, b) => b.dias - a.dias).slice(0, params[i]);
            });
            return [filas];
        });
        const r = await transferenciaService.inicioPerfil(LEONARDO);
        const de = (estado) => r.solicitudes.filter(s => s.estado === estado).map(s => s.id);
        expect(de('pendiente')).toEqual([13, 12, 11]);
        expect(de('aprobada')).toHaveLength(200);
        expect(de('en_transito')).toEqual([26, 25]);
        expect(r.limites.en_curso).toBe(200);
    });
});

describe('ruta GET /api/transferencias/inicio/perfil', () => {
    const src = fs.readFileSync(path.join(__dirname, '../src/routes/transferencias.routes.js'), 'utf8');
    const app = require('../index');
    const SECRET = process.env.JWT_SECRET || 'secret';
    const token = (p, id = 5, bodegaId = null) => jwt.sign({ id, email: 'u@lols.cl', rol_id: 2, rv: 1, p, bodega_id: bodegaId }, SECRET);

    test('se registra antes de /:id y pide inventario.ver', () => {
        expect(src.indexOf("router.get('/inicio/perfil'")).toBeGreaterThan(-1);
        expect(src.indexOf("router.get('/inicio/perfil'")).toBeLessThan(src.indexOf("router.get('/:id'"));
        expect(src).toMatch(/router\.get\('\/inicio\/perfil', auth, checkPermission\('inventario\.ver'\)/);
    });

    test('llama a inicioPerfil con el usuario del token y responde { data }', async () => {
        const spy = jest.spyOn(transferenciaService, 'inicioPerfil').mockResolvedValue({ perfil: 'obra' });
        const res = await request(app).get('/api/transferencias/inicio/perfil').set('Authorization', `Bearer ${token([VER], 5, 3)}`);
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ data: { perfil: 'obra' } });
        expect(spy).toHaveBeenCalledWith(expect.objectContaining({ id: 5, bodega_id: 3, p: [VER] }));
    });

    test('sin inventario.ver → 403; sin token → 401', async () => {
        const spy = jest.spyOn(transferenciaService, 'inicioPerfil');
        const sinPermiso = await request(app).get('/api/transferencias/inicio/perfil').set('Authorization', `Bearer ${token(['asistencia.ver'])}`);
        expect(sinPermiso.status).toBe(403);
        const sinToken = await request(app).get('/api/transferencias/inicio/perfil');
        expect(sinToken.status).toBe(401);
        expect(spy).not.toHaveBeenCalled();
    });
});
