/**
 * Errores que se vigilan solos y apartados propios (mig 150, Marcos 2026-11-03; docs/reglas/seguridad-rbac.md § Errores).
 *   - versión = cada subida a producción («AAAAMMDD-HHMM», UTC); la app la manda con cada error;
 *   - «Arreglado en esta versión»: 'actual' vale desde esa versión, 'proxima' desde la siguiente; marca también los
 *     iguales sin revisar; solo falla / app / permiso;
 *   - si el mismo error vuelve con esa versión o una más nueva → fila nueva con `reaparecio_de`, al arreglado se le
 *     anota `arreglo_fallo_en` y a los programadores les llega «El arreglo no funcionó»; con Bóveda viejo, no;
 *   - apartados propios: crear (sin repetir nombres ni usar los de Bóveda), mover (con o sin «los próximos iguales
 *     llegan solos»), borrar; la vista «ap:<id>»; las vistas de siempre ya no muestran lo que está en un apartado;
 *   - sin la mig 150 todavía, el error se guarda igual (como antes).
 */
const request = require('supertest');
const jwt = require('jsonwebtoken');

jest.mock('../src/config/db', () => ({
    query: jest.fn().mockResolvedValue([[]]),
    getConnection: jest.fn().mockResolvedValue({
        beginTransaction: jest.fn(), query: jest.fn().mockResolvedValue([[]]),
        commit: jest.fn(), rollback: jest.fn(), release: jest.fn(),
    }),
}));
jest.mock('../src/services/avisosCelular.service', () => ({
    enviarA: jest.fn().mockResolvedValue({ enviados: 1, fallidos: 0 }),
    limpiarMensajes: jest.fn().mockResolvedValue(),
}));
jest.mock('../src/services/email.service', () => ({ sendSystemEmail: jest.fn().mockResolvedValue({}) }));

const db = require('../src/config/db');
const app = require('../index');
const avisos = require('../src/services/avisosCelular.service');
const horarioHabil = require('../src/utils/horarioHabil');
const svc = require('../src/services/soporteErrores.service');

const SECRETO = process.env.JWT_SECRET || 'secret';
const USUARIOS = {
    1: { id: 1, nombre: 'Marcos Uribe', email: 'marcos@lols.cl', rol_id: 1, activo: 1 },
    20: { id: 20, nombre: 'Héctor Herrera', email: 'hector@lols.cl', rol_id: 7, activo: 1 },
};
const sesion = (u) => jwt.sign({ typ: 'session', id: u.id, email: u.email, rol_id: u.rol_id, p: [], rv: 1 }, SECRETO, { expiresIn: '8h' });
const FALLA = { categoria: 'falla', mensaje: 'No se pudo guardar la asistencia', accion: 'POST /api/asistencias/bulk/:obraId', codigo: 500, pantalla: '/asistencia', pantalla_nombre: 'Asistencia diaria', dispositivo: 'movil' };

let ARREGLADO = null;        // la fila arreglada con la misma firma (o null)
let SIN_MIGRACION = false;   // la mig 150 todavía no corrió
let ERROR = { id: 7, firma: 'f'.repeat(40), categoria: 'falla' };
let AFECTADAS = 1;
const consultas = () => db.query.mock.calls.map(([s, p]) => ({ s: String(s), p }));
const una = (inicio) => consultas().find(c => c.s.trimStart().startsWith(inicio));

function bd() {
    db.query.mockImplementation(async (sql, params = []) => {
        const s = String(sql);
        if (s.startsWith('SELECT id, nombre, rol_id, activo FROM usuarios WHERE id = ?')) {
            const u = USUARIOS[params[0]];
            return [u ? [u] : []];
        }
        if (s.includes('FROM feriados')) return [[{ n: 0 }]];
        if (s.includes('arreglado_version IS NOT NULL AND arreglo_fallo_en IS NULL')) return [ARREGLADO ? [ARREGLADO] : []];
        if (s.includes('FROM soporte_errores') && s.includes('usuario_id = ? AND firma = ?')) return [[]];
        if (s.includes('AS persona_hoy')) return [[{ persona_hoy: 0, hoy: 0, bytes: 0 }]];
        if (s.startsWith('INSERT INTO soporte_errores')) {
            if (SIN_MIGRACION && s.includes('version_app')) throw Object.assign(new Error("Unknown column 'version_app'"), { errno: 1054 });
            return [{ insertId: 99 }];
        }
        if (s.startsWith('SELECT id, firma, categoria FROM soporte_errores WHERE id = ?')) return [ERROR ? [ERROR] : []];
        if (s.startsWith('SELECT id, firma FROM soporte_errores WHERE id = ?')) return [ERROR ? [ERROR] : []];
        if (s.startsWith('SELECT id FROM soporte_apartados WHERE id = ?')) return [[{ id: params[0] }]];
        if (s.startsWith('SELECT id, email FROM usuarios WHERE rol_id = 1')) return [[{ id: 1, email: 'marcos@lols.cl' }]];
        if (s.startsWith('SELECT nombre FROM usuarios WHERE id = ?')) return [[{ nombre: USUARIOS[params[0]]?.nombre }]];
        if (s.startsWith('INSERT INTO soporte_apartados')) return [{ insertId: 5 }];
        if (s.includes('FROM soporte_errores e')) return [[]];
        return [{ affectedRows: AFECTADAS }];
    });
}

beforeEach(() => {
    jest.clearAllMocks();
    svc._reiniciar();
    ARREGLADO = null;
    SIN_MIGRACION = false;
    ERROR = { id: 7, firma: 'f'.repeat(40), categoria: 'falla' };
    AFECTADAS = 1;
    bd();
    // Un martes a las 10:00: el aviso a los programadores sale al tiro.
    jest.spyOn(horarioHabil, 'ahoraChile').mockReturnValue({ fecha: '2026-11-03', minutos: 600, dia: 'Tue' });
});

describe('¿la versión ya trae el arreglo?', () => {
    test.each([
        ['actual, la misma versión', '20261103-1950', '20261103-1950', 'actual', true],
        ['actual, una más nueva', '20261104-1200', '20261103-1950', 'actual', true],
        ['actual, una más vieja (Bóveda viejo abierto)', '20261102-1615', '20261103-1950', 'actual', false],
        ['próxima, la misma (todavía no sube el arreglo)', '20261103-1950', '20261103-1950', 'proxima', false],
        ['próxima, la siguiente', '20261104-0910', '20261103-1950', 'proxima', true],
        ['sin versión (app de antes)', null, '20261103-1950', 'actual', false],
        ['versión rara', '3-nov', '20261103-1950', 'actual', false],
    ])('%s', (_, version, arreglado, tipo, esperado) => {
        expect(svc._traeElArreglo(version, arreglado, tipo)).toBe(esperado);
    });
});

describe('el mismo error después del arreglo', () => {
    test('con la versión del arreglo: fila nueva ligada, el arreglo queda como fallado y llega «El arreglo no funcionó»', async () => {
        ARREGLADO = { id: 40, arreglado_version: '20261103-1950', arreglado_tipo: 'actual' };
        const r = await svc.reportar(USUARIOS[20], { ...FALLA, version: '20261103-1950' }, null, { esperarAviso: true });
        expect(r).toMatchObject({ id: 99, repetido: false, reabierto: true });
        const insert = una('INSERT INTO soporte_errores');
        expect(insert.s).toContain('version_app, reaparecio_de, apartado_id');
        expect(insert.p.slice(-3)).toEqual(['20261103-1950', 40, expect.any(String)]);
        expect(una('UPDATE soporte_errores SET arreglo_fallo_en = NOW()').p).toEqual([40]);
        expect(avisos.enviarA).toHaveBeenCalledTimes(1);
        expect(avisos.enviarA.mock.calls[0][1]).toMatchObject({ titulo: 'El arreglo no funcionó', url: '/soporte?vista=errores' });
        expect(avisos.enviarA.mock.calls[0][1].cuerpo).toBe('Volvió a pasarle a Héctor Herrera en Asistencia diaria, ya con la versión del arreglo. Toca para verlo.');
    });

    test('con una versión más vieja (todavía no tiene el arreglo): error normal, el arreglo sigue vigilando', async () => {
        ARREGLADO = { id: 40, arreglado_version: '20261103-1950', arreglado_tipo: 'actual' };
        const r = await svc.reportar(USUARIOS[20], { ...FALLA, version: '20261102-1615' }, null, { esperarAviso: true });
        expect(r.reabierto).toBeUndefined();
        expect(una('INSERT INTO soporte_errores').p.slice(-3)).toEqual(['20261102-1615', null, expect.any(String)]);
        expect(una('UPDATE soporte_errores SET arreglo_fallo_en')).toBeUndefined();
        expect(avisos.enviarA.mock.calls[0][1].titulo).toBe('Nueva falla en Soporte');
    });

    test('sin versión (app de antes de la mig 150): ni siquiera busca el arreglo', async () => {
        ARREGLADO = { id: 40, arreglado_version: '20261103-1950', arreglado_tipo: 'actual' };
        await svc.reportar(USUARIOS[20], FALLA, null);
        expect(consultas().some(c => c.s.includes('arreglo_fallo_en IS NULL'))).toBe(false);
    });

    test('lo que se repite en 10 minutos no suma sobre uno ya arreglado', async () => {
        await svc.reportar(USUARIOS[20], { ...FALLA, version: '20261103-1950' }, null);
        expect(consultas().find(c => c.s.includes('usuario_id = ? AND firma = ?')).s).toContain("NOT (estado = 'revisado' AND arreglado_version IS NOT NULL)");
    });

    test('sin la mig 150 todavía: el error se guarda igual, como antes', async () => {
        SIN_MIGRACION = true;
        const r = await svc.reportar(USUARIOS[20], { ...FALLA, version: '20261103-1950' }, null);
        expect(r).toMatchObject({ id: 99, repetido: false });
        const inserts = consultas().filter(c => c.s.startsWith('INSERT INTO soporte_errores'));
        expect(inserts).toHaveLength(2);
        expect(inserts[1].s).not.toContain('version_app');
    });

    test('la versión llega por la ruta (la app la manda)', async () => {
        const res = await request(app).post('/api/soporte/errores').set('Authorization', `Bearer ${sesion(USUARIOS[20])}`).send({ ...FALLA, version: '20261103-1950' });
        expect(res.status).toBe(201);
        expect(una('INSERT INTO soporte_errores').p).toContain('20261103-1950');
    });
});

describe('«Arreglado en esta versión»', () => {
    test('marca este y los iguales sin revisar, con la versión y el tipo', async () => {
        AFECTADAS = 3;
        const r = await svc.marcarArreglado({ id: 1 }, 7, { version: '20261103-1950', tipo: 'actual', nota: 'Se corrigió el guardado' });
        expect(r).toEqual({ id: 7, version: '20261103-1950', tipo: 'actual', iguales: 2 });
        const u = una('UPDATE soporte_errores');
        expect(u.s).toContain("WHERE id = ? OR (firma = ? AND estado = 'pendiente')");
        expect(u.p).toEqual([1, 'Se corrigió el guardado', '20261103-1950', 'actual', 7, 'f'.repeat(40)]);
    });

    test('sin versión válida, sin tipo o en algo que no es falla/app/permiso: 400', async () => {
        await expect(svc.marcarArreglado({ id: 1 }, 7, { version: '', tipo: 'actual' })).rejects.toMatchObject({ statusCode: 400, code: 'ERROR_VERSION' });
        await expect(svc.marcarArreglado({ id: 1 }, 7, { version: '20261103-1950', tipo: 'ya' })).rejects.toMatchObject({ statusCode: 400 });
        ERROR = { id: 7, firma: 'f'.repeat(40), categoria: 'lento' };
        await expect(svc.marcarArreglado({ id: 1 }, 7, { version: '20261103-1950', tipo: 'actual' })).rejects.toMatchObject({ statusCode: 400, code: 'ERROR_CATEGORIA' });
    });

    test('volver a «sin revisar» deja de vigilar el arreglo', async () => {
        await svc.revisar({ id: 1 }, 7, { estado: 'pendiente' });
        expect(una('UPDATE soporte_errores').s).toContain('arreglado_version = NULL, arreglado_tipo = NULL');
        await svc.revisar({ id: 1 }, 8, { estado: 'revisado' });
        expect(consultas().filter(c => c.s.trimStart().startsWith('UPDATE soporte_errores'))[1].s).not.toContain('arreglado_version');
    });

    test('la ruta: solo el Super Administrador', async () => {
        const ruta = '/api/soporte/errores/7/arreglado';
        const cuerpo = { version: '20261103-1950', tipo: 'proxima' };
        expect((await request(app).post(ruta).set('Authorization', `Bearer ${sesion(USUARIOS[20])}`).send(cuerpo)).status).toBe(403);
        const ok = await request(app).post(ruta).set('Authorization', `Bearer ${sesion(USUARIOS[1])}`).send(cuerpo);
        expect(ok.status).toBe(200);
        expect(ok.body.data).toMatchObject({ id: 7, tipo: 'proxima' });
    });
});

describe('apartados propios', () => {
    test('crear: con nombre, sin usar los de Bóveda ni repetir', async () => {
        await expect(svc.crearApartado({ id: 1 }, ' ')).rejects.toMatchObject({ statusCode: 400 });
        await expect(svc.crearApartado({ id: 1 }, 'Todos')).rejects.toMatchObject({ statusCode: 409, code: 'ERROR_NOMBRE_RESERVADO' });
        expect(await svc.crearApartado({ id: 1 }, '  Fotos que no suben ')).toEqual({ id: 5, nombre: 'Fotos que no suben', pendientes: 0, por_revisar: 0 });
        db.query.mockRejectedValueOnce(Object.assign(new Error('Duplicate entry'), { errno: 1062 }));
        await expect(svc.crearApartado({ id: 1 }, 'Fotos que no suben')).rejects.toMatchObject({ statusCode: 409, code: 'ERROR_NOMBRE_REPETIDO' });
    });

    test('mover con «los próximos iguales llegan solos»: también los iguales sin revisar, y queda la regla', async () => {
        AFECTADAS = 2;
        expect(await svc.moverAApartado(7, { apartado_id: 5, auto: true })).toEqual({ id: 7, apartado_id: 5, movidos: 2, auto: true });
        const u = una('UPDATE soporte_errores SET apartado_id = ?');
        expect(u.s).toContain("OR (firma = ? AND estado = 'pendiente')");
        expect(u.p).toEqual([5, 7, 'f'.repeat(40)]);
        expect(una('INSERT INTO soporte_apartado_firmas').p).toEqual(['f'.repeat(40), 5]);
    });

    test('mover solo este, o sacarlo del apartado: sin regla para los próximos', async () => {
        await svc.moverAApartado(7, { apartado_id: 5, auto: false });
        expect(una('UPDATE soporte_errores SET apartado_id = ?').p).toEqual([5, 7]);
        expect(una('DELETE FROM soporte_apartado_firmas').p).toEqual(['f'.repeat(40)]);
        jest.clearAllMocks();
        bd();
        await svc.moverAApartado(7, { apartado_id: null });
        expect(una('UPDATE soporte_errores SET apartado_id = ?').p).toEqual([null, 7]);
    });

    test('un error nuevo llega solo a su apartado (por la regla de su firma)', async () => {
        await svc.reportar(USUARIOS[20], FALLA, null);
        expect(una('INSERT INTO soporte_errores').s).toContain('SELECT f.apartado_id FROM soporte_apartado_firmas f WHERE f.firma = ?');
    });

    test('borrar: sus errores vuelven a su vista de siempre', async () => {
        await svc.borrarApartado(5);
        expect(una('UPDATE soporte_errores SET apartado_id = NULL WHERE apartado_id = ?').p).toEqual([5]);
        expect(una('DELETE FROM soporte_apartados').p).toEqual([5]);
    });

    test('las vistas: «ap:<id>» trae el apartado; las de siempre ya no muestran lo que está en uno', async () => {
        await svc.listar('ap:5');
        const lista = consultas().find(c => c.s.includes('FROM soporte_errores e'));
        expect(lista.s).toContain('WHERE e.apartado_id = ?');
        expect(lista.p).toEqual([5]);
        jest.clearAllMocks();
        bd();
        await svc.listar('revisar');
        expect(consultas().find(c => c.s.includes('FROM soporte_errores e')).s).toContain("e.estado = 'pendiente' AND e.apartado_id IS NULL");
    });

    test('las rutas de apartados: solo el Super Administrador', async () => {
        expect((await request(app).get('/api/soporte/errores/apartados').set('Authorization', `Bearer ${sesion(USUARIOS[20])}`)).status).toBe(403);
        expect((await request(app).post('/api/soporte/errores/apartados').set('Authorization', `Bearer ${sesion(USUARIOS[1])}`).send({ nombre: 'Impresión' })).status).toBe(201);
        expect((await request(app).patch('/api/soporte/errores/7/apartado').set('Authorization', `Bearer ${sesion(USUARIOS[1])}`).send({ apartado_id: 5, auto: true })).status).toBe(200);
    });
});
