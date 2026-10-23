/**
 * «Inicio de gerencia» (don Luis, opción B «Tablero por tema», 2026-10-23; mig 134).
 *   · GET /api/dashboard/gerencia exige `inicio.gerencia`.
 *   · Cada bloque llega null sin el permiso de su módulo (y entonces ni se consulta) o si su consulta falla.
 *   · Pérdidas: faltan × valor_compra SOLO con permiso de valores; sin él, ningún campo de $ en el JSON.
 *   · Las consultas excluyen obras de prueba / finalizadas y siguen las reglas de cada módulo.
 * La migración 134 se revisa leyendo el .sql (como transferencias_aprobar_solo_leonardo.test.js).
 */
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const jwt = require('jsonwebtoken');

jest.mock('../src/config/db', () => ({
    query: jest.fn().mockResolvedValue([[]]),
    getConnection: jest.fn().mockResolvedValue({
        beginTransaction: jest.fn(), query: jest.fn().mockResolvedValue([[]]),
        commit: jest.fn(), rollback: jest.fn(), release: jest.fn(),
    }),
}));

const pool = require('../src/config/db');
const app = require('../index');
const service = require('../src/services/inicioGerencia.service');
const asistenciaService = require('../src/services/asistencia.service');
const vehiculosService = require('../src/services/vehiculos.service');
const documentosAlertasService = require('../src/services/documentosAlertas.service');
const MAESTRO = require('../src/config/permisos.config');

const MODULOS = ['asistencia.ver', 'vehiculos.ver', 'inventario.ver', 'inventario.transferencias.ver_todas', 'documentos.ver'];
const VALORES = ['inventario.costos.ver'];

const token = (p) => jwt.sign({ id: 9, email: 'luislazcano@lols.cl', rol_id: 5, rv: 1, p }, process.env.JWT_SECRET || 'secret');
const sqls = () => pool.query.mock.calls.map(([sql]) => String(sql));

/** Respuestas de la BD según la consulta (lo demás, vacío). */
function bdConDatos() {
    pool.query.mockImplementation(async (sql) => {
        const s = String(sql);
        if (s.includes('FROM transferencia_discrepancias d') && s.includes('COUNT(DISTINCT d.transferencia_id)')) {
            return [[{ n: 2, envios: 2, n_mes: 1, total: '407880.0000', total_mes: '407880', sin_valor: 1 }]];
        }
        if (s.includes('FROM transferencia_discrepancias d')) {
            return [[
                { id: 1, transferencia_id: 27, codigo: 'TRF-202610-0027', descripcion: 'Placa terciado 18 mm', unidad: 'UN', diferencia: '12.0000',
                    valor_compra: '33990.00', origen: 'Bodega Cerrillos', destino: 'Gorbea 3082', recibio: 'Carla Soto', fecha: '2026-10-16', dias: 7, del_mes: 1 },
                { id: 2, transferencia_id: 21, codigo: 'TRF-202609-0021', descripcion: 'Cemento', unidad: 'SACO', diferencia: '2.0000',
                    valor_compra: null, origen: 'Bodega Cerrillos', destino: 'Domeyko', recibio: 'Tomás Vera', fecha: '2026-09-20', dias: 33, del_mes: 0 },
            ]];
        }
        if (s.includes('FROM documentos d') && s.includes('SUM(d.fecha_vencimiento < CURDATE())')) return [[{ vencidos: 1, por_vencer: '1' }]];
        if (s.includes('FROM documentos d')) {
            return [[
                { id: 5, tipo: 'Examen preocupacional', trabajador_id: 3, rut: '14.120.877-5', nombres: 'Iván', apellido_paterno: 'Saavedra', apellido_materno: 'Lagos', obra: 'Gorbea 3082', fecha: '2026-09-12', dias: -41 },
                { id: 6, tipo: 'Licencia clase B', trabajador_id: 4, rut: '13.664.209-1', nombres: 'Raúl', apellido_paterno: 'Espinoza', apellido_materno: null, obra: 'Domeyko', fecha: '2026-10-27', dias: 4 },
            ]];
        }
        if (s.includes('SELECT COUNT(*) AS n FROM transferencias t')) return [[{ n: 1 }]];
        if (s.includes("t.estado = 'pendiente'") && s.includes('LEFT JOIN roles rs')) {
            return [[{ id: 12, codigo: 'TRF-202610-0012', solicitante_id: 21, solicitante: 'Carla Soto', cargo: 'Prevencionista', destino: 'Gorbea 3082', origen: null, fecha: '2026-10-07', dias: 16 }]];
        }
        if (s.includes('FROM transferencia_items ti')) return [[{ transferencia_id: 12, descripcion: 'Arnés de seguridad', unidad: 'UN', pedida: '6.0000' }]];
        if (s.includes('FROM transferencia_items_custom tic')) return [[{ transferencia_id: 12, descripcion: 'Línea de vida', unidad: 'UN', pedida: 2 }]];
        if (s.includes('FROM usuarios u') && s.includes('permisos_usuario_override')) return [[{ id: 10, nombre: 'Leonardo López' }]];
        return [[]];
    });
}

beforeEach(() => {
    jest.spyOn(asistenciaService, 'getAlertasFaltas').mockResolvedValue([
        { trabajador_id: 1, rut: '16.338.071-2', nombres: 'Sergio', apellido_paterno: 'Vidal', obra_nombre: 'Domeyko', total_faltas: 3,
            fechas: ['2026-10-09', '2026-10-19', '2026-10-20'], alertas: [{ tipo: 'consecutivas' }, { tipo: 'acumuladas' }] },
        { trabajador_id: 2, rut: '15.482.903-K', nombres: 'Jorge', apellido_paterno: 'Contreras', obra_nombre: 'Domeyko', total_faltas: 4,
            fechas: ['2026-10-05', '2026-10-12', '2026-10-13', '2026-10-19'], alertas: [{ tipo: 'consecutivas' }, { tipo: 'lunes' }, { tipo: 'acumuladas' }] },
    ]);
    jest.spyOn(vehiculosService, 'getPapeles').mockResolvedValue({
        dias: 30, total_vehiculos: 4,
        vehiculos: [{ vehiculo_id: 7, patente: 'FZRC-35', marca: 'Hyundai', modelo: 'Porter', conductor_id: 3, conductor_nombre: 'Marcelo Aguilera',
            conductor_telefono: '+56911112222', papeles: [], otros: [], requiere_accion: 1, vencidos: 1, peor_dias: -52 }],
    });
    jest.spyOn(documentosAlertasService, 'pendientes').mockResolvedValue({
        total: 2, criticos: 1, items: [
            { documento_id: 40, tipo_codigo: 'ANEXO', tipo_nombre: 'Anexo de contrato (Bóveda)', etapa: 'sin_imprimir', dias: 4, critical: false,
                dias_aviso: 3, dias_critico: 7, trabajador: { id: 8, nombre: 'Pino Álvaro', rut: '1-9' }, obra_nombre: 'Domeyko', lote_id: null, portador_nombre: null },
            { documento_id: 41, tipo_codigo: 'CONTRATO', tipo_nombre: 'Contrato de Trabajo (Bóveda)', etapa: 'por_retirar', dias: 15, critical: true,
                dias_aviso: 5, dias_critico: 10, trabajador: { id: 9, nombre: 'Morales Diego', rut: '2-7' }, obra_nombre: 'Gorbea 3082', lote_id: null, portador_nombre: null },
        ],
    });
});

afterEach(() => {
    jest.restoreAllMocks();
    pool.query.mockReset();
    pool.query.mockResolvedValue([[]]);
});

describe('GET /api/dashboard/gerencia', () => {
    test('sin inicio.gerencia → 403 (aunque vea todos los módulos)', async () => {
        const r = await request(app).get('/api/dashboard/gerencia').set('Authorization', `Bearer ${token([...MODULOS, ...VALORES])}`);
        expect(r.status).toBe(403);
    });

    test('con inicio.gerencia y sin ningún módulo → 200 con todos los bloques en null y sin consultar nada', async () => {
        const r = await request(app).get('/api/dashboard/gerencia').set('Authorization', `Bearer ${token(['inicio.gerencia'])}`);
        expect(r.status).toBe(200);
        expect(r.body.data).toMatchObject({
            faltas: null, vehiculos: null, perdidas: null, documentos: null, papeles: null, solicitudes: null, aprobadores: [],
        });
        expect(r.body.data.hoy).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(pool.query).not.toHaveBeenCalled();
        expect(asistenciaService.getAlertasFaltas).not.toHaveBeenCalled();
        expect(vehiculosService.getPapeles).not.toHaveBeenCalled();
        expect(documentosAlertasService.pendientes).not.toHaveBeenCalled();
    });

    test('sin permiso de valores: pérdidas en cantidades y NINGÚN campo de $ en el JSON', async () => {
        bdConDatos();
        const r = await request(app).get('/api/dashboard/gerencia').set('Authorization', `Bearer ${token(['inicio.gerencia', ...MODULOS])}`);
        expect(r.status).toBe(200);
        const p = r.body.data.perdidas;
        expect(p.con_valores).toBe(false);
        expect(p).toMatchObject({ n: 2, envios: 2, n_mes: 1 });
        expect(p.lista.map(f => f.faltan)).toEqual([12, 2]);
        expect(JSON.stringify(p)).not.toMatch(/"(valor|valor_unitario|valor_compra|total|total_mes|sin_valor)"/);
        // Sin $, el orden es por antigüedad (no por monto: no deja deducir valores).
        const lista = sqls().find(s => s.includes('FROM transferencia_discrepancias d') && s.includes('LIMIT ?'));
        expect(lista).toMatch(/ORDER BY dias DESC, d\.id ASC/);
    });

    test('con permiso de valores: faltan × valor de compra, total y total del mes; sin valor de compra = null', async () => {
        bdConDatos();
        const r = await request(app).get('/api/dashboard/gerencia')
            .set('Authorization', `Bearer ${token(['inicio.gerencia', ...MODULOS, 'inventario.resumen.ver_valores'])}`);
        const p = r.body.data.perdidas;
        expect(p).toMatchObject({ con_valores: true, total: 407880, total_mes: 407880, sin_valor: 1 });
        expect(p.lista[0]).toMatchObject({ codigo: 'TRF-202610-0027', faltan: 12, valor_unitario: 33990, valor: 407880, del_mes: true, transferencia_id: 27 });
        expect(p.lista[1]).toMatchObject({ valor_unitario: null, valor: null, del_mes: false });
        expect(r.body.data.aprobadores).toEqual([{ id: 10, nombre: 'Leonardo López' }]);
    });

    test('Super Administrador (todo el catálogo) recibe los seis temas', async () => {
        bdConDatos();
        const todo = MAESTRO.map(([clave]) => clave);
        const r = await request(app).get('/api/dashboard/gerencia').set('Authorization', `Bearer ${token(todo)}`);
        expect(r.status).toBe(200);
        for (const k of ['faltas', 'vehiculos', 'perdidas', 'documentos', 'papeles', 'solicitudes']) expect(r.body.data[k]).not.toBeNull();
    });
});

describe('inicioGerencia.getGerencia: cada tema', () => {
    const TODOS = ['inicio.gerencia', ...MODULOS, ...VALORES];

    test('faltas: más causales primero, causales en palabras clave, nombre completo', async () => {
        const r = await service.getGerencia(TODOS);
        expect(r.faltas).toMatchObject({ total: 2, tres_causales: 1 });
        expect(r.faltas.lista.map(f => [f.nombre, f.causales])).toEqual([
            ['Jorge Contreras', ['seguidos', 'lunes', 'tres']],
            ['Sergio Vidal', ['seguidos', 'tres']],
        ]);
        expect(asistenciaService.getAlertasFaltas).toHaveBeenCalledWith('ALL', expect.any(Number), expect.any(Number));
    });

    test('vehículos: lo de GET /vehiculos/papeles a 30 días, sin el teléfono del conductor', async () => {
        const r = await service.getGerencia(TODOS);
        expect(vehiculosService.getPapeles).toHaveBeenCalledWith(30);
        expect(r.vehiculos.vehiculos[0]).toMatchObject({ patente: 'FZRC-35', conductor_nombre: 'Marcelo Aguilera' });
        expect(r.vehiculos.vehiculos[0]).not.toHaveProperty('conductor_telefono');
    });

    test('documentos: vencidos y por vencer en 7 días, sin renovados, sin obras de prueba ni finalizadas', async () => {
        bdConDatos();
        const r = await service.getGerencia(TODOS);
        expect(r.documentos).toMatchObject({ dias: 7, vencidos: 1, por_vencer: 1 });
        expect(r.documentos.lista[0]).toMatchObject({ nombre: 'Iván Saavedra Lagos', rut: '14.120.877-5', dias: -41, tipo: 'Examen preocupacional' });
        const sql = sqls().find(s => s.includes('FROM documentos d') && s.includes('LIMIT ?'));
        expect(sql).toMatch(/t\.activo = 1 AND t\.es_prueba = 0/);
        expect(sql).toMatch(/o\.es_prueba = 0 AND o\.finalizada = 0/);
        expect(sql).toMatch(/NOT EXISTS \(\s*SELECT 1 FROM documentos d2/);
        expect(sql).toMatch(/INTERVAL \? DAY/);
    });

    test('papeles laborales: lo de documentos-alertas, los críticos primero', async () => {
        const r = await service.getGerencia(TODOS);
        expect(r.papeles).toMatchObject({ total: 2, criticos: 1 });
        expect(r.papeles.lista.map(p => p.documento_id)).toEqual([41, 40]);
    });

    test('solicitudes: la regla «estancada» (10 días o prórroga), con lo que se pidió en lote', async () => {
        bdConDatos();
        const r = await service.getGerencia(TODOS);
        expect(r.solicitudes.total).toBe(1);
        expect(r.solicitudes.lista[0]).toMatchObject({ codigo: 'TRF-202610-0012', dias: 16, solicitante: 'Carla Soto', destino: 'Gorbea 3082' });
        expect(r.solicitudes.lista[0].items).toEqual([
            { descripcion: 'Arnés de seguridad', unidad: 'UN', pedida: 6 },
            { descripcion: 'Línea de vida', unidad: 'UN', pedida: 2 },
        ]);
        const sql = sqls().find(s => s.includes('LEFT JOIN roles rs'));
        expect(sql).toMatch(/COALESCE\(t\.prorroga_hasta, DATE_ADD\(DATE\(t\.fecha_solicitud\), INTERVAL 10 DAY\)\), CURDATE\(\)\) <= 0/);
        expect(sql).toMatch(/es_prueba = 1 OR finalizada = 1/);
    });

    test('sin ver_todas no hay temas de Inventario (no podría abrir las solicitudes) ni se consultan', async () => {
        bdConDatos();
        const r = await service.getGerencia(['inicio.gerencia', 'inventario.ver', ...VALORES]);
        expect(r.perdidas).toBeNull();
        expect(r.solicitudes).toBeNull();
        expect(r.aprobadores).toEqual([]);
        expect(sqls().some(s => s.includes('transferencia'))).toBe(false);
    });

    test('un bloque que falla llega null y no tumba a los otros', async () => {
        bdConDatos();
        vehiculosService.getPapeles.mockRejectedValue(new Error('se cayó'));
        const r = await service.getGerencia(TODOS);
        expect(r.vehiculos).toBeNull();
        expect(r.faltas).not.toBeNull();
        expect(r.perdidas).not.toBeNull();
        expect(r.documentos).not.toBeNull();
    });

    test('número fijo de consultas (sin N+1), una tras otra', async () => {
        bdConDatos();
        await service.getGerencia(TODOS);
        // pérdidas 2 + documentos 2 + solicitudes 2 (+2 ítems en lote) + aprobadores 1 = 9.
        expect(pool.query).toHaveBeenCalledTimes(9);
    });

    test('sinValores: limpia cualquier campo de $ de un bloque de pérdidas', () => {
        const limpio = service._internal.sinValores({
            con_valores: true, n: 1, total: 5, total_mes: 5, sin_valor: 0,
            lista: [{ id: 1, faltan: 1, valor: 5, valor_unitario: 5, valor_compra: 5 }],
        });
        expect(JSON.stringify(limpio)).not.toMatch(/"(valor|valor_unitario|valor_compra|total|total_mes|sin_valor)"/);
        expect(limpio.con_valores).toBe(false);
    });
});

describe('catálogo: «Inicio de gerencia»', () => {
    test('existe, en el módulo Inicio, con nombre y descripción en español', () => {
        const p = MAESTRO.find(([clave]) => clave === 'inicio.gerencia');
        expect(p).toBeDefined();
        expect(p[1]).toBe('Inicio');
        expect(p[2]).toBe('Inicio de gerencia');
        expect(p[3]).toMatch(/temas esperan una decisión/);
    });
});

describe('migración 134_inicio_gerencia.sql', () => {
    const SQL = fs.readFileSync(path.resolve(__dirname, '../db/migrations/134_inicio_gerencia.sql'), 'utf8');
    const sentencias = SQL.split(/\r?\n/).filter(l => !l.trim().startsWith('--')).join('\n');
    const lista = sentencias.split(';').map(s => s.trim()).filter(Boolean);

    test('cuatro sentencias, el catálogo PRIMERO (FK), con el mismo texto que permisos.config.js', () => {
        expect(lista).toHaveLength(4);
        expect(lista[0]).toMatch(/^INSERT IGNORE INTO permisos_catalogo/);
        const [, modulo, nombre, descripcion, orden] = MAESTRO.find(([clave]) => clave === 'inicio.gerencia');
        expect(lista[0]).toContain(`'inicio.gerencia', '${modulo}', '${nombre}'`);
        expect(lista[0]).toContain(`'${descripcion}'`);
        expect(lista[0]).toMatch(new RegExp(`,\\s*${orden}\\)$`));
    });

    test('rol 1 también (INSERT IGNORE)', () => {
        expect(lista[1]).toMatch(/^INSERT IGNORE INTO permisos_rol_v2/);
        expect(lista[1]).toMatch(/JOIN permisos_catalogo p ON p\.clave = 'inicio\.gerencia'\s+WHERE r\.id = 1$/);
    });

    test('Luis Lazcano: permiso propio por correo, sin duplicar y pisando un deny', () => {
        expect(lista[2]).toMatch(/^INSERT INTO permisos_usuario_override \(usuario_id, permiso_clave, tipo\)/);
        expect(lista[2]).toMatch(/SELECT u\.id, p\.clave, 'grant'/);
        expect(lista[2]).toMatch(/WHERE u\.email = 'luislazcano@lols\.cl'\s+ON DUPLICATE KEY UPDATE tipo = 'grant'$/);
    });

    test('re-login: roles.version + 1 del rol de Luis, nunca del rol 1, sin leer roles en la subconsulta', () => {
        expect(lista[3]).toMatch(/^UPDATE roles\s+SET version = version \+ 1/);
        expect(lista[3]).toMatch(/u\.email = 'luislazcano@lols\.cl'\s+AND u\.rol_id IS NOT NULL AND u\.rol_id <> 1/);
        expect(lista[3].slice(lista[3].indexOf('SET'))).not.toMatch(/\b(FROM|JOIN)\s+roles\b/i);
    });

    test('la única persona nombrada es Luis y el único permiso, inicio.gerencia', () => {
        expect([...new Set(sentencias.match(/'[^']+@[^']+'/g))]).toEqual(["'luislazcano@lols.cl'"]);
        const claves = [...new Set(sentencias.match(/'[a-z_]+(\.[a-z_]+)+'/g).filter(c => !c.includes('@')))];
        expect(claves).toEqual(["'inicio.gerencia'"]);
    });

    test('idempotente: sin DDL, sin DELETE, y todo INSERT con IGNORE o ON DUPLICATE KEY UPDATE', () => {
        expect(sentencias).not.toMatch(/\b(CREATE|ALTER|DROP|TRUNCATE|RENAME|DELETE)\b/i);
        lista.filter(s => /^INSERT/i.test(s)).forEach(s => expect(s).toMatch(/INSERT IGNORE|ON DUPLICATE KEY UPDATE/));
    });
});
