/**
 * Sincronización de feriados nacionales (Configuración → Feriados → «Sincronizar», 2026-10-26).
 *
 * El botón fallaba siempre: la ruta POST /feriados/sync se había perdido en el refactor de permisos y la
 * única fuente, apis.digital.gob.cl, dejó de existir. Fija:
 *  - la ruta existe, exige asistencia.feriado.gestionar y valida el año (403 / 400 sin tocar la BD);
 *  - cadena de fuentes: Gobierno → boostr → tabla verificada → Nager (marcada parcial);
 *  - una fuente que responde basura (menos de 12, otro año, sin nombre) cuenta como caída;
 *  - Nager: fuera los regionales; irrenunciables por fecha (Ley 19.973);
 *  - todas caídas → 503 con mensaje accionable;
 *  - al guardar: inserta los nuevos, actualiza nacionales cambiados o desactivados, respeta feriados de
 *    obra en la misma fecha y no reescribe lo que ya está igual;
 *  - la tabla local trae el 17-09-2027 (Ley 20.983), que Nager omite.
 */

jest.mock('../src/config/db', () => ({
    query: jest.fn().mockResolvedValue([[]]),
    getConnection: jest.fn(),
}));

const request = require('supertest');
const jwt = require('jsonwebtoken');
const db = require('../src/config/db');
const feriadosService = require('../src/services/feriados.service');
const TABLA = require('../src/config/feriadosChile');

const { normalizar, obtenerFeriadosNacionales, MIN_FERIADOS } = feriadosService._interno;
const SECRET = process.env.JWT_SECRET || 'secret';
const token = (p) => jwt.sign({ id: 1, email: 'a@lols.cl', rol_id: 2, rv: 1, p }, SECRET);

/** Lista de N feriados válidos del año (formato normalizado). */
const lista = (y, n = 16) => Array.from({ length: n }, (_, i) => ({ fecha: `${y}-${String(1 + Math.floor(i / 2)).padStart(2, '0')}-${String(10 + (i % 2)).padStart(2, '0')}`, nombre: `Feriado ${i}`, irrenunciable: i === 0 }));
const ok = (body) => ({ ok: true, status: 200, json: async () => body });
const caida = () => { throw new TypeError('fetch failed'); };

/** fetch simulado por host: { gobierno, boostr, nager } → función que devuelve la respuesta (o lanza). */
function fakeFetch(por) {
    return jest.fn(async (url) => {
        const host = url.includes('digital.gob.cl') ? 'gobierno' : url.includes('boostr') ? 'boostr' : url.includes('nager') ? 'nager' : '?';
        const h = por[host];
        if (!h) return caida();
        return h(url);
    });
}

describe('feriados: cadena de fuentes', () => {
    test('Gobierno responde → se usa y no se consulta nada más', async () => {
        const f = fakeFetch({ gobierno: () => ok(lista(2027).map(x => ({ ...x, irrenunciable: x.irrenunciable ? '1' : '0' }))) });
        const r = await obtenerFeriadosNacionales(2027, { fetchImpl: f });
        expect(r).toMatchObject({ fuente: 'gobierno', parcial: false });
        expect(r.feriados[0].irrenunciable).toBe(true);
        expect(f).toHaveBeenCalledTimes(1);
    });

    test('Gobierno caído → boostr (formato propio: date/title/inalienable)', async () => {
        const datos = lista(2027).map(x => ({ date: x.fecha, title: x.nombre, inalienable: x.irrenunciable, type: 'Civil' }));
        const f = fakeFetch({ boostr: (url) => { expect(url).toBe('https://api.boostr.cl/holidays/2027.json'); return ok({ status: 'success', data: datos }); } });
        const r = await obtenerFeriadosNacionales(2027, { fetchImpl: f });
        expect(r.fuente).toBe('boostr');
        expect(r.intentos).toEqual([{ fuente: 'gobierno', error: 'fetch failed' }]);
    });

    test('boostr sin el año (lista vacía) → tabla verificada de Bóveda', async () => {
        const f = fakeFetch({ boostr: () => ok({ status: 'success', data: [] }) });
        const r = await obtenerFeriadosNacionales(2027, { fetchImpl: f });
        expect(r).toMatchObject({ fuente: 'tabla', parcial: false });
        expect(r.feriados).toHaveLength(TABLA[2027].length);
        expect(r.intentos.map(i => i.fuente)).toEqual(['gobierno', 'boostr']);
    });

    test('año fuera de la tabla → Nager, PARCIAL, sin regionales e irrenunciables por fecha', async () => {
        const nager = [
            ...lista(2030).map(x => ({ date: x.fecha, localName: x.nombre, global: true, counties: null })),
            { date: '2030-06-07', localName: 'Asalto y Toma del Morro de Arica', global: false, counties: ['CL-AP'] },
            { date: '2030-09-18', localName: 'Fiestas Patrias', global: true, counties: null },
        ];
        const f = fakeFetch({ nager: () => ok(nager) });
        const r = await obtenerFeriadosNacionales(2030, { fetchImpl: f });
        expect(r).toMatchObject({ fuente: 'nager', parcial: true });
        expect(r.feriados.find(x => x.fecha === '2030-06-07')).toBeUndefined();
        expect(r.feriados.find(x => x.fecha === '2030-09-18').irrenunciable).toBe(true);
        expect(r.feriados.find(x => x.fecha === '2030-01-10').irrenunciable).toBe(false);
    });

    test('todas caídas → 503 con mensaje accionable y el detalle de cada intento', async () => {
        const f = fakeFetch({ boostr: () => ({ ok: false, status: 500, json: async () => ({}) }) });
        await expect(obtenerFeriadosNacionales(2031, { fetchImpl: f })).rejects.toMatchObject({
            statusCode: 503,
            message: expect.stringMatching(/ninguna fuente.*a mano/),
            details: { intentos: [
                { fuente: 'gobierno', error: 'fetch failed' },
                { fuente: 'boostr', error: 'HTTP 500' },
                { fuente: 'tabla', error: 'el año 2031 no está en la tabla' },
                { fuente: 'nager', error: 'fetch failed' },
            ] },
        });
    });

    test('normalizar: descarta otro año, sin nombre y duplicados; menos del mínimo = fuente rota', () => {
        const sucia = [...lista(2027), { fecha: '2026-12-31', nombre: 'del año anterior' }, { fecha: '2027-12-30', nombre: '  ' }, { fecha: lista(2027)[0].fecha, nombre: 'duplicado' }];
        const n = normalizar(sucia, 2027);
        expect(n).toHaveLength(16);
        expect(n.every(x => x.fecha.startsWith('2027-'))).toBe(true);
        expect(n.find(x => x.fecha === lista(2027)[0].fecha).nombre).toBe('Feriado 0');
        expect(() => normalizar(lista(2027, MIN_FERIADOS - 1), 2027)).toThrow(/solo 11/);
        expect(() => normalizar({ no: 'array' }, 2027)).toThrow(/inesperada/);
    });
});

describe('feriados: tabla verificada', () => {
    test('2026 y 2027 completos, ordenados, con los 5 irrenunciables y el 17-09-2027 (Ley 20.983)', () => {
        for (const y of [2026, 2027]) {
            const filas = normalizar(TABLA[y].map(([fecha, nombre, irr]) => ({ fecha, nombre, irrenunciable: !!irr })), y);
            expect(filas.length).toBeGreaterThanOrEqual(15);
            expect(filas.filter(f => f.irrenunciable).map(f => f.fecha.slice(5))).toEqual(['01-01', '05-01', '09-18', '09-19', '12-25']);
        }
        expect(TABLA[2027].some(([f]) => f === '2027-09-17')).toBe(true);
        expect(TABLA[2026].some(([f]) => f === '2026-09-17')).toBe(false);
        expect(TABLA[2026].some(([f]) => f.endsWith('-06-07'))).toBe(false); // nada regional
    });
});

describe('feriados: guardado', () => {
    beforeEach(() => db.query.mockReset());

    test('inserta los nuevos, actualiza nacionales cambiados o desactivados, respeta los de obra y no toca lo igual', async () => {
        const fuente = lista(2027, 13);
        const [igual, cambiado, desactivado, deObra] = fuente;
        db.query.mockImplementation(async (sql) => {
            if (sql.startsWith('SELECT')) return [[
                { id: 1, fecha: igual.fecha, nombre: igual.nombre, tipo: 'nacional', irrenunciable: 1, activo: 1 },
                { id: 2, fecha: cambiado.fecha, nombre: 'Nombre viejo', tipo: 'nacional', irrenunciable: 0, activo: 1 },
                { id: 3, fecha: desactivado.fecha, nombre: desactivado.nombre, tipo: 'nacional', irrenunciable: 0, activo: 0 },
                { id: 4, fecha: deObra.fecha, nombre: 'Aniversario de la obra', tipo: 'obra', irrenunciable: 0, activo: 1 },
            ]];
            return [{ affectedRows: 1, insertId: 99 }];
        });
        const f = fakeFetch({ boostr: () => ok({ status: 'success', data: fuente.map(x => ({ date: x.fecha, title: x.nombre, inalienable: x.irrenunciable })) }) });
        const r = await feriadosService.syncNacionalHolidays(2027, { fetchImpl: f });

        expect(r).toMatchObject({ success: true, year: 2027, fuente: 'boostr', fuenteNombre: 'boostr.cl', parcial: false, count: 13, nuevos: 9, actualizados: 2, respetados: 1 });
        const inserts = db.query.mock.calls.filter(([sql]) => sql.startsWith('INSERT'));
        const updates = db.query.mock.calls.filter(([sql]) => sql.startsWith('UPDATE'));
        expect(inserts).toHaveLength(9);
        expect(inserts[0][0]).toContain("'nacional'");
        expect(updates.map(([, p]) => p[2]).sort()).toEqual([2, 3]);   // ni el igual (1) ni el de obra (4)
        expect(db.query.mock.calls[0][1]).toEqual(['2027-01-01', '2027-12-31']);
    });
});

describe('POST /api/feriados/sync', () => {
    const app = require('../index');
    let spy;
    beforeEach(() => {
        db.query.mockReset().mockResolvedValue([[]]);
        spy = jest.spyOn(feriadosService, 'syncNacionalHolidays').mockResolvedValue({ success: true, year: 2027, fuente: 'boostr', count: 17, nuevos: 17 });
    });
    afterEach(() => spy.mockRestore());

    test('existe (antes 404) y devuelve el resumen', async () => {
        const res = await request(app).post('/api/feriados/sync').set('Authorization', `Bearer ${token(['asistencia.feriado.gestionar'])}`).send({ year: 2027 });
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ fuente: 'boostr', nuevos: 17 });
        expect(spy).toHaveBeenCalledWith(2027);
    });

    test('403 sin asistencia.feriado.gestionar (ver asistencia no alcanza) y sin llamar al servicio', async () => {
        const res = await request(app).post('/api/feriados/sync').set('Authorization', `Bearer ${token(['asistencia.ver'])}`).send({ year: 2027 });
        expect(res.status).toBe(403);
        expect(spy).not.toHaveBeenCalled();
    });

    test('400 con año ausente, con decimales o absurdo', async () => {
        const t = token(['asistencia.feriado.gestionar']);
        for (const body of [{}, { year: 2027.5 }, { year: 1999 }, { year: new Date().getFullYear() + 5 }]) {
            const res = await request(app).post('/api/feriados/sync').set('Authorization', `Bearer ${t}`).send(body);
            expect(res.status).toBe(400);
        }
        expect(spy).not.toHaveBeenCalled();
    });

    test('las fuentes caídas llegan como 503 con el mensaje', async () => {
        spy.mockRejectedValue(Object.assign(new Error('No se pudieron obtener los feriados de 2031 de ninguna fuente. Cárgalos a mano con «Nuevo feriado».'), { statusCode: 503 }));
        const res = await request(app).post('/api/feriados/sync').set('Authorization', `Bearer ${token(['asistencia.feriado.gestionar'])}`).send({ year: 2027 });
        expect(res.status).toBe(503);
        expect(res.body.error).toMatch(/a mano/);
    });
});
