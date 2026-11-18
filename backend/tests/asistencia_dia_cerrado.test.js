jest.mock('../src/utils/fechaChile', () => {
    const real = jest.requireActual('../src/utils/fechaChile');
    // Miércoles 18 de noviembre de 2026.
    return { ...real, hoyChile: () => '2026-11-18' };
});

const {
    bloquearDiasPasados, primerDiaPasado, inicioDeMes, fechasDeRegistros, fechaDelCuerpo, PERMISO_DIAS_PASADOS, PERMISO_DIAS_DEL_MES,
} = require('../src/middleware/diaCerrado');

/**
 * Día cerrado (Marcos 2026-11-18: «que no tenga la opción de marcar la asistencia si ya pasó, que mejor lo vea
 * Daphne»): sin `asistencia.dias_pasados`, solo se escribe la asistencia de hoy (o adelante).
 */
const respuesta = () => {
    const res = { statusCode: null, body: null };
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (b) => { res.body = b; return res; };
    return res;
};
const correr = async (mw, req) => {
    const res = respuesta();
    const next = jest.fn();
    await mw(req, res, next);
    return { res, next };
};

describe('día cerrado', () => {
    test('el día más antiguo que ya pasó; hoy y mañana no cuentan', () => {
        expect(primerDiaPasado(['2026-11-18', '2026-11-19'])).toBeNull();
        expect(primerDiaPasado(['2026-11-18', '2026-11-17', '2026-11-10'])).toBe('2026-11-10');
        expect(primerDiaPasado(['2026-11-17T00:00:00.000Z'])).toBe('2026-11-17');
        expect(primerDiaPasado([undefined, null, 'basura'])).toBeNull();
    });

    test('jefe de obra: guardar hoy pasa; guardar ayer → 403 DIA_CERRADO con el día', async () => {
        const mw = bloquearDiasPasados(fechasDeRegistros);
        const user = { id: 5, p: ['asistencia.ver', 'asistencia.guardar'] };

        const hoy = await correr(mw, { user, body: { registros: [{ fecha: '2026-11-18' }] } });
        expect(hoy.next).toHaveBeenCalledWith();

        const ayer = await correr(mw, { user, body: { registros: [{ fecha: '2026-11-18' }, { fecha: '2026-11-17' }] } });
        expect(ayer.next).not.toHaveBeenCalled();
        expect(ayer.res.statusCode).toBe(403);
        expect(ayer.res.body).toMatchObject({ codigo: 'DIA_CERRADO', fecha: '2026-11-17' });
        expect(ayer.res.body.error).toMatch(/solo lo puede marcar o corregir RR\.HH\./);
    });

    test('RR.HH. (con el permiso) sí puede un día pasado, sin mirar las fechas', async () => {
        const fechasDe = jest.fn(() => ['2026-10-01']);
        const { next, res } = await correr(bloquearDiasPasados(fechasDe), { user: { p: ['asistencia.guardar', PERMISO_DIAS_PASADOS] }, body: {} });
        expect(next).toHaveBeenCalledWith();
        expect(res.statusCode).toBeNull();
        expect(fechasDe).not.toHaveBeenCalled();
    });

    test('jefe de obra con «días pasados del mes»: cualquier día de noviembre sí; octubre no (confirmado por Daphne)', async () => {
        const mw = bloquearDiasPasados(fechasDeRegistros);
        const user = { p: ['asistencia.guardar', PERMISO_DIAS_DEL_MES] };

        const mes = await correr(mw, { user, body: { registros: [{ fecha: '2026-11-02' }, { fecha: '2026-11-17' }] } });
        expect(mes.next).toHaveBeenCalledWith();

        const octubre = await correr(mw, { user, body: { registros: [{ fecha: '2026-11-17' }, { fecha: '2026-10-30' }] } });
        expect(octubre.next).not.toHaveBeenCalled();
        expect(octubre.res.statusCode).toBe(403);
        expect(octubre.res.body).toMatchObject({ codigo: 'DIA_CERRADO', fecha: '2026-10-30' });
        expect(octubre.res.body.error).toMatch(/mes que ya cerró/);
        expect(inicioDeMes('2026-11-18')).toBe('2026-11-01');
    });

    test('borrar el día / traslado: la fecha del cuerpo; corregir una fila: la fecha de esa fila (async)', async () => {
        const user = { p: ['asistencia.guardar'] };
        const cuerpo = await correr(bloquearDiasPasados(fechaDelCuerpo), { user, body: { fecha: '2026-11-13' } });
        expect(cuerpo.res.statusCode).toBe(403);

        const fila = await correr(bloquearDiasPasados(async () => ['2026-11-18']), { user, params: { id: 9 } });
        expect(fila.next).toHaveBeenCalledWith();
    });

    test('si leer la fecha falla, pasa el error (no deja guardar a ciegas)', async () => {
        const boom = new Error('db caída');
        const { next, res } = await correr(bloquearDiasPasados(async () => { throw boom; }), { user: { p: [] } });
        expect(next).toHaveBeenCalledWith(boom);
        expect(res.statusCode).toBeNull();
    });
});
