/**
 * Análisis de trabajadores (Gestiones → Análisis, mig 163): cálculos puros, gates y consultas.
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
const C = require('../src/utils/analisisCalculos');
const service = require('../src/services/analisisTrabajadores.service');

const token = (p) => jwt.sign({ id: 1, email: 'test@lols.cl', rol_id: 2, rv: 1, p }, process.env.JWT_SECRET || 'secret');
const VER = 'trabajadores.analisis.ver';

/** SQL de las llamadas al pool que tocan una tabla dada. */
const consultas = () => pool.query.mock.calls.map(([sql, params]) => ({ sql: String(sql), params: params || [] }));

beforeEach(() => {
    pool.query.mockReset();
    pool.query.mockResolvedValue([[]]);
});

describe('cálculos puros', () => {
    test('rangoMeses: 12 meses por defecto terminando en el mes actual; hasta no pasa de hoy', () => {
        const r = C.rangoMeses({}, '2026-11-27');
        expect(r.meses).toHaveLength(12);
        expect(r.meses[0]).toBe('2025-12');
        expect(r.meses[11]).toBe('2026-11');
        expect(r.fechaDesde).toBe('2025-12-01');
        expect(r.fechaHasta).toBe('2026-11-27');

        const fut = C.rangoMeses({ desde: '2026-01', hasta: '2027-05' }, '2026-11-27');
        expect(fut.meses[fut.meses.length - 1]).toBe('2026-11');
    });

    test('rangoMeses: máximo 24 meses (recorta desde el inicio) e ignora valores inválidos', () => {
        const r = C.rangoMeses({ desde: '2020-01', hasta: '2026-10' }, '2026-11-27');
        expect(r.meses).toHaveLength(24);
        expect(r.meses[23]).toBe('2026-10');
        expect(r.fechaHasta).toBe('2026-10-31');
        const malo = C.rangoMeses({ desde: '2026-13', hasta: 'x' }, '2026-11-27');
        expect(malo.meses).toHaveLength(12);
    });

    test('serieDotacion: un reingreso suma un ingreso y no cuenta doble en la dotación', () => {
        const trab = [
            // Trabajó ene–mar, volvió en jun y sigue.
            { fecha_ingreso: '2026-06-01', fecha_desvinculacion: null, periodos_cerrados: '2026-01-05|2026-03-31' },
            // Flujo viejo de reactivar: período cerrado con el MISMO inicio que el actual (solapado).
            { fecha_ingreso: '2026-02-10', fecha_desvinculacion: null, periodos_cerrados: '2026-02-10|2026-04-15' },
        ];
        const s = C.serieDotacion(trab, ['2026-01', '2026-02', '2026-04', '2026-06'], '2026-11-27');
        const por = Object.fromEntries(s.map(m => [m.mes, m]));
        expect(por['2026-01']).toMatchObject({ dotacion: 1, ingresos: 1, reingresos: 0 });
        expect(por['2026-02']).toMatchObject({ dotacion: 2, ingresos: 1, reingresos: 0 }); // el solapado NO suma 2
        expect(por['2026-04']).toMatchObject({ dotacion: 1, ingresos: 0 });               // el primero estaba fuera
        expect(por['2026-06']).toMatchObject({ dotacion: 2, ingresos: 1, reingresos: 1 });
    });

    test('tramos de edad y antigüedad', () => {
        expect(C.tramoEdad('2002-11-28', '2026-11-27')).toBe('Menos de 25'); // 23 años
        expect(C.tramoEdad('1990-01-01', '2026-11-27')).toBe('35 a 44');
        expect(C.tramoEdad(null, '2026-11-27')).toBe('Sin dato');
        expect(C.tramoEdad('2020-01-01', '2026-11-27')).toBe('Sin dato'); // dato absurdo
        expect(C.tramoAntiguedad('2026-10-01', '2026-11-27')).toBe('Menos de 3 meses');
        expect(C.tramoAntiguedad('2025-11-27', '2026-11-27')).toBe('1 a 2 años');
        expect(C.tramoAntiguedad('2027-01-01', '2026-11-27')).toBe('Sin dato');
    });

    test('contar: vacíos → «Sin dato», top junta el resto en «Otros», orden fijo', () => {
        const l = [{ v: 'A' }, { v: 'A' }, { v: 'B' }, { v: '' }, { v: 'C' }];
        expect(C.contar(l, x => x.v, { top: 2 })).toEqual([
            { etiqueta: 'A', n: 2 }, { etiqueta: 'B', n: 1 }, { etiqueta: 'Otros', n: 2 },
        ]);
        expect(C.contar(l, x => x.v, { orden: ['C', 'B', 'A'] }).map(x => x.etiqueta)).toEqual(['C', 'B', 'A', 'Sin dato']);
    });

    test('agrupar, mediana y porcentaje', () => {
        expect(C.agrupar([{ obra_id: 1, obra: 'X', n: 2 }, { obra_id: null, n: 5 }, { obra_id: 1, obra: 'X', n: 1 }], 'obra_id', 'obra'))
            .toEqual([{ id: null, etiqueta: 'Sin dato', n: 5 }, { id: 1, etiqueta: 'X', n: 3 }]);
        expect(C.mediana([5, 1, 3])).toBe(3);
        expect(C.mediana([])).toBeNull();
        expect(C.porcentaje(1, 3)).toBe(33.3);
        expect(C.porcentaje(1, 0)).toBeNull();
    });
});

describe('filtros', () => {
    test('construirFiltros ignora ids y categorías inválidas', () => {
        const f = service.construirFiltros({ obra_id: 'abc', empresa_id: '3', cargo_id: '-1', categoria: 'otra' }, '2026-11-27');
        expect(f).toMatchObject({ obra_id: null, empresa_id: 3, cargo_id: null, categoria: null });
    });

    test('condFicha siempre excluye prueba y pasa los filtros como parámetros', () => {
        const w = service.condFicha({ empresa_id: 2, obra_id: 7, cargo_id: null, categoria: 'obra' });
        expect(w.sql).toContain('t.es_prueba = 0');
        expect(w.sql).toContain('t.obra_id = ?');
        expect(w.params).toEqual([2, 7, 'obra']);
    });
});

describe('GET /api/analisis-trabajadores', () => {
    test.each(['dotacion', 'rotacion', 'asistencia', 'perfil', 'costos'])('/%s sin el permiso → 403', async (ruta) => {
        const r = await request(app).get(`/api/analisis-trabajadores/${ruta}`).set('Authorization', `Bearer ${token(['trabajadores.ver'])}`);
        expect(r.status).toBe(403);
    });

    test('/costos sin cargos.sueldo.ver → 403 aunque tenga el análisis', async () => {
        const r = await request(app).get('/api/analisis-trabajadores/costos').set('Authorization', `Bearer ${token([VER])}`);
        expect(r.status).toBe(403);
    });

    test('/dotacion → 200, excluye prueba y aplica el filtro de obra', async () => {
        pool.query.mockImplementation(async (sql) => {
            if (/GROUP BY t\.obra_id/.test(sql)) {
                return [[
                    { obra_id: 1, obra: 'Obra A', finalizada: 0, empresa_id: 1, empresa: 'E', cargo_id: 1, cargo: 'Jornal', categoria: 'obra', n: 3 },
                    { obra_id: 2, obra: 'Obra B', finalizada: 1, empresa_id: 1, empresa: 'E', cargo_id: 2, cargo: 'Maestro', categoria: 'obra', n: 1 },
                ]];
            }
            return [[]];
        });
        const r = await request(app).get('/api/analisis-trabajadores/dotacion?obra_id=1').set('Authorization', `Bearer ${token([VER])}`);
        expect(r.status).toBe(200);
        expect(r.body.data).toMatchObject({ activos: 4, en_obra_finalizada: 1 });
        expect(r.body.data.serie).toHaveLength(12);
        expect(r.body.data.filtros.obra_id).toBe(1);
        const sqls = consultas().filter(c => /FROM trabajadores t/.test(c.sql));
        expect(sqls.length).toBeGreaterThan(0);
        sqls.forEach(c => {
            expect(c.sql).toContain('t.es_prueba = 0');
            expect(c.params).toContain(1);
        });
    });

    test('/rotacion: nunca lee el detalle interno de la baja; usa la foto de la baja para filtrar', async () => {
        pool.query.mockImplementation(async (sql) => {
            if (/FROM trabajador_desvinculaciones d/.test(sql)) {
                return [[
                    { fecha_desvinculacion: '2026-10-10', fecha_ingreso_periodo: '2026-10-01', causal_codigo: 'RENUNCIA', no_recontratar: 1, volvio: 0, obra_id: 1, obra: 'A', cargo_id: 1, cargo: 'J', empresa_id: 1, empresa: 'E' },
                    { fecha_desvinculacion: '2026-09-10', fecha_ingreso_periodo: '2026-01-01', causal_codigo: 'LEGADO', no_recontratar: 0, volvio: 1, obra_id: 2, obra: 'B', cargo_id: 1, cargo: 'J', empresa_id: 1, empresa: 'E' },
                ]];
            }
            return [[]];
        });
        const r = await request(app).get('/api/analisis-trabajadores/rotacion?obra_id=1').set('Authorization', `Bearer ${token([VER])}`);
        expect(r.status).toBe(200);
        expect(r.body.data).toMatchObject({ salidas: 2, salidas_antes_30: 1, no_recontratar: 1, volvieron: 1 });
        expect(r.body.data.permanencia.con_dato).toBe(2);
        const sal = consultas().find(c => /trabajador_desvinculaciones d/.test(c.sql));
        expect(sal.sql).not.toMatch(/detalle/);
        expect(sal.sql).toContain('COALESCE(d.obra_id, t.obra_id) = ?');
        expect(sal.sql).toContain('t.es_prueba = 0');
    });

    test('/asistencia: fila vigente, solo días hábiles; horas extra solo con su permiso', async () => {
        pool.query.mockImplementation(async (sql) => {
            if (/GROUP BY mes, ea\.codigo/.test(sql)) {
                return [[
                    { mes: '2026-11', codigo: 'A', nombre: 'Asiste', es_presente: 1, n: 90 },
                    { mes: '2026-11', codigo: 'F', nombre: 'Falta', es_presente: 0, n: 6 },
                    { mes: '2026-11', codigo: 'V', nombre: 'Vacaciones', es_presente: 0, n: 4 },
                ]];
            }
            return [[]];
        });
        const sin = await request(app).get('/api/analisis-trabajadores/asistencia').set('Authorization', `Bearer ${token([VER])}`);
        expect(sin.status).toBe(200);
        expect(sin.body.data).toMatchObject({ registros: 100, ausencias: 6, faltas: 6, ausentismo: 6, horas_extra: null });
        consultas().forEach(c => {
            if (!/FROM asistencias a/.test(c.sql)) return;
            expect(c.sql).toContain('WEEKDAY(a.fecha) < 5');
            expect(c.sql).toContain('a2.id > a.id');
            expect(c.sql).toContain('o.es_prueba = 0');
        });
        expect(consultas().some(c => /horas_extra/.test(c.sql))).toBe(false);

        const con = await request(app).get('/api/analisis-trabajadores/asistencia')
            .set('Authorization', `Bearer ${token([VER, 'asistencia.horas_extra.ver'])}`);
        expect(con.body.data.horas_extra).toMatchObject({ total: 0 });
    });

    test('/perfil: solo conteos; la consulta no lee nombre, RUT, dirección ni cuenta', async () => {
        pool.query.mockImplementation(async (sql) => {
            if (/falta_contrato/.test(sql)) {
                return [[
                    { fecha_nacimiento: '1990-05-01', fecha_ingreso: '2026-10-01', nacionalidad: 'chilena', comuna: 'MAIPÚ', afp: 'Modelo', salud: 'Fonasa', estado_civil: 'soltero', cargas_familiares: 0, fecha_termino_contrato: '2026-12-10', falta_contrato: 0, falta_pago: 1, falta_tallas: 0 },
                    { fecha_nacimiento: null, fecha_ingreso: '2020-01-01', nacionalidad: 'Chilena', comuna: 'Maipú', afp: null, salud: 'Fonasa', estado_civil: null, cargas_familiares: 4, fecha_termino_contrato: null, falta_contrato: 1, falta_pago: 1, falta_tallas: 1 },
                ]];
            }
            return [[]];
        });
        const r = await request(app).get('/api/analisis-trabajadores/perfil').set('Authorization', `Bearer ${token([VER])}`);
        expect(r.status).toBe(200);
        const d = r.body.data;
        expect(d.activos).toBe(2);
        expect(d.nacionalidad).toEqual([{ etiqueta: 'Chilena', n: 2 }]);
        expect(d.comunas).toEqual([{ etiqueta: 'Maipú', n: 2 }]);
        expect(d.fichas_incompletas).toEqual({ contrato: 1, pago: 2, tallas: 1 });
        expect(d.contratos_vencen).toBe(1);
        expect(JSON.stringify(d)).not.toMatch(/rut|nombres|apellido/i);
        const sel = consultas().find(c => /falta_contrato/.test(c.sql)).sql.split('FROM trabajadores')[0];
        expect(sel).not.toMatch(/t\.rut|t\.nombres|apellido|numero_cuenta AS|t\.direccion,/);
    });

    test('/costos: estimado por sueldo del cargo; cargos sin sueldo van a «sin dato»', async () => {
        pool.query.mockImplementation(async (sql) => {
            if (/cargo_sueldos s/.test(sql)) {
                return [[
                    { cargo_id: 1, cargo: 'Jornal', obra_id: 1, obra: 'A', empresa_id: 1, empresa: 'E', sueldo_base: 600000, bono_colacion: 50000, bono_movilizacion: 50000, n: 2 },
                    { cargo_id: 2, cargo: 'Capataz', obra_id: 1, obra: 'A', empresa_id: 1, empresa: 'E', sueldo_base: null, bono_colacion: null, bono_movilizacion: null, n: 1 },
                ]];
            }
            return [[]];
        });
        const r = await request(app).get('/api/analisis-trabajadores/costos')
            .set('Authorization', `Bearer ${token([VER, 'cargos.sueldo.ver'])}`);
        expect(r.status).toBe(200);
        expect(r.body.data).toMatchObject({
            estimado: true, total_mensual: 1400000, trabajadores_con_sueldo: 2, sin_dato: 1, promedio_por_trabajador: 700000,
        });
        expect(r.body.data.cargos_sin_dato).toEqual([{ id: 2, etiqueta: 'Capataz', n: 1 }]);
    });
});

describe('migración 163', () => {
    const sql = fs.readFileSync(path.join(__dirname, '../db/migrations/163_permiso_analisis_trabajadores.sql'), 'utf8');
    test('crea el permiso en el catálogo y solo lo da al rol 1, idempotente', () => {
        expect(sql).toMatch(/INSERT IGNORE INTO permisos_catalogo[\s\S]*'trabajadores\.analisis\.ver'/);
        expect(sql).toMatch(/INSERT IGNORE INTO permisos_rol_v2[\s\S]*\(1, 'trabajadores\.analisis\.ver'\)/);
        expect(sql).not.toMatch(/DELETE FROM|\bDROP\b|^\s*UPDATE/im);
    });
    test('el permiso está en el catálogo JS', () => {
        const { PERMISOS } = require('../src/config/permisos.config');
        const lista = PERMISOS || require('../src/config/permisos.config');
        expect(JSON.stringify(lista)).toContain('trabajadores.analisis.ver');
    });
});
