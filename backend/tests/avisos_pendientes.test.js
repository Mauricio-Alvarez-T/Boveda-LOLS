/**
 * Recordatorios de pendientes al celular (Marcos 2026-10-27, decisión de don Luis).
 *   - de lunes a viernes, sin feriados, a las horas del horario (ventana de 30 min);
 *   - el mensaje en «usted», con los días que lleva; si está al día, no se manda nada;
 *   - una vez por persona, día y hora (el cron puede pasar dos veces);
 *   - don Luis: un solo resumen de los temas de su Inicio de gerencia.
 */
jest.mock('../src/config/db', () => ({ query: jest.fn().mockResolvedValue([[]]) }));
jest.mock('../src/services/avisosCelular.service', () => ({ enviarA: jest.fn().mockResolvedValue({ enviados: 1, fallidos: 0 }), limpiarMensajes: jest.fn().mockResolvedValue() }));
jest.mock('../src/services/permisos.service', () => ({ getPermisosEfectivos: jest.fn() }));
jest.mock('../src/services/transferencia.service', () => ({ inicioPerfil: jest.fn() }));
jest.mock('../src/services/inicioGerencia.service', () => ({
    getGerencia: jest.fn(),
    _internal: { papeles: jest.fn().mockResolvedValue({ total: 0, lista: [] }), contratos: jest.fn().mockResolvedValue({ vencidos: 0, por_vencer: 0 }) },
}));

const db = require('../src/config/db');
const avisos = require('../src/services/avisosCelular.service');
const permisos = require('../src/services/permisos.service');
const transferencias = require('../src/services/transferencia.service');
const gerencia = require('../src/services/inicioGerencia.service');
const svc = require('../src/services/avisosPendientes.service');

const etapa = (total, dias) => ({ total, dias });
const circuito = (o = {}) => ({
    circuito: { pedida: etapa(0, null), aprobada: etapa(0, null), despachada: etapa(0, null), diferencias: { ...etapa(0, null), items: 0 }, ...o.c },
    puede: { aprobar: false, ver_diferencias: false, recibir: false, ...o.puede },
});

beforeEach(() => {
    jest.clearAllMocks();
    db.query.mockResolvedValue([[]]);
});

describe('el horario', () => {
    test('las personas y horas que pidió don Luis', () => {
        const h = Object.fromEntries(svc.HORARIO.map(x => [x.email, x.horas]));
        expect(h['paulamartinez@lols.cl']).toEqual([8, 14]);
        expect(h['luislazcano@lols.cl']).toEqual([12]);
        for (const e of ['leonardolopez', 'hectorgomez', 'matiasmillanao', 'daphnelazcano', 'hectorherrera', 'francogutierrez', 'alfonsocastilla', 'jhoanvasquez']) {
            expect(h[`${e}@lols.cl`]).toEqual([8, 12]);
        }
        expect(svc.HORARIO).toHaveLength(10);
        expect(svc.estaEnHorario('LeonardoLopez@lols.cl')).toBe(true);
        expect(svc.estaEnHorario('rodrigoriquelme@lols.cl')).toBe(false);
    });

    test('ahoraChile: 15:00 UTC de un martes = 12:00 en Chile (verano, UTC−3)', () => {
        expect(svc.ahoraChile(new Date('2026-10-27T15:00:00Z'))).toEqual({ fecha: '2026-10-27', minutos: 720, dia: 'Tue' });
    });

    test.each([
        ['martes 12:00', { fecha: '2026-10-27', minutos: 720, dia: 'Tue' }, 12],
        ['martes 12:30 (todavía en la ventana)', { fecha: '2026-10-27', minutos: 750, dia: 'Tue' }, 12],
        ['martes 12:31', { fecha: '2026-10-27', minutos: 751, dia: 'Tue' }, null],
        ['martes 14:05', { fecha: '2026-10-27', minutos: 845, dia: 'Tue' }, 14],
        ['martes 10:00', { fecha: '2026-10-27', minutos: 600, dia: 'Tue' }, null],
        ['sábado 8:00', { fecha: '2026-10-31', minutos: 480, dia: 'Sat' }, null],
        ['domingo 12:00', { fecha: '2026-11-01', minutos: 720, dia: 'Sun' }, null],
    ])('%s', async (_, ahora, esperado) => {
        expect(await svc.horaDeRonda(ahora)).toBe(esperado);
    });

    test('un feriado (no de obra) no tiene ronda', async () => {
        db.query.mockResolvedValueOnce([[{ n: 1 }]]);
        expect(await svc.horaDeRonda({ fecha: '2026-10-31', minutos: 480, dia: 'Fri' })).toBeNull();
        expect(String(db.query.mock.calls[0][0])).toMatch(/FROM feriados WHERE fecha = \? AND activo = 1 AND tipo <> 'obra'/);
    });
});

describe('lo pendiente de cada cargo', () => {
    test('quien aprueba: por aprobar y diferencias por resolver, lo más antiguo primero', async () => {
        permisos.getPermisosEfectivos.mockResolvedValue(['inventario.ver', 'inventario.transferencias.aprobar']);
        transferencias.inicioPerfil.mockResolvedValue(circuito({ puede: { aprobar: true }, c: { pedida: etapa(3, 2), diferencias: { ...etapa(1, 5), items: 2 } } }));
        const items = await svc.pendientesDe({ id: 3, rol_id: 2 }, 8);
        expect(items.map(i => i.clave)).toEqual(['diferencias', 'aprobar']);
        expect(items[1].texto).toBe('3 solicitudes por aprobar');
    });

    test('la obra: aprobadas o en camino por recibir (no lo que pidió y espera)', async () => {
        permisos.getPermisosEfectivos.mockResolvedValue(['inventario.ver', 'inventario.transferencias.recibir', 'inventario.transferencias.solicitar']);
        transferencias.inicioPerfil.mockResolvedValue(circuito({ puede: { recibir: true }, c: { pedida: etapa(4, 1), aprobada: etapa(1, 2), despachada: etapa(1, 1) } }));
        const items = await svc.pendientesDe({ id: 9, rol_id: 7, obra_id: 2 }, 8);
        expect(items).toEqual([expect.objectContaining({ clave: 'recibir', n: 2, texto: '2 solicitudes aprobadas por recibir', dias: 2 })]);
    });

    test('asistencia de hoy sin registrar: solo desde el mediodía y con «Guardar asistencia»', async () => {
        permisos.getPermisosEfectivos.mockResolvedValue(['asistencia.guardar']);
        db.query.mockResolvedValue([[{ obra: 'Toesca 2770', activa: 1, finalizada: 0, n: 0 }]]);
        expect(await svc.pendientesDe({ id: 9, rol_id: 7, obra_id: 2 }, 8)).toEqual([]);
        const items = await svc.pendientesDe({ id: 9, rol_id: 7, obra_id: 2 }, 12);
        expect(items[0]).toMatchObject({ clave: 'asistencia', texto: 'la asistencia de hoy en Toesca 2770 sin registrar' });
    });

    test('al día: sin pendientes → no hay mensaje', async () => {
        permisos.getPermisosEfectivos.mockResolvedValue(['inventario.ver', 'inventario.transferencias.aprobar']);
        transferencias.inicioPerfil.mockResolvedValue(circuito({ puede: { aprobar: true } }));
        const items = await svc.pendientesDe({ id: 3, rol_id: 2 }, 12);
        expect(items).toEqual([]);
        expect(svc.mensajeDe(items)).toBeNull();
    });

    test('don Luis: un solo resumen con los temas de su Inicio de gerencia', async () => {
        permisos.getPermisosEfectivos.mockResolvedValue(['inicio.gerencia', 'inventario.ver']);
        gerencia.getGerencia.mockResolvedValue({ solicitudes: { total: 2 }, contratos: { vencidos: 1, por_vencer: 0 }, perdidas: { n: 0, total: 150000 } });
        const items = await svc.pendientesDe({ id: 5, rol_id: 6 }, 12);
        expect(items).toHaveLength(1);
        expect(svc.mensajeDe(items)).toEqual({
            titulo: '2 temas esperan su decisión',
            cuerpo: '2 solicitudes trabadas, 1 contrato vencido o por vencer. Revíselos en Bóveda.',
            url: '/',
        });
        expect(transferencias.inicioPerfil).not.toHaveBeenCalled();
    });
});

describe('el mensaje, en «usted» y con los días', () => {
    test('uno solo, con varios: «La más antigua lleva N días esperando»', () => {
        expect(svc.mensajeDe([{ clave: 'aprobar', n: 3, texto: '3 solicitudes por aprobar', dias: 2, url: '/inventario?tab=transferencias' }])).toEqual({
            titulo: 'Tiene 3 solicitudes por aprobar',
            cuerpo: 'La más antigua lleva 2 días esperando. Revise en Bóveda.',
            url: '/inventario?tab=transferencias',
        });
    });

    test('uno solo, de una: «Lleva 1 día esperando»; de hoy: «Llegó hoy»', () => {
        expect(svc.mensajeDe([{ clave: 'fichas', n: 1, texto: '1 ficha de ingreso por aprobar', dias: 1, url: '/x' }]).cuerpo).toBe('Lleva 1 día esperando. Revise en Bóveda.');
        expect(svc.mensajeDe([{ clave: 'fichas', n: 1, texto: '1 ficha de ingreso por aprobar', dias: 0, url: '/x' }]).cuerpo).toBe('Llegó hoy. Revise en Bóveda.');
    });

    test('varios temas: los cuenta y dice los días de cada uno', () => {
        const m = svc.mensajeDe([
            { clave: 'diferencias', n: 1, texto: '1 diferencia por resolver', dias: 5, url: '/inventario' },
            { clave: 'aprobar', n: 3, texto: '3 solicitudes por aprobar', dias: 0, url: '/inventario' },
        ]);
        expect(m.titulo).toBe('Tiene 2 pendientes en Bóveda');
        expect(m.cuerpo).toBe('1 diferencia por resolver (lleva 5 días) · 3 solicitudes por aprobar (desde hoy). Revise en Bóveda.');
    });

    test('asistencia: «Regístrela en Bóveda»', () => {
        expect(svc.mensajeDe([{ clave: 'asistencia', n: 1, texto: 'la asistencia de hoy en Toesca 2770 sin registrar', dias: 0, url: '/asistencia' }])).toEqual({
            titulo: 'Asistencia de hoy pendiente',
            cuerpo: 'Tiene la asistencia de hoy en Toesca 2770 sin registrar. Regístrela en Bóveda.',
            url: '/asistencia',
        });
    });
});

describe('la ronda', () => {
    test('a cada persona de esa hora, una sola vez: si ya se le mandó hoy a esa hora, se salta', async () => {
        permisos.getPermisosEfectivos.mockResolvedValue(['inventario.ver', 'inventario.transferencias.aprobar']);
        transferencias.inicioPerfil.mockResolvedValue(circuito({ puede: { aprobar: true }, c: { pedida: etapa(2, 1) } }));
        db.query.mockImplementation(async (sql, params) => {
            const s = String(sql);
            if (s.startsWith('SELECT id, nombre, rol_id, obra_id, bodega_id FROM usuarios WHERE email = ?')) {
                return [[{ id: params[0] === 'leonardolopez@lols.cl' ? 3 : 4, nombre: 'X', rol_id: 2 }]];
            }
            if (s.startsWith('INSERT IGNORE INTO avisos_celular_envios')) return [{ affectedRows: params[0] === 3 ? 1 : 0 }];
            return [{ affectedRows: 1 }];
        });
        const r = await svc.enviarRonda(12, '2026-10-27');
        expect(avisos.enviarA).toHaveBeenCalledTimes(1);
        expect(avisos.enviarA.mock.calls[0][0]).toEqual([3]);
        expect(avisos.enviarA.mock.calls[0][1]).toMatchObject({ titulo: 'Tiene 2 solicitudes por aprobar', etiqueta: 'pendientes-12', computadorSoloSiNoEsta: true });
        expect(r).toMatch(/1 avisado\(s\)/);
        expect(r).toMatch(/ya enviado\(s\)/);
        // Paula (8 y 14) no está en la ronda de las 12.
        const correos = db.query.mock.calls.filter(([s]) => String(s).startsWith('SELECT id, nombre')).map(([, p]) => p[0]);
        expect(correos).not.toContain('paulamartinez@lols.cl');
        expect(correos).toContain('luislazcano@lols.cl');
    });
});

describe('quién trabaja en el computador (también se le piden los avisos ahí)', () => {
    test('Paula, Matías, Daphne, Héctor Herrera y don Luis sí; Leonardo no; mayúsculas no importan', () => {
        for (const e of ['paulamartinez@lols.cl', 'matiasmillanao@lols.cl', 'daphnelazcano@lols.cl', 'hectorherrera@lols.cl', 'LuisLazcano@lols.cl']) {
            expect(svc.debeActivarComputador(e)).toBe(true);
        }
        expect(svc.debeActivarComputador('leonardolopez@lols.cl')).toBe(false);
        expect(svc.debeActivarComputador('nadie@lols.cl')).toBe(false);
    });
});
