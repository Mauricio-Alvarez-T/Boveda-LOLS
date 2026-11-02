/**
 * Recordatorios de pendientes al celular (Marcos 2026-10-27, decisión de don Luis).
 *   - de lunes a viernes, sin feriados, una vez al día a la hora guardada (8 por defecto; ventana de 30 min);
 *   - el mensaje en «usted», con los días que lleva; si está al día, no se manda nada;
 *   - una vez por persona y día (el cron puede pasar dos veces; si se cambia la hora, no se repite);
 *   - la franja «Active los avisos» dice de qué le avisaremos (los temas de su cargo);
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

/** La hora guardada en avisos_celular_ajustes (mig 148) y, para lo demás, `resto`. */
const conHora = (hora, resto = async () => [[]]) => db.query.mockImplementation(async (sql, params) => (
    String(sql).includes('FROM avisos_celular_ajustes') ? [[{ hora }]] : resto(String(sql), params)
));

describe('el horario: una vez al día, a la misma hora para todos (Daphne, 02-11)', () => {
    test('las 10 personas; mayúsculas no importan', () => {
        expect(svc.HORARIO).toHaveLength(10);
        expect(svc.HORARIO.every(h => h.horas === undefined)).toBe(true);
        expect(svc.estaEnHorario('LeonardoLopez@lols.cl')).toBe(true);
        expect(svc.estaEnHorario('rodrigoriquelme@lols.cl')).toBe(false);
    });

    test('ahoraChile: 15:00 UTC de un martes = 12:00 en Chile (verano, UTC−3)', () => {
        expect(svc.ahoraChile(new Date('2026-10-27T15:00:00Z'))).toEqual({ fecha: '2026-10-27', minutos: 720, dia: 'Tue' });
    });

    test.each([
        ['martes 8:00', { fecha: '2026-10-27', minutos: 480, dia: 'Tue' }, 8],
        ['martes 8:30 (todavía en la ventana)', { fecha: '2026-10-27', minutos: 510, dia: 'Tue' }, 8],
        ['martes 8:31', { fecha: '2026-10-27', minutos: 511, dia: 'Tue' }, null],
        ['martes 12:00 (ya no hay segunda ronda)', { fecha: '2026-10-27', minutos: 720, dia: 'Tue' }, null],
        ['martes 14:05', { fecha: '2026-10-27', minutos: 845, dia: 'Tue' }, null],
        ['sábado 8:00', { fecha: '2026-10-31', minutos: 480, dia: 'Sat' }, null],
        ['domingo 8:00', { fecha: '2026-11-01', minutos: 480, dia: 'Sun' }, null],
    ])('a las 8 (la hora de partida): %s', async (_, ahora, esperado) => {
        conHora(8);
        expect(await svc.horaDeRonda(ahora)).toBe(esperado);
    });

    test('si el Super Administrador la cambia a las 9, la ronda es a las 9 y no a las 8', async () => {
        conHora(9);
        expect(await svc.horaDeRonda({ fecha: '2026-10-27', minutos: 480, dia: 'Tue' })).toBeNull();
        expect(await svc.horaDeRonda({ fecha: '2026-10-27', minutos: 545, dia: 'Tue' })).toBe(9);
    });

    test('sin la tabla (falta la mig 148) o con un valor raro: las 8', async () => {
        db.query.mockRejectedValueOnce(Object.assign(new Error("Table 'avisos_celular_ajustes' doesn't exist"), { errno: 1146 }));
        expect(await svc.horaRecordatorios()).toBe(8);
        conHora(99);
        expect(await svc.horaRecordatorios()).toBe(8);
        conHora(14);
        expect(await svc.horaRecordatorios()).toBe(14);
    });

    test('un feriado (no de obra) no tiene ronda', async () => {
        conHora(8, async () => [[{ n: 1 }]]);
        expect(await svc.horaDeRonda({ fecha: '2026-10-30', minutos: 480, dia: 'Fri' })).toBeNull();
        expect(db.query.mock.calls.map(([s]) => String(s)).join('\n')).toMatch(/FROM feriados WHERE fecha = \? AND activo = 1 AND tipo <> 'obra'/);
    });

    test('guardarHora: solo una hora entera de 6 a 20; queda quién la cambió', async () => {
        db.query.mockResolvedValue([{ affectedRows: 1 }]);
        await expect(svc.guardarHora(5, 1)).rejects.toMatchObject({ statusCode: 400 });
        await expect(svc.guardarHora(21, 1)).rejects.toMatchObject({ statusCode: 400 });
        await expect(svc.guardarHora(8.5, 1)).rejects.toMatchObject({ statusCode: 400 });
        expect(db.query).not.toHaveBeenCalled();
        expect(await svc.guardarHora(9, 7)).toBe(9);
        expect(db.query.mock.calls[0][0]).toMatch(/INSERT INTO avisos_celular_ajustes .* ON DUPLICATE KEY UPDATE/s);
        expect(db.query.mock.calls[0][1]).toEqual([9, 7]);
    });
});

describe('de qué le avisaremos (la franja «Active los avisos»)', () => {
    test('quien aprueba: solicitudes por aprobar y diferencias por resolver', async () => {
        permisos.getPermisosEfectivos.mockResolvedValue(['inventario.ver', 'inventario.transferencias.aprobar']);
        expect(await svc.temasDe({ id: 3, rol_id: 2 }, 8)).toEqual(['Solicitudes por aprobar', 'Diferencias por resolver']);
    });

    test('jefatura que solo ve diferencias: «por revisar»', async () => {
        permisos.getPermisosEfectivos.mockResolvedValue(['inventario.ver', 'inventario.transferencias.diferencias_ver']);
        expect(await svc.temasDe({ id: 4, rol_id: 3 }, 8)).toEqual(['Diferencias por revisar']);
    });

    test('la obra: materiales por recibir; la asistencia solo si la hora es desde el mediodía', async () => {
        permisos.getPermisosEfectivos.mockResolvedValue(['inventario.ver', 'inventario.transferencias.recibir', 'asistencia.guardar']);
        expect(await svc.temasDe({ id: 9, rol_id: 7, obra_id: 2 }, 8)).toEqual(['Materiales por recibir']);
        expect(await svc.temasDe({ id: 9, rol_id: 7, obra_id: 2 }, 12)).toEqual(['Materiales por recibir', 'Asistencia de hoy sin registrar']);
    });

    test('RR.HH: papeles laborales y contratos', async () => {
        permisos.getPermisosEfectivos.mockResolvedValue(['documentos.laborales.emitir', 'documentos.ver', 'trabajadores.ver']);
        expect(await svc.temasDe({ id: 6, rol_id: 4 }, 8)).toEqual(['Papeles laborales atrasados', 'Contratos vencidos o por vencer']);
    });

    test('don Luis: un solo resumen', async () => {
        permisos.getPermisosEfectivos.mockResolvedValue(['inicio.gerencia', 'inventario.ver', 'inventario.transferencias.aprobar']);
        expect(await svc.temasDe({ id: 5, rol_id: 6 }, 8)).toEqual(['Lo que espera su decisión, en un solo resumen']);
    });

    test('nada que contar: no consulta nada más que sus permisos', async () => {
        permisos.getPermisosEfectivos.mockResolvedValue(['asistencia.ver']);
        expect(await svc.temasDe({ id: 8, rol_id: 5 }, 8)).toEqual([]);
        expect(db.query).not.toHaveBeenCalled();
        expect(transferencias.inicioPerfil).not.toHaveBeenCalled();
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
    const ids = { 'leonardolopez@lols.cl': 3, 'paulamartinez@lols.cl': 4 };
    const usuarios = (sql, params) => [[{ id: ids[params[0]] ?? 20, nombre: 'X', rol_id: 2 }]];

    test('a todas las personas del horario, una sola vez: si ya se le mandó hoy a esta hora, se salta', async () => {
        permisos.getPermisosEfectivos.mockResolvedValue(['inventario.ver', 'inventario.transferencias.aprobar']);
        transferencias.inicioPerfil.mockResolvedValue(circuito({ puede: { aprobar: true }, c: { pedida: etapa(2, 1) } }));
        db.query.mockImplementation(async (sql, params) => {
            const s = String(sql);
            if (s.startsWith('SELECT id, nombre, rol_id, obra_id, bodega_id FROM usuarios WHERE email = ?')) return usuarios(s, params);
            if (s.startsWith('SELECT COUNT(*) AS n FROM avisos_celular_envios')) return [[{ n: 0 }]];
            if (s.startsWith('INSERT IGNORE INTO avisos_celular_envios')) return [{ affectedRows: params[0] === 3 ? 1 : 0 }];
            return [{ affectedRows: 1 }];
        });
        const r = await svc.enviarRonda(8, '2026-11-03');
        expect(avisos.enviarA).toHaveBeenCalledTimes(1);
        expect(avisos.enviarA.mock.calls[0][0]).toEqual([3]);
        expect(avisos.enviarA.mock.calls[0][1]).toMatchObject({ titulo: 'Tiene 2 solicitudes por aprobar', etiqueta: 'pendientes-8', computadorSoloSiNoEsta: true });
        expect(r).toMatch(/1 avisado\(s\)/);
        expect(r).toMatch(/9 ya enviado\(s\)/);
        // Las 10 personas, también Paula y don Luis (antes tenían otras horas).
        const correos = db.query.mock.calls.filter(([s]) => String(s).startsWith('SELECT id, nombre')).map(([, p]) => p[0]);
        expect(correos).toHaveLength(10);
        expect(correos).toEqual(expect.arrayContaining(['paulamartinez@lols.cl', 'luislazcano@lols.cl']));
    });

    test('una vez al día: si hoy ya se le mandó a otra hora (se cambió la hora), no se repite', async () => {
        permisos.getPermisosEfectivos.mockResolvedValue(['inventario.ver', 'inventario.transferencias.aprobar']);
        transferencias.inicioPerfil.mockResolvedValue(circuito({ puede: { aprobar: true }, c: { pedida: etapa(2, 1) } }));
        db.query.mockImplementation(async (sql, params) => {
            const s = String(sql);
            if (s.startsWith('SELECT id, nombre, rol_id, obra_id, bodega_id FROM usuarios WHERE email = ?')) return usuarios(s, params);
            if (s.startsWith('SELECT COUNT(*) AS n FROM avisos_celular_envios')) return [[{ n: 1 }]];
            return [{ affectedRows: 1 }];
        });
        const r = await svc.enviarRonda(10, '2026-11-03');
        expect(avisos.enviarA).not.toHaveBeenCalled();
        expect(db.query.mock.calls.some(([s]) => String(s).startsWith('INSERT IGNORE INTO avisos_celular_envios'))).toBe(false);
        expect(r).toMatch(/10 ya enviado\(s\)/);
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
