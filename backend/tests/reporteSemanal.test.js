/**
 * Tests del Reporte Semanal RRHH (data-building + date math + render + envío).
 * Sin DB real: db.query mockeado. email.service mockeado (no envía de verdad).
 */
jest.mock('../src/services/email.service', () => ({
    sendSystemEmail: jest.fn().mockResolvedValue({ messageId: 'test-msg-id', accepted: ['ok'], rejected: [] }),
}));
const emailService = require('../src/services/email.service');
const svc = require('../src/services/reporteSemanal.service');

describe('getSemanaPrevia — ventana lunes a domingo de la semana anterior', () => {
    test('ref lunes 2026-05-25 → 2026-05-18 a 2026-05-24', () => {
        expect(svc.getSemanaPrevia('2026-05-25')).toEqual({ desde: '2026-05-18', hasta: '2026-05-24' });
    });

    test('ref miércoles 2026-05-27 → misma semana previa', () => {
        expect(svc.getSemanaPrevia('2026-05-27')).toEqual({ desde: '2026-05-18', hasta: '2026-05-24' });
    });

    test('ref domingo 2026-05-24 → 2026-05-11 a 2026-05-17', () => {
        expect(svc.getSemanaPrevia('2026-05-24')).toEqual({ desde: '2026-05-11', hasta: '2026-05-17' });
    });

    test('desde es lunes y hasta es domingo (hasta = desde + 6 días)', () => {
        const { desde, hasta } = svc.getSemanaPrevia('2026-05-25');
        const dDesde = new Date(desde + 'T00:00:00');
        const dHasta = new Date(hasta + 'T00:00:00');
        expect(dDesde.getDay()).toBe(1); // lunes
        expect(dHasta.getDay()).toBe(0); // domingo
        expect((dHasta - dDesde) / 86400000).toBe(6);
    });
});

describe('buildReportData — queries + transformación', () => {
    function makeDb({
        contrataciones = [], desvinculaciones = [], faltas = [], aniversarios = [],
        faltasMes = [], contratacionesMes = [], desvinculacionesMes = [],
    } = {}) {
        return {
            query: jest.fn()
                .mockResolvedValueOnce([contrataciones])
                .mockResolvedValueOnce([desvinculaciones])
                .mockResolvedValueOnce([faltas])
                .mockResolvedValueOnce([aniversarios])
                .mockResolvedValueOnce([faltasMes])
                .mockResolvedValueOnce([contratacionesMes])
                .mockResolvedValueOnce([desvinculacionesMes]),
        };
    }

    test('arma nombre completo y mapea campos de contratación', async () => {
        const db = makeDb({
            contrataciones: [{
                rut: '11.111.111-1', nombres: 'Juan', apellido_paterno: 'Pérez', apellido_materno: 'Soto',
                fecha_ingreso: '2026-05-20', empresa: 'LOLS SpA', obra: 'ABATE 80', cargo: 'Jornal',
            }],
        });
        const data = await svc.buildReportData(db, { desde: '2026-05-18', hasta: '2026-05-24' });
        expect(db.query).toHaveBeenCalledTimes(7);
        expect(data.contrataciones).toHaveLength(1);
        expect(data.contrataciones[0]).toMatchObject({
            rut: '11.111.111-1', nombre: 'Juan Pérez Soto', empresa: 'LOLS SpA', obra: 'ABATE 80', cargo: 'Jornal',
            fecha_ingreso: '2026-05-20',
        });
        expect(data.totales.contrataciones).toBe(1);
    });

    test('agrupa faltas por trabajador y lista fechas', async () => {
        const db = makeDb({
            faltas: [
                { trabajador_id: 7, rut: '9-9', nombres: 'Ana', apellido_paterno: 'Díaz', apellido_materno: null, obra: 'EW 195', fecha: '2026-05-19' },
                { trabajador_id: 7, rut: '9-9', nombres: 'Ana', apellido_paterno: 'Díaz', apellido_materno: null, obra: 'EW 195', fecha: '2026-05-21' },
                { trabajador_id: 8, rut: '8-8', nombres: 'Luis', apellido_paterno: 'Rojas', apellido_materno: 'M', obra: 'DOMEYKO', fecha: '2026-05-20' },
            ],
        });
        const data = await svc.buildReportData(db, { desde: '2026-05-18', hasta: '2026-05-24' });
        expect(data.faltas).toHaveLength(2);
        const ana = data.faltas.find(f => f.rut === '9-9');
        expect(ana.total).toBe(2);
        expect(ana.fechas).toEqual(['2026-05-19', '2026-05-21']);
        expect(data.totales.faltas).toBe(2);
        expect(data.totales.faltas_dias).toBe(3);
    });

    test('secciones vacías → arrays vacíos y totales en 0', async () => {
        const db = makeDb({});
        const data = await svc.buildReportData(db, { desde: '2026-05-18', hasta: '2026-05-24' });
        expect(data.contrataciones).toEqual([]);
        expect(data.desvinculaciones).toEqual([]);
        expect(data.faltas).toEqual([]);
        expect(data.aniversarios).toEqual([]);
        expect(data.porObra).toEqual([]);
        expect(data.totales).toMatchObject({ contrataciones: 0, desvinculaciones: 0, faltas: 0, faltas_dias: 0, aniversarios: 0, obras: 0 });
    });

    test('porObra: agrega altas/bajas/faltas por obra, agrupa nulos en "Sin obra", ordena por faltas', async () => {
        const db = makeDb({
            contrataciones: [
                { rut: '1', nombres: 'A', apellido_paterno: 'A', apellido_materno: null, fecha_ingreso: '2026-05-20', empresa: 'E', obra: 'ABATE 80', cargo: 'J' },
                { rut: '2', nombres: 'B', apellido_paterno: 'B', apellido_materno: null, fecha_ingreso: '2026-05-21', empresa: 'E', obra: null, cargo: 'J' },
            ],
            desvinculaciones: [
                { rut: '3', nombres: 'C', apellido_paterno: 'C', apellido_materno: null, fecha_desvinculacion: '2026-05-22', empresa: 'E', obra: 'ABATE 80', cargo: 'J' },
            ],
            faltas: [
                { trabajador_id: 7, rut: '9', nombres: 'D', apellido_paterno: 'D', apellido_materno: null, obra: 'EW 195', fecha: '2026-05-19' },
                { trabajador_id: 7, rut: '9', nombres: 'D', apellido_paterno: 'D', apellido_materno: null, obra: 'EW 195', fecha: '2026-05-20' },
                { trabajador_id: 8, rut: '8', nombres: 'E', apellido_paterno: 'E', apellido_materno: null, obra: 'EW 195', fecha: '2026-05-20' },
            ],
        });
        const data = await svc.buildReportData(db, { desde: '2026-05-18', hasta: '2026-05-24' });
        const ew = data.porObra.find(o => o.obra === 'EW 195');
        const abate = data.porObra.find(o => o.obra === 'ABATE 80');
        const sinObra = data.porObra.find(o => o.obra === 'Sin obra');
        expect(ew).toMatchObject({ altas: 0, bajas: 0, faltas_dias: 3, trabajadores_falta: 2 });
        expect(abate).toMatchObject({ altas: 1, bajas: 1, faltas_dias: 0, trabajadores_falta: 0 });
        expect(sinObra).toMatchObject({ altas: 1, bajas: 0, faltas_dias: 0 });
        expect(data.totales.obras).toBe(3);
        // Orden: la obra con más faltas (días) primero.
        expect(data.porObra[0].obra).toBe('EW 195');
    });

    test("la query de faltas filtra por estado código 'F' (Falta), NO 'A' (Asiste=presente)", async () => {
        const db = makeDb({});
        await svc.buildReportData(db, { desde: '2026-05-18', hasta: '2026-05-24' });
        const faltasCall = db.query.mock.calls[2][0];
        expect(faltasCall).toMatch(/es\.codigo\s*=\s*'F'/);
        expect(faltasCall).not.toMatch(/es\.codigo\s*=\s*'A'/);
    });

    test('normaliza fechas de mysql2 (objeto Date) a YYYY-MM-DD, no a inglés ("Mon Jun 22")', async () => {
        const db = makeDb({
            faltas: [
                { trabajador_id: 5, rut: '1-1', nombres: 'X', apellido_paterno: 'Y', apellido_materno: null, obra: 'O', fecha: new Date(2026, 5, 22) },
            ],
            contrataciones: [
                { rut: '2-2', nombres: 'A', apellido_paterno: 'B', apellido_materno: null, fecha_ingreso: new Date(2026, 5, 20), empresa: 'E', obra: 'O', cargo: 'C' },
            ],
        });
        const data = await svc.buildReportData(db, { desde: '2026-06-22', hasta: '2026-06-28' });
        expect(data.faltas[0].fechas[0]).toBe('2026-06-22');
        expect(data.contrataciones[0].fecha_ingreso).toBe('2026-06-20');
        expect(data.faltas[0].fechas[0]).not.toMatch(/[A-Za-z]/); // sin nombres de día/mes en inglés
    });

    test('la query de aniversarios usa PERIOD_DIFF = 10', async () => {
        const db = makeDb({});
        await svc.buildReportData(db, { desde: '2026-05-18', hasta: '2026-05-24' });
        const anivCall = db.query.mock.calls[3][0];
        expect(anivCall).toMatch(/PERIOD_DIFF/);
        expect(anivCall).toMatch(/=\s*10/);
    });

    test('corre 7 queries; las de tendencias agrupan por mes (DATE_FORMAT %Y-%m)', async () => {
        const db = makeDb({});
        await svc.buildReportData(db, { desde: '2026-05-18', hasta: '2026-05-24', ref: '2026-05-18' });
        expect(db.query).toHaveBeenCalledTimes(7);
        const faltasMesSql = db.query.mock.calls[4][0];
        expect(faltasMesSql).toMatch(/DATE_FORMAT\(a\.fecha, '%Y-%m'\)/);
        expect(faltasMesSql).toMatch(/es\.codigo\s*=\s*'F'/);
        expect(db.query.mock.calls[5][0]).toMatch(/fecha_ingreso >= \? AND fecha_ingreso < \?/);
        expect(db.query.mock.calls[6][0]).toMatch(/fecha_desvinculacion >= \? AND fecha_desvinculacion < \?/);
    });

    test('tendencias: 6 meses con zero-fill, terminando en el mes de ref', async () => {
        const db = makeDb({
            faltasMes: [{ ym: '2026-05', total: 3 }, { ym: '2026-03', total: 7 }],
            contratacionesMes: [{ ym: '2026-05', total: 2 }],
            desvinculacionesMes: [{ ym: '2026-04', total: 1 }],
        });
        const data = await svc.buildReportData(db, { desde: '2026-05-18', hasta: '2026-05-24', ref: '2026-05-18' });
        expect(data.tendencias.faltasMes).toHaveLength(6);
        expect(data.tendencias.movimientoMes).toHaveLength(6);
        expect(data.tendencias.faltasMes[5]).toEqual({ label: 'May', valor: 3 });
        expect(data.tendencias.faltasMes[3]).toEqual({ label: 'Mar', valor: 7 });
        expect(data.tendencias.faltasMes[0]).toEqual({ label: 'Dic', valor: 0 });
        expect(data.tendencias.movimientoMes[5]).toMatchObject({ label: 'May', contrataciones: 2, desvinculaciones: 0 });
        expect(data.tendencias.movimientoMes[4]).toMatchObject({ label: 'Abr', desvinculaciones: 1 });
    });

    test('aniversariosVigentes: true solo el 1er lunes del mes', async () => {
        const a = await svc.buildReportData(makeDb({}), { desde: '2026-04-27', hasta: '2026-05-03', ref: '2026-05-04' });
        expect(a.aniversariosVigentes).toBe(true); // 1er lunes de mayo 2026
        const b = await svc.buildReportData(makeDb({}), { desde: '2026-05-18', hasta: '2026-05-24', ref: '2026-05-18' });
        expect(b.aniversariosVigentes).toBe(false); // 3er lunes
    });
});

describe('helpers de tendencias / cadencia', () => {
    test('esPrimerLunesDelMes', () => {
        expect(svc._internals.esPrimerLunesDelMes('2026-05-04')).toBe(true);  // lunes, día 4
        expect(svc._internals.esPrimerLunesDelMes('2026-05-18')).toBe(false); // 3er lunes
        expect(svc._internals.esPrimerLunesDelMes('2026-05-06')).toBe(false); // miércoles
    });

    test('toYmd: Date → YYYY-MM-DD local; string-fecha se conserva; null→null', () => {
        expect(svc._internals.toYmd(new Date(2026, 5, 22))).toBe('2026-06-22'); // mes 5 = junio
        expect(svc._internals.toYmd('2026-06-22')).toBe('2026-06-22');
        expect(svc._internals.toYmd('2026-06-22T00:00:00.000Z')).toBe('2026-06-22');
        expect(svc._internals.toYmd(null)).toBeNull();
    });

    test('spineMeses devuelve N meses terminando en el mes de ref', () => {
        const s = svc._internals.spineMeses('2026-05-18', 6);
        expect(s).toHaveLength(6);
        expect(s[5]).toEqual({ key: '2026-05', label: 'May' });
        expect(s[0]).toEqual({ key: '2025-12', label: 'Dic' });
    });
});

describe('renderHtml / renderText — puro, sin DB', () => {
    const sampleData = {
        rango: { desde: '2026-05-18', hasta: '2026-05-24' },
        generado_en: new Date().toISOString(),
        contrataciones: [{ rut: '1-1', nombre: 'Juan Pérez', empresa: 'LOLS', obra: 'ABATE', cargo: 'Jornal', fecha_ingreso: '2026-05-20' }],
        desvinculaciones: [],
        faltas: [{ rut: '9-9', nombre: 'Ana Díaz', obra: 'EW 195', total: 2, fechas: ['2026-05-19', '2026-05-21'] }],
        aniversarios: [],
        totales: { contrataciones: 1, desvinculaciones: 0, faltas: 1, faltas_dias: 2, aniversarios: 0 },
    };

    test('HTML incluye el rango y los datos, y escapa', () => {
        const html = svc.renderHtml(sampleData);
        expect(html).toContain('<!DOCTYPE html>');
        expect(html).toContain('18-05-2026');
        expect(html).toContain('Juan Pérez');
        expect(html).toContain('Ana Díaz');
        expect(html).toContain('Reporte Semanal RRHH');
    });

    test('sin logoCid usa header de texto; con logoCid usa cid:', () => {
        expect(svc.renderHtml(sampleData)).toContain('LOLS Ingeniería');
        expect(svc.renderHtml(sampleData, { logoCid: 'logoLols' })).toContain('cid:logoLols');
    });

    test('renderText incluye secciones y conteos', () => {
        const txt = svc.renderText(sampleData);
        expect(txt).toContain('REPORTE SEMANAL RRHH');
        expect(txt).toContain('Juan Pérez');
        expect(txt).toContain('Ana Díaz');
        expect(txt).toMatch(/Faltas injustificadas \(1 trabajadores, 2 días\)/);
    });

    test('escapa HTML malicioso en nombres', () => {
        const evil = {
            ...sampleData,
            contrataciones: [{ rut: '1', nombre: '<script>x</script>', empresa: 'E', obra: 'O', cargo: 'C', fecha_ingreso: '2026-05-20' }],
        };
        const html = svc.renderHtml(evil);
        expect(html).not.toContain('<script>x</script>');
        expect(html).toContain('&lt;script&gt;');
    });

    test('incluye gráficos solo si hay tendencias', () => {
        expect(svc.renderHtml(sampleData)).not.toContain('Faltas injustificadas por mes');
        const conTend = {
            ...sampleData,
            tendencias: {
                faltasMes: [{ label: 'May', valor: 3 }],
                movimientoMes: [{ label: 'May', contrataciones: 1, desvinculaciones: 0 }],
            },
        };
        const html = svc.renderHtml(conTend);
        expect(html).toContain('Faltas injustificadas por mes');
        expect(html).toContain('Contrataciones vs Desvinculaciones');
    });

    test('aniversariosVigentes:false → nota y KPI con guion', () => {
        const html = svc.renderHtml({ ...sampleData, aniversariosVigentes: false });
        expect(html).toContain('se informan en el primer reporte de cada mes');
        expect(html).toContain('se informa 1er lunes');
    });

    test('renderHtml incluye la sección "Resumen por obra" con los nombres de obra', () => {
        const d = { ...sampleData, porObra: [{ obra: 'ABATE 80', altas: 2, bajas: 0, faltas_dias: 3, trabajadores_falta: 1 }] };
        const html = svc.renderHtml(d);
        expect(html).toContain('Resumen por obra');
        expect(html).toContain('ABATE 80');
    });

    test('renderHtml: sin movimiento por obra → estado vacío', () => {
        const html = svc.renderHtml({ ...sampleData, porObra: [] });
        expect(html).toContain('Resumen por obra');
        expect(html).toContain('Sin movimiento por obra');
    });

    test('renderText incluye el bloque "Resumen por obra"', () => {
        const d = { ...sampleData, porObra: [{ obra: 'ABATE 80', altas: 2, bajas: 0, faltas_dias: 3, trabajadores_falta: 1 }] };
        const txt = svc.renderText(d);
        expect(txt).toContain('Resumen por obra');
        expect(txt).toContain('ABATE 80');
    });
});

describe('resolveRecipients — precedencia to > tabla > env', () => {
    const OLD_ENV = process.env.REPORTE_TO;
    afterEach(() => { process.env.REPORTE_TO = OLD_ENV; });

    test('--to / array explícito tiene prioridad (no consulta DB)', async () => {
        const db = { query: jest.fn() };
        expect(await svc.resolveRecipients(db, 'a@b.cl, c@d.cl')).toEqual(['a@b.cl', 'c@d.cl']);
        expect(await svc.resolveRecipients(db, ['x@y.cl'])).toEqual(['x@y.cl']);
        expect(db.query).not.toHaveBeenCalled();
    });

    test('sin to → usa suscriptores activos de la tabla', async () => {
        const db = { query: jest.fn().mockResolvedValueOnce([[{ email: 'uno@lols.cl' }, { email: 'dos@lols.cl' }]]) };
        expect(await svc.resolveRecipients(db)).toEqual(['uno@lols.cl', 'dos@lols.cl']);
    });

    test('tabla vacía → cae a env REPORTE_TO', async () => {
        process.env.REPORTE_TO = 'env1@lols.cl, env2@lols.cl';
        const db = { query: jest.fn().mockResolvedValueOnce([[]]) };
        expect(await svc.resolveRecipients(db)).toEqual(['env1@lols.cl', 'env2@lols.cl']);
    });

    test('tabla inexistente (errno 1146) → cae a env REPORTE_TO', async () => {
        process.env.REPORTE_TO = 'fallback@lols.cl';
        const err = Object.assign(new Error('no such table'), { errno: 1146 });
        const db = { query: jest.fn().mockRejectedValueOnce(err) };
        expect(await svc.resolveRecipients(db)).toEqual(['fallback@lols.cl']);
    });

    test('error de DB distinto a 1146 se propaga', async () => {
        const err = Object.assign(new Error('connection lost'), { errno: 2013 });
        const db = { query: jest.fn().mockRejectedValueOnce(err) };
        await expect(svc.resolveRecipients(db)).rejects.toThrow('connection lost');
    });
});

describe('enviarReporteSemanal — orquestación (db + email mockeados)', () => {
    // buildReportData hace 7 queries; mock en orden.
    function makeDb7() {
        return {
            query: jest.fn()
                .mockResolvedValueOnce([[]])   // contrataciones
                .mockResolvedValueOnce([[]])   // desvinculaciones
                .mockResolvedValueOnce([[]])   // faltas
                .mockResolvedValueOnce([[]])   // aniversarios
                .mockResolvedValueOnce([[]])   // faltasMes
                .mockResolvedValueOnce([[]])   // contratacionesMes
                .mockResolvedValueOnce([[]]),  // desvinculacionesMes
        };
    }
    beforeEach(() => { emailService.sendSystemEmail.mockClear(); });

    test('dry-run retorna preview y NO envía', async () => {
        const db = makeDb7();
        const r = await svc.enviarReporteSemanal({ db, fecha: '2026-05-25', dry: true });
        expect(r.dry).toBe(true);
        expect(r.html).toContain('<!DOCTYPE html>');
        expect(r.text).toContain('REPORTE SEMANAL RRHH');
        expect(r.subject).toMatch(/^Reporte Semanal RRHH —/);
        expect(emailService.sendSystemEmail).not.toHaveBeenCalled();
    });

    test('envío con to explícito llama sendSystemEmail una vez a ese destinatario', async () => {
        const db = makeDb7();
        const r = await svc.enviarReporteSemanal({ db, to: ['rrhh@lols.cl'], fecha: '2026-05-25', dry: false });
        expect(emailService.sendSystemEmail).toHaveBeenCalledTimes(1);
        const arg = emailService.sendSystemEmail.mock.calls[0][0];
        expect(arg.to).toEqual(['rrhh@lols.cl']);
        expect(arg.subject).toMatch(/^Reporte Semanal RRHH —/);
        expect(arg.html).toContain('<!DOCTYPE html>');
        expect(r.messageId).toBe('test-msg-id');
        expect(r.recipients).toEqual(['rrhh@lols.cl']);
    });

    test('sin destinatarios (to vacío + env vacío + tabla vacía) lanza error', async () => {
        const prev = process.env.REPORTE_TO;
        process.env.REPORTE_TO = '';
        const db = makeDb7();
        db.query.mockResolvedValueOnce([[]]); // 8ª query: suscriptores activos vacíos
        await expect(svc.enviarReporteSemanal({ db, fecha: '2026-05-25', dry: false }))
            .rejects.toThrow(/Sin destinatarios/);
        expect(emailService.sendSystemEmail).not.toHaveBeenCalled();
        process.env.REPORTE_TO = prev;
    });
});
