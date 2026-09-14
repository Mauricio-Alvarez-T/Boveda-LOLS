/**
 * /api/documentos-laborales + gates de restricción (plan Gestiones B2, mig 110).
 *
 *  - 403 con gates EXCLUSIVOS (emitir / descargar) sin tocar la BD; documentos.descargar NO alcanza.
 *  - Emitir: escribe el .doc (BOM) en uploads/<tid>/, INSERT origen='generado' con metadata, log manual
 *    sin montos; 409 datos faltantes (sin representante / sin sueldo) ANTES de escribir; 409 desvinculado.
 *  - Kit: valida todos los documentos antes de escribir el primero.
 *  - Degradación 1054 (mig 110 pendiente) en trabajador/empresa, getByTrabajador, getFilePath, marcarDescargado.
 *  - GET /documentos/download/:id → 403 si el tipo es restringido y falta laborales.descargar.
 *  - ZIP de la ficha y ZIP de fiscalización (correo) omiten restringidos (+ header X-Documentos-Omitidos).
 *  - Listado de documentos NUNCA proyecta metadata ni d.*.
 *  - Tipos del sistema: no se desactivan / no se eliminan (409).
 *  - GET /solicitudes-ingreso/:id/doc: pendiente → .doc al vuelo; aprobada → persistido + descarga.
 */
const fs = require('fs');
const { EventEmitter } = require('events');

jest.mock('../src/config/db', () => ({
    query: jest.fn().mockResolvedValue([[]]),
    getConnection: jest.fn(),
}));
jest.mock('../src/middleware/logger', () => ({
    logManualActivity: jest.fn().mockResolvedValue(undefined),
    activityLogger: (req, res, next) => next(),
    resolveEntidad: jest.fn(),
}));
const archiverStub = { files: [], _out: null };
jest.mock('archiver', () => () => ({
    pipe(out) { archiverStub._out = out; },
    file(p, opts) { archiverStub.files.push(opts.name); },
    on() {},
    async finalize() { const o = archiverStub._out; if (!o) return; if (typeof o.setHeader === 'function') o.end(); else setImmediate(() => o.emit('close')); },
}));

const request = require('supertest');
const express = require('express');
const app = require('../index');
const db = require('../src/config/db');
const { logManualActivity } = require('../src/middleware/logger');
const documentoService = require('../src/services/documento.service');
const zipService = require('../src/services/zip.service');
const { resetSchemaCache } = require('../src/utils/schema');
const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'secret';
const makeToken = (permisos) => jwt.sign({ id: 3, email: 'rrhh@lols.cl', rol_id: 2, rv: 1, p: permisos }, SECRET);
const tokenEmitir = makeToken(['documentos.laborales.emitir']);
const tokenDescargar = makeToken(['documentos.laborales.descargar']);
const tokenDocsLegacy = makeToken(['documentos.descargar', 'documentos.ver']);
const tokenTerreno = makeToken(['asistencia.ver']);

const BASE = '/api/documentos-laborales';
const sqlCalls = () => db.query.mock.calls.map(c => String(c[0]));
const err1054 = () => Object.assign(new Error("Unknown column 'x'"), { errno: 1054, code: 'ER_BAD_FIELD_ERROR' });

const TRAB = {
    id: 5, rut: '12.345.678-5', nombres: 'Juan Andrés', apellido_paterno: 'Pérez', apellido_materno: 'Soto', fecha_ingreso: '2026-08-31', activo: 1,
    nacionalidad: 'chilena', estado_civil: 'casado', fecha_nacimiento: '1995-12-03', direccion: 'Av. España 505', comuna: 'Santiago',
    empresa_id: 1, cargo_id: 2, obra_id: 7, cargo_nombre: 'Jornal', obra_nombre: 'Edificio Central',
    empresa_rut: '77.085.560-8', empresa_razon_social: 'LOLS Empresas de Ingeniería Ltda.', empresa_direccion: 'El Mirador 150, Cerrillos',
    representante_nombre: 'Luis Lazcano Silva', representante_rut: '7.907.220-6',
};
const TIPO = (codigo) => [{ id: 9, nombre: `${codigo} (Bóveda)` }];
const RUTS = [{ rut_trabajador: '12.345.678-5', rut_empresa: '77.085.560-8' }];
const SUELDO = [{ id: 1, cargo_id: 2, sueldo_base: 553553, bono_colacion: 0, bono_movilizacion: 0, observaciones: null, actualizado_por: null, updated_at: 'x', cargo_nombre: 'Jornal' }];

let spies = [];
beforeEach(() => {
    db.query.mockReset().mockResolvedValue([[]]);
    logManualActivity.mockClear();
    archiverStub.files = []; archiverStub._out = null;
    const realRead = fs.readFileSync.bind(fs);
    spies = [
        jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {}),
        jest.spyOn(fs, 'mkdirSync').mockImplementation(() => {}),
        jest.spyOn(fs, 'existsSync').mockImplementation(() => true),
        jest.spyOn(fs, 'unlink').mockImplementation((p, cb) => cb && cb()),
        jest.spyOn(fs, 'readFileSync').mockImplementation((p, enc) => (String(p).includes('uploads') ? '﻿<!DOCTYPE html><html><body>DOC</body></html>' : realRead(p, enc))),
        jest.spyOn(express.response, 'download').mockImplementation(function (p, name) { this.status(200).send(`FILE:${name}`); }),
    ];
});
afterEach(() => spies.forEach(s => s.mockRestore()));

// ─────────────────────────────────────────────────────────────────────────────
describe('gates exclusivos (403 sin tocar la BD)', () => {
    test.each([
        ['POST', `${BASE}/emitir/5`, tokenDescargar],
        ['POST', `${BASE}/kit-ingreso/5`, tokenDescargar],
        ['GET', `${BASE}/501/download`, tokenEmitir],
        ['GET', `${BASE}/501/download`, tokenDocsLegacy],   // documentos.descargar NO alcanza
        ['GET', `${BASE}/501/html`, tokenDocsLegacy],
        ['GET', `/api/solicitudes-ingreso/41/doc`, tokenDocsLegacy],
        ['GET', `${BASE}/trabajador/5`, tokenTerreno],
    ])('%s %s → 403', async (method, url, token) => {
        const res = await request(app)[method.toLowerCase()](url).set('Authorization', `Bearer ${token}`).send({ codigo: 'DAS', documentos: ['DAS'] });
        expect(res.status).toBe(403);
        expect(db.query).not.toHaveBeenCalled();
    });

    test('GET /catalogo (auth) → kit de 6 + emitibles + defaults', async () => {
        const res = await request(app).get(`${BASE}/catalogo`).set('Authorization', `Bearer ${tokenTerreno}`);
        expect(res.status).toBe(200);
        expect(res.body.data.kit.map(k => k.codigo)).toEqual(['CONTRATO', 'ODI_D40', 'DAS', 'PTS_ALTURA', 'EPP_RECEPCION', 'RI_RECEPCION']);
        expect(res.body.data.emitibles).toHaveLength(8);   // kit 6 + AMONESTACION + FINIQUITO (B5)
        expect(res.body.data.epp_default).toContain('CASCO');
        expect(res.body.data.amonestacion_motivos.length).toBeGreaterThanOrEqual(8);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('POST /emitir/:trabajadorId', () => {
    test('400 código desconocido (validateBody) sin tocar la BD', async () => {
        const res = await request(app).post(`${BASE}/emitir/5`).set('Authorization', `Bearer ${tokenEmitir}`).send({ codigo: 'INVENTADO' });
        expect(res.status).toBe(400);
        expect(db.query).not.toHaveBeenCalled();
    });

    test('201 AMONESTACION: escribe .doc con BOM en uploads/5, INSERT origen=generado + metadata, log documento_emitido', async () => {
        db.query
            .mockResolvedValueOnce([[TRAB]])            // trabajador + empresa
            .mockResolvedValueOnce([TIPO('AMONESTACION')])
            .mockResolvedValueOnce([RUTS])
            .mockResolvedValueOnce([{ insertId: 501, affectedRows: 1 }]);
        const res = await request(app).post(`${BASE}/emitir/5`).set('Authorization', `Bearer ${tokenEmitir}`)
            .send({ codigo: 'AMONESTACION', fecha_carta: '2026-09-11', fecha_infraccion: '2026-09-10', motivo: 'Inasistencia injustificada', detalle: 'Faltó el lunes', extra: 'x' });
        expect(res.status).toBe(201);
        expect(res.body.data).toMatchObject({ documento_id: 501, tipo_codigo: 'AMONESTACION', estado: 'generado' });
        expect(res.body.data.nombre_archivo).toMatch(/^Amonestacion_Perez_Juan_Andres_\d{8}-\d{6}\.doc$/);

        expect(fs.mkdirSync).toHaveBeenCalledWith(expect.stringMatching(/uploads[\\/]5$/), { recursive: true });
        const [ruta, buf] = fs.writeFileSync.mock.calls[0];
        expect(ruta).toMatch(/uploads[\\/]5[\\/]Amonestacion_/);
        expect([...buf.slice(0, 3)]).toEqual([0xEF, 0xBB, 0xBF]);
        const html = buf.toString('utf8');
        expect(html).toContain('urn:schemas-microsoft-com:office:word');
        expect(html).toContain('CARTA DE AMONESTACIÓN');
        expect(html).toContain('Faltó el lunes');

        const [insSql, insVals] = db.query.mock.calls[3];
        expect(insSql).toMatch(/INSERT INTO documentos/);
        expect(insSql).toMatch(/'generado', 'generado'/);
        expect(insVals[0]).toBe(5);                   // trabajador_id
        expect(insVals[1]).toBe(9);                   // tipo por codigo
        expect(JSON.parse(insVals[insVals.length - 1])).toMatchObject({ carta: { motivo: 'Inasistencia injustificada' } });
        expect(db.query.mock.calls[1][0]).toMatch(/WHERE codigo = \? AND activo = 1/);
        expect(db.query.mock.calls[1][1]).toEqual(['AMONESTACION']);

        expect(logManualActivity).toHaveBeenCalledTimes(1);
        const [uid, modulo, accion, itemId, detalle] = logManualActivity.mock.calls[0];
        expect([uid, modulo, accion, itemId]).toEqual([3, 'documentos', 'CREATE', '501']);
        expect(JSON.parse(detalle)).toMatchObject({ evento: 'documento_emitido', tipo: 'AMONESTACION', trabajador_id: 5 });
    });

    test('409 CONTRATO sin representante legal → DATOS_FALTANTES, sin escribir ni insertar', async () => {
        db.query.mockResolvedValueOnce([[{ ...TRAB, representante_nombre: null }]]).mockResolvedValueOnce([SUELDO]);
        const res = await request(app).post(`${BASE}/emitir/5`).set('Authorization', `Bearer ${tokenEmitir}`).send({ codigo: 'CONTRATO' });
        expect(res.status).toBe(409);
        expect(res.body.code).toBe('DATOS_FALTANTES');
        expect(res.body.faltan).toEqual([expect.stringMatching(/representante legal/)]);
        expect(fs.writeFileSync).not.toHaveBeenCalled();
        expect(sqlCalls().some(s => /INSERT/i.test(s))).toBe(false);
    });

    test('409 CONTRATO sin sueldo del cargo (cargo_sueldos vacío)', async () => {
        db.query.mockResolvedValueOnce([[TRAB]]).mockResolvedValueOnce([[]]);
        const res = await request(app).post(`${BASE}/emitir/5`).set('Authorization', `Bearer ${tokenEmitir}`).send({ codigo: 'CONTRATO' });
        expect(res.status).toBe(409);
        expect(res.body.error).toMatch(/sueldo base del cargo Jornal/);
        expect(fs.writeFileSync).not.toHaveBeenCalled();
    });

    test('201 CONTRATO: metadata congela remuneración; el log NO lleva el monto', async () => {
        db.query
            .mockResolvedValueOnce([[TRAB]]).mockResolvedValueOnce([SUELDO])
            .mockResolvedValueOnce([TIPO('CONTRATO')]).mockResolvedValueOnce([RUTS]).mockResolvedValueOnce([{ insertId: 502 }]);
        const res = await request(app).post(`${BASE}/emitir/5`).set('Authorization', `Bearer ${tokenEmitir}`).send({ codigo: 'CONTRATO', dias_plazo: 30 });
        expect(res.status).toBe(201);
        const html = fs.writeFileSync.mock.calls[0][1].toString('utf8');
        expect(html).toContain('$553.553');
        expect(html).toContain('<b>30 días</b>');
        const meta = JSON.parse(db.query.mock.calls[4][1].slice(-1)[0]);
        expect(meta.remuneracion).toEqual({ sueldo_base: 553553, fuente: 'cargo_sueldos' });
        expect(meta.contrato.dias_plazo).toBe(30);
        expect(logManualActivity.mock.calls[0][4]).not.toMatch(/553/);
    });

    test('409 trabajador desvinculado; 404 inexistente', async () => {
        db.query.mockResolvedValueOnce([[{ ...TRAB, activo: 0 }]]);
        let res = await request(app).post(`${BASE}/emitir/5`).set('Authorization', `Bearer ${tokenEmitir}`).send({ codigo: 'DAS' });
        expect(res.status).toBe(409);
        db.query.mockReset().mockResolvedValue([[]]);
        res = await request(app).post(`${BASE}/emitir/5`).set('Authorization', `Bearer ${tokenEmitir}`).send({ codigo: 'DAS' });
        expect(res.status).toBe(404);
    });

    test('degradación 1054 (mig 110 pendiente en empresas): reintenta sin representante; DAS se emite igual', async () => {
        db.query
            .mockRejectedValueOnce(err1054())
            .mockResolvedValueOnce([[{ ...TRAB, representante_nombre: undefined, representante_rut: undefined }]])
            .mockResolvedValueOnce([TIPO('DAS')]).mockResolvedValueOnce([RUTS]).mockResolvedValueOnce([{ insertId: 503 }]);
        const res = await request(app).post(`${BASE}/emitir/5`).set('Authorization', `Bearer ${tokenEmitir}`).send({ codigo: 'DAS' });
        expect(res.status).toBe(201);
        expect(db.query.mock.calls[0][0]).toMatch(/representante_nombre/);
        expect(db.query.mock.calls[1][0]).not.toMatch(/representante_nombre/);
    });

    test('409 MIGRACION_PENDIENTE si tipos_documento.codigo no existe; el archivo escrito se borra si el INSERT falla', async () => {
        db.query.mockResolvedValueOnce([[TRAB]]).mockRejectedValueOnce(err1054());
        let res = await request(app).post(`${BASE}/emitir/5`).set('Authorization', `Bearer ${tokenEmitir}`).send({ codigo: 'DAS' });
        expect(res.status).toBe(409);
        expect(res.body.code).toBe('MIGRACION_PENDIENTE');

        db.query.mockReset().mockResolvedValue([[]]);
        db.query.mockResolvedValueOnce([[TRAB]]).mockResolvedValueOnce([TIPO('DAS')]).mockResolvedValueOnce([RUTS]).mockRejectedValueOnce(new Error('boom'));
        res = await request(app).post(`${BASE}/emitir/5`).set('Authorization', `Bearer ${tokenEmitir}`).send({ codigo: 'DAS' });
        expect(res.status).toBe(500);
        expect(fs.unlink).toHaveBeenCalledWith(expect.stringMatching(/DAS_Perez/), expect.any(Function));
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('POST /kit-ingreso/:trabajadorId', () => {
    test('400 sin documentos del kit', async () => {
        const res = await request(app).post(`${BASE}/kit-ingreso/5`).set('Authorization', `Bearer ${tokenEmitir}`).send({ documentos: ['AMONESTACION'] });
        expect(res.status).toBe(400);
    });

    test('valida TODOS antes de escribir: contrato sin sueldo → 409 y DAS tampoco se escribe', async () => {
        db.query.mockResolvedValueOnce([[TRAB]]).mockResolvedValueOnce([[]]);
        const res = await request(app).post(`${BASE}/kit-ingreso/5`).set('Authorization', `Bearer ${tokenEmitir}`).send({ documentos: ['DAS', 'CONTRATO'] });
        expect(res.status).toBe(409);
        expect(fs.writeFileSync).not.toHaveBeenCalled();
    });

    // B2b: los datos personales del trabajador son obligatorios para el contrato.
    const SIN_PERSONALES = { ...TRAB, nacionalidad: null, estado_civil: null, fecha_nacimiento: null, direccion: null, comuna: null };

    test('409 DATOS_FALTANTES si el contrato va marcado y la ficha no tiene los datos personales; no escribe nada', async () => {
        db.query.mockResolvedValueOnce([[SIN_PERSONALES]]).mockResolvedValueOnce([SUELDO]);
        const res = await request(app).post(`${BASE}/kit-ingreso/5`).set('Authorization', `Bearer ${tokenEmitir}`)
            .send({ documentos: ['CONTRATO', 'DAS'] });
        expect(res.status).toBe(409);
        expect(res.body.code).toBe('DATOS_FALTANTES');
        expect(res.body.faltan).toEqual([expect.stringMatching(/nacionalidad, estado civil, fecha de nacimiento, dirección, comuna del trabajador/)]);
        // El modal necesita las CLAVES de columna para abrir los inputs correctos.
        expect(res.body.campos_trabajador).toEqual(['nacionalidad', 'estado_civil', 'fecha_nacimiento', 'direccion', 'comuna']);
        expect(fs.writeFileSync).not.toHaveBeenCalled();
        expect(sqlCalls().some(s => /INSERT/i.test(s))).toBe(false);
    });

    test('solo la comuna vacía → 409 con ese único campo (la cláusula imprimiría media dirección)', async () => {
        db.query.mockResolvedValueOnce([[{ ...TRAB, comuna: null }]]).mockResolvedValueOnce([SUELDO]);
        const res = await request(app).post(`${BASE}/emitir/5`).set('Authorization', `Bearer ${tokenEmitir}`).send({ codigo: 'CONTRATO' });
        expect(res.status).toBe(409);
        expect(res.body.campos_trabajador).toEqual(['comuna']);
        expect(res.body.faltan).toEqual([expect.stringMatching(/^comuna del trabajador/)]);
    });

    test('un 409 por representante o sueldo NO trae campos_trabajador', async () => {
        db.query.mockResolvedValueOnce([[{ ...TRAB, representante_nombre: null }]]).mockResolvedValueOnce([SUELDO]);
        const res = await request(app).post(`${BASE}/emitir/5`).set('Authorization', `Bearer ${tokenEmitir}`).send({ codigo: 'CONTRATO' });
        expect(res.status).toBe(409);
        expect(res.body.campos_trabajador).toBeUndefined();
    });

    test('el MISMO trabajador incompleto emite el resto del kit si el contrato va desmarcado', async () => {
        db.query
            .mockResolvedValueOnce([[SIN_PERSONALES]])
            .mockResolvedValueOnce([TIPO('DAS')]).mockResolvedValueOnce([RUTS]).mockResolvedValueOnce([{ insertId: 610 }])
            .mockResolvedValueOnce([TIPO('RI_RECEPCION')]).mockResolvedValueOnce([RUTS]).mockResolvedValueOnce([{ insertId: 611 }]);
        const res = await request(app).post(`${BASE}/kit-ingreso/5`).set('Authorization', `Bearer ${tokenEmitir}`)
            .send({ documentos: ['DAS', 'RI_RECEPCION'] });
        expect(res.status).toBe(201);
        expect(res.body.data.emitidos.map(e => e.tipo_codigo)).toEqual(['DAS', 'RI_RECEPCION']);
        expect(fs.writeFileSync).toHaveBeenCalledTimes(2);
    });

    test('POST /emitir con CONTRATO suelto también exige los datos personales', async () => {
        db.query.mockResolvedValueOnce([[SIN_PERSONALES]]).mockResolvedValueOnce([SUELDO]);
        const res = await request(app).post(`${BASE}/emitir/5`).set('Authorization', `Bearer ${tokenEmitir}`).send({ codigo: 'CONTRATO' });
        expect(res.status).toBe(409);
        expect(res.body.campos_trabajador).toHaveLength(5);
        expect(fs.writeFileSync).not.toHaveBeenCalled();
    });

    test('201: emite en el orden del kit (CONTRATO antes que DAS aunque el body venga al revés), un INSERT por documento', async () => {
        db.query
            .mockResolvedValueOnce([[TRAB]]).mockResolvedValueOnce([SUELDO])
            .mockResolvedValueOnce([TIPO('CONTRATO')]).mockResolvedValueOnce([RUTS]).mockResolvedValueOnce([{ insertId: 601 }])
            .mockResolvedValueOnce([TIPO('DAS')]).mockResolvedValueOnce([RUTS]).mockResolvedValueOnce([{ insertId: 602 }]);
        const res = await request(app).post(`${BASE}/kit-ingreso/5`).set('Authorization', `Bearer ${tokenEmitir}`)
            .send({ documentos: ['DAS', 'CONTRATO'], dias_plazo: 20, epp_items: ['casco'] });
        expect(res.status).toBe(201);
        expect(res.body.data.emitidos.map(e => e.tipo_codigo)).toEqual(['CONTRATO', 'DAS']);
        expect(res.body.data.emitidos.map(e => e.documento_id)).toEqual([601, 602]);
        expect(fs.writeFileSync).toHaveBeenCalledTimes(2);
        expect(logManualActivity).toHaveBeenCalledTimes(2);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('descarga / impresión y restricción por tipo', () => {
    const FILA = { ruta_archivo: '5/Contrato_Perez_20260911-100000.doc', nombre_archivo: 'Contrato_Perez_20260911-100000.doc', trabajador_id: 5, origen: 'generado', estado: 'generado', tipo_codigo: 'CONTRATO', tipo_nombre: 'Contrato de Trabajo (Bóveda)', restringido: 1 };

    test('GET /documentos/download/:id restringido sin laborales.descargar → 403 con required', async () => {
        db.query.mockResolvedValueOnce([[FILA]]);
        const res = await request(app).get('/api/documentos/download/501').set('Authorization', `Bearer ${tokenDocsLegacy}`);
        expect(res.status).toBe(403);
        expect(res.body).toEqual({ error: expect.stringMatching(/solo desde oficina/), required: ['documentos.laborales.descargar'] });
    });

    test('GET /documentos/download/:id NO restringido → descarga (legacy intacto)', async () => {
        db.query.mockResolvedValueOnce([[{ ...FILA, restringido: 0, nombre_archivo: 'cert.pdf' }]]);
        const res = await request(app).get('/api/documentos/download/7').set('Authorization', `Bearer ${tokenDocsLegacy}`);
        expect(res.status).toBe(200);
        expect(res.text).toBe('FILE:cert.pdf');
    });

    test('GET /documentos-laborales/:id/download → marca descargado (solo desde generado) + log documento_descargado', async () => {
        db.query.mockResolvedValueOnce([[FILA]]).mockResolvedValueOnce([{ affectedRows: 1 }]);
        const res = await request(app).get(`${BASE}/501/download`).set('Authorization', `Bearer ${tokenDescargar}`);
        expect(res.status).toBe(200);
        expect(res.text).toBe(`FILE:${FILA.nombre_archivo}`);
        const [updSql, updVals] = db.query.mock.calls[1];
        expect(updSql).toMatch(/SET estado = 'descargado', fecha_descarga = COALESCE\(fecha_descarga, NOW\(\)\)/);
        expect(updSql).toMatch(/WHERE id = \? AND estado = 'generado'/);
        expect(updVals).toEqual(['501']);
        expect(JSON.parse(logManualActivity.mock.calls[0][4])).toMatchObject({ evento: 'documento_descargado', tipo: 'CONTRATO', trabajador_id: 5 });
    });

    test('GET /:id/html → HTML sin BOM + log documento_impreso; un PDF subido → 409', async () => {
        db.query.mockResolvedValueOnce([[FILA]]).mockResolvedValueOnce([{ affectedRows: 0 }]);
        let res = await request(app).get(`${BASE}/501/html`).set('Authorization', `Bearer ${tokenDescargar}`);
        expect(res.status).toBe(200);
        expect(res.body.data.html.startsWith('<!DOCTYPE html>')).toBe(true);
        expect(res.body.data.html.charCodeAt(0)).not.toBe(0xFEFF);
        expect(JSON.parse(logManualActivity.mock.calls[0][4]).evento).toBe('documento_impreso');

        // Un Word BINARIO subido a la ficha también queda con extensión .doc: 409 sin marcar ni loguear
        // (si no, se enviaría su contenido crudo como si fuera el HTML del motor).
        db.query.mockReset().mockResolvedValue([[]]);
        logManualActivity.mockClear();
        db.query.mockResolvedValueOnce([[{ ...FILA, nombre_archivo: 'contrato-firmado.doc', origen: 'subido' }]]);
        res = await request(app).get(`${BASE}/501/html`).set('Authorization', `Bearer ${tokenDescargar}`);
        expect(res.status).toBe(409);
        expect(res.body.code).toBe('NO_IMPRIMIBLE');
        expect(sqlCalls().some(x => /UPDATE documentos/i.test(x))).toBe(false);
        expect(logManualActivity).not.toHaveBeenCalled();

        // Generado pero con contenido que no es el del motor (archivo reemplazado a mano en el servidor).
        db.query.mockReset().mockResolvedValue([[]]);
        fs.readFileSync.mockImplementation((p, enc) => (String(p).includes('uploads') ? 'binario' : jest.requireActual('fs').readFileSync(p, enc)));
        db.query.mockResolvedValueOnce([[FILA]]);
        res = await request(app).get(`${BASE}/501/html`).set('Authorization', `Bearer ${tokenDescargar}`);
        expect(res.status).toBe(409);
        expect(res.body.code).toBe('NO_IMPRIMIBLE');
    });

    test('404 si el archivo no está en disco; 404 documento inexistente', async () => {
        fs.existsSync.mockImplementation(() => false);
        db.query.mockResolvedValueOnce([[FILA]]);
        let res = await request(app).get(`${BASE}/501/download`).set('Authorization', `Bearer ${tokenDescargar}`);
        expect(res.status).toBe(404);
        res = await request(app).get(`${BASE}/999/download`).set('Authorization', `Bearer ${tokenDescargar}`);
        expect(res.status).toBe(404);
    });

    test('getFilePath degrada (1054) a la consulta legacy con restringido=false; marcarDescargado devuelve false', async () => {
        db.query.mockRejectedValueOnce(err1054()).mockResolvedValueOnce([[{ ruta_archivo: '5/a.pdf', nombre_archivo: 'a.pdf', trabajador_id: 5, tipo_nombre: 'Cédula' }]]);
        const info = await documentoService.getFilePath(7);
        expect(info).toMatchObject({ fileName: 'a.pdf', restringido: false, origen: 'subido', tipo_codigo: null });
        db.query.mockReset().mockRejectedValueOnce(err1054());
        expect(await documentoService.marcarDescargado(7)).toBe(false);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('listados sin metadata y ZIPs sin restringidos', () => {
    test('GET /documentos/trabajador/:id: proyección explícita (sin d.* ni metadata), con columnas de la 110', async () => {
        db.query.mockResolvedValueOnce([[{ id: 1, nombre_archivo: 'a.doc', origen: 'generado', estado: 'generado', restringido: 1, tipo_codigo: 'CONTRATO' }]]);
        const res = await request(app).get('/api/documentos/trabajador/5').set('Authorization', `Bearer ${tokenDocsLegacy}`);
        expect(res.status).toBe(200);
        const sql = db.query.mock.calls[0][0];
        expect(sql).not.toMatch(/d\.\*/);
        expect(sql).not.toMatch(/metadata/);
        expect(sql).toMatch(/d\.origen, d\.estado/);
        expect(sql).toMatch(/td\.restringido/);
        expect(res.body[0]).toMatchObject({ origen: 'generado', restringido: 1 });
    });

    test('getByTrabajador degrada (1054) al legacy y completa origen/estado/restringido; origen=generado sin mig → []', async () => {
        db.query.mockRejectedValueOnce(err1054()).mockResolvedValueOnce([[{ id: 1, nombre_archivo: 'a.pdf' }]]);
        const rows = await documentoService.getByTrabajador(5);
        expect(rows).toEqual([{ id: 1, nombre_archivo: 'a.pdf', origen: 'subido', estado: 'subido', restringido: 0, tipo_codigo: null }]);
        expect(db.query.mock.calls[1][0]).not.toMatch(/d\.origen/);
        db.query.mockReset().mockRejectedValueOnce(err1054());
        expect(await documentoService.getByTrabajador(5, { origen: 'generado' })).toEqual([]);
    });

    test('GET /documentos-laborales/trabajador/:id filtra origen=generado', async () => {
        db.query.mockResolvedValueOnce([[]]);
        const res = await request(app).get(`${BASE}/trabajador/5`).set('Authorization', `Bearer ${tokenDocsLegacy}`);
        expect(res.status).toBe(200);
        expect(db.query.mock.calls[0][0]).toMatch(/AND d\.origen = \?/);
        expect(db.query.mock.calls[0][1]).toEqual(['5', 'generado']);
    });

    test('GET /documentos/download-all/:tid omite restringidos y avisa por header; todos restringidos → 404', async () => {
        db.query
            .mockResolvedValueOnce([[
                { id: 1, ruta_archivo: '5/a.pdf', nombre_archivo: 'a.pdf', tipo_nombre: 'Cédula', restringido: 0 },
                { id: 2, ruta_archivo: '5/c.doc', nombre_archivo: 'c.doc', tipo_nombre: 'Contrato (Bóveda)', restringido: 1 },
            ]])
            .mockResolvedValueOnce([[{ rut: '1-9', nombres: 'Juan', apellido_paterno: 'Pérez' }]]);
        const res = await request(app).get('/api/documentos/download-all/5').set('Authorization', `Bearer ${tokenDocsLegacy}`);
        expect(res.status).toBe(200);
        expect(res.headers['x-documentos-omitidos']).toBe('1');
        expect(archiverStub.files).toEqual(['C_dula_1.pdf']);

        db.query.mockReset().mockResolvedValue([[]]);
        db.query.mockResolvedValueOnce([[{ id: 2, ruta_archivo: '5/c.doc', nombre_archivo: 'c.doc', tipo_nombre: 'Contrato', restringido: 1 }]]);
        const res2 = await request(app).get('/api/documentos/download-all/5').set('Authorization', `Bearer ${tokenDocsLegacy}`);
        expect(res2.status).toBe(404);
        expect(res2.body.error).toMatch(/restringidos/);
    });

    test('zip.service.createZip (correo de fiscalización) omite restringidos y cuenta stats.omitidos; degrada 1054', async () => {
        const out = new EventEmitter();
        spies.push(jest.spyOn(fs, 'createWriteStream').mockImplementation(() => out));
        db.query
            .mockResolvedValueOnce([[{ rut: '1-9', nombres: 'Juan', apellido_paterno: 'Pérez' }]])
            .mockResolvedValueOnce([[
                { id: 1, ruta_archivo: '5/a.pdf', nombre_archivo: 'a.pdf', tipo_nombre: 'Cédula', restringido: 0 },
                { id: 2, ruta_archivo: '5/c.doc', nombre_archivo: 'c.doc', tipo_nombre: 'Contrato', restringido: 1 },
            ]]);
        const stats = {};
        const zipPath = await zipService.createZip([5], stats);
        expect(zipPath).toMatch(/fiscalizacion_\d+\.zip$/);
        expect(stats.omitidos).toBe(1);
        expect(archiverStub.files).toEqual(['1-9_Juan_Pérez/C_dula_1.pdf']);
        expect(db.query.mock.calls[1][0]).toMatch(/COALESCE\(td\.restringido, 0\)/);

        archiverStub.files = [];
        db.query.mockReset().mockResolvedValue([[]]);
        db.query
            .mockResolvedValueOnce([[{ rut: '1-9', nombres: 'Juan', apellido_paterno: 'Pérez' }]])
            .mockRejectedValueOnce(err1054())
            .mockResolvedValueOnce([[{ id: 1, ruta_archivo: '5/a.pdf', nombre_archivo: 'a.pdf', tipo_nombre: 'Cédula', restringido: 0 }]]);
        const stats2 = {};
        await zipService.createZip([5], stats2);
        expect(stats2.omitidos).toBe(0);
        expect(archiverStub.files).toHaveLength(1);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('tipos del sistema (codigo) protegidos en Settings', () => {
    const tokenTipos = makeToken(['sistema.tipos_doc.gestionar']);

    test('PUT /documentos/tipos/:id {activo:false} sobre tipo con codigo → 409 sin UPDATE', async () => {
        db.query.mockResolvedValueOnce([[{ codigo: 'CONTRATO' }]]);
        const res = await request(app).put('/api/documentos/tipos/9').set('Authorization', `Bearer ${tokenTipos}`).send({ activo: false });
        expect(res.status).toBe(409);
        expect(res.body.code).toBe('TIPO_SISTEMA');
        expect(sqlCalls().some(s => /UPDATE tipos_documento/i.test(s))).toBe(false);
    });

    test('PUT renombrar un tipo del sistema sí pasa; tipo manual (codigo NULL) puede desactivarse', async () => {
        db.query.mockResolvedValueOnce([[{ codigo: 'CONTRATO' }]]).mockResolvedValueOnce([{ affectedRows: 1 }]).mockResolvedValueOnce([[{ id: 9, nombre: 'Contrato LOLS' }]]);
        let res = await request(app).put('/api/documentos/tipos/9').set('Authorization', `Bearer ${tokenTipos}`).send({ nombre: 'Contrato LOLS' });
        expect(res.status).not.toBe(409);
        expect(sqlCalls().some(s => /UPDATE tipos_documento/i.test(s))).toBe(true);

        db.query.mockReset().mockResolvedValue([[]]);
        db.query.mockResolvedValueOnce([[{ codigo: null }]]).mockResolvedValueOnce([{ affectedRows: 1 }]).mockResolvedValueOnce([[{ id: 3 }]]);
        res = await request(app).put('/api/documentos/tipos/3').set('Authorization', `Bearer ${tokenTipos}`).send({ activo: false });
        expect(res.status).not.toBe(409);
    });

    test('DELETE /documentos/tipos/:id de un tipo del sistema → 409', async () => {
        db.query.mockResolvedValueOnce([[{ codigo: 'DAS' }]]);
        const res = await request(app).delete('/api/documentos/tipos/9').set('Authorization', `Bearer ${tokenTipos}`);
        expect(res.status).toBe(409);
        expect(sqlCalls().some(s => /DELETE|UPDATE/i.test(s))).toBe(false);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('GET /solicitudes-ingreso/:id/doc', () => {
    const SOL = { id: 41, estado: 'pendiente', rut: '12.345.678-5', nombres: 'Ana', apellido_paterno: 'Soto', apellido_materno: null, fecha_solicitud: '2026-09-08 10:00:00', trabajador_id: null, solicitante_nombre: 'Terreno' };

    test('pendiente → .doc al vuelo (application/msword, BOM), sin INSERT, log solicitud_descargada', async () => {
        db.query.mockResolvedValueOnce([[SOL]]);
        const res = await request(app).get('/api/solicitudes-ingreso/41/doc').set('Authorization', `Bearer ${tokenDescargar}`).buffer(true).parse((r, cb) => { const chunks = []; r.on('data', c => chunks.push(c)); r.on('end', () => cb(null, Buffer.concat(chunks))); });
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toMatch(/application\/msword/);
        expect(res.headers['content-disposition']).toMatch(/attachment; filename="Solicitud_Ingreso_Soto_Ana_\d{8}-\d{6}\.doc"/);
        expect([...res.body.slice(0, 3)]).toEqual([0xEF, 0xBB, 0xBF]);
        expect(res.body.toString('utf8')).toContain('FICHA DE SOLICITUD DE INGRESO');
        expect(sqlCalls().some(s => /INSERT/i.test(s))).toBe(false);
        expect(JSON.parse(logManualActivity.mock.calls[0][4])).toMatchObject({ evento: 'solicitud_descargada', estado: 'pendiente' });
    });

    test('aprobada sin documento → lo emite en la ficha del trabajador y lo descarga', async () => {
        db.query
            .mockResolvedValueOnce([[{ ...SOL, estado: 'aprobada', trabajador_id: 900, resuelto_por_nombre: 'RRHH' }]])
            .mockResolvedValueOnce([[]])                          // buscarGenerado: no existe
            .mockResolvedValueOnce([TIPO('SOLICITUD_INGRESO')]).mockResolvedValueOnce([RUTS]).mockResolvedValueOnce([{ insertId: 700 }])
            .mockResolvedValueOnce([[{ ruta_archivo: '900/Solicitud_Ingreso_Soto_Ana_x.doc', nombre_archivo: 'Solicitud_Ingreso_Soto_Ana_x.doc', trabajador_id: 900, origen: 'generado', estado: 'generado', tipo_codigo: 'SOLICITUD_INGRESO', tipo_nombre: 'Solicitud (Bóveda)', restringido: 1 }]])
            .mockResolvedValueOnce([{ affectedRows: 1 }]);       // marcarDescargado
        const res = await request(app).get('/api/solicitudes-ingreso/41/doc').set('Authorization', `Bearer ${tokenDescargar}`);
        expect(res.status).toBe(200);
        expect(res.text).toBe('FILE:Solicitud_Ingreso_Soto_Ana_x.doc');
        expect(db.query.mock.calls[4][1][0]).toBe(900);           // INSERT en el trabajador creado
        expect(logManualActivity).toHaveBeenCalledTimes(2);       // emitido + descargado
    });

    test('aprobada con documento existente → lo reutiliza (sin INSERT)', async () => {
        db.query
            .mockResolvedValueOnce([[{ ...SOL, estado: 'aprobada', trabajador_id: 900 }]])
            .mockResolvedValueOnce([[{ id: 700, nombre_archivo: 'S.doc' }]])
            .mockResolvedValueOnce([[{ ruta_archivo: '900/S.doc', nombre_archivo: 'S.doc', trabajador_id: 900, origen: 'generado', estado: 'descargado', tipo_codigo: 'SOLICITUD_INGRESO', restringido: 1 }]])
            .mockResolvedValueOnce([{ affectedRows: 0 }]);
        const res = await request(app).get('/api/solicitudes-ingreso/41/doc').set('Authorization', `Bearer ${tokenDescargar}`);
        expect(res.status).toBe(200);
        expect(sqlCalls().some(s => /INSERT/i.test(s))).toBe(false);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('empresas: representante legal (mig 110) con degradación', () => {
    const tokenEmpresas = makeToken(['empresas.crear', 'empresas.editar']);

    beforeEach(() => resetSchemaCache());

    afterAll(() => resetSchemaCache());

    test('un alta sin representante NO paga la introspección de esquema', async () => {
        db.query.mockResolvedValueOnce([{ insertId: 10 }]).mockResolvedValueOnce([[{ id: 10 }]]);
        const res = await request(app).post('/api/empresas').set('Authorization', `Bearer ${tokenEmpresas}`)
            .send({ rut: '76.123.456-7', razon_social: 'Nueva Empresa' });
        expect(res.status).toBe(201);
        expect(sqlCalls().some(x => /INFORMATION_SCHEMA/i.test(x))).toBe(false);
    });

    test('con la mig 110 aplicada, el UPDATE guarda representante_nombre y representante_rut', async () => {
        db.query
            .mockResolvedValueOnce([[{ COLUMN_NAME: 'representante_nombre' }, { COLUMN_NAME: 'representante_rut' }]])  // INFORMATION_SCHEMA
            .mockResolvedValueOnce([{ affectedRows: 1 }])
            .mockResolvedValueOnce([[{ id: 1 }]]);
        const res = await request(app).put('/api/empresas/1').set('Authorization', `Bearer ${tokenEmpresas}`)
            .send({ razon_social: 'LOLS', representante_nombre: 'Luis Lazcano Silva', representante_rut: '7.907.220-6' });
        expect(res.status).not.toBe(500);
        const upd = sqlCalls().find(x => /UPDATE empresas/i.test(x));
        expect(upd).toMatch(/representante_nombre = ?/);
        expect(upd).toMatch(/representante_rut = ?/);
    });

    test('mig 110 PENDIENTE: los campos se descartan y el UPDATE vuelve al comportamiento anterior (sin 500)', async () => {
        db.query
            .mockResolvedValueOnce([[{ COLUMN_NAME: 'rut' }, { COLUMN_NAME: 'razon_social' }]])  // sin representante_*
            .mockResolvedValueOnce([{ affectedRows: 1 }])
            .mockResolvedValueOnce([[{ id: 1 }]]);
        const res = await request(app).put('/api/empresas/1').set('Authorization', `Bearer ${tokenEmpresas}`)
            .send({ razon_social: 'LOLS', representante_nombre: 'Luis Lazcano Silva', representante_rut: '7.907.220-6' });
        expect(res.status).not.toBe(500);
        const upd = sqlCalls().find(x => /UPDATE empresas/i.test(x));
        expect(upd).toMatch(/razon_social = ?/);
        expect(upd).not.toMatch(/representante_/);
    });

    test("mig 110 PENDIENTE y SOLO representante en el body: 400 sin campos validos, nunca 500", async () => {
        db.query.mockResolvedValueOnce([[{ COLUMN_NAME: 'rut' }]]);
        const res = await request(app).put('/api/empresas/1').set('Authorization', `Bearer ${tokenEmpresas}`)
            .send({ representante_nombre: 'Luis Lazcano Silva' });
        expect(res.status).toBe(400);
        expect(sqlCalls().some(x => /UPDATE empresas/i.test(x))).toBe(false);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('FINIQUITO (plan Gestiones B5)', () => {
    const TRAB_BAJA = { ...TRAB, activo: 0 };
    // Fila ABIERTA de trabajador_desvinculaciones (SELECT_HIST). `detalle` es antecedente interno: jamás se imprime.
    const DESV = {
        id: 77, trabajador_id: 5, rut_normalized: '123456785', nombre_snapshot: 'Pérez Soto Juan Andrés',
        fecha_desvinculacion: '2026-09-10', fecha_ingreso_periodo: '2026-08-31', causal_codigo: 'VENCIMIENTO_PLAZO', detalle: 'ANTECEDENTE-SECRETO',
        no_recontratar: 0, desvinculado_por: 3, desvinculado_por_nombre: 'RRHH', desvinculado_en: '2026-09-10 10:00:00',
        finiquito_documento_id: null, reactivado_por: null, reactivado_por_nombre: null, reactivado_en: null,
    };
    const HABERES = [{ concepto: 'Días trabajados septiembre 2026', monto: 450000 }];
    const post = (body) => request(app).post(`${BASE}/emitir/5`).set('Authorization', `Bearer ${tokenEmitir}`).send({ codigo: 'FINIQUITO', ...body });
    const err1146 = () => Object.assign(new Error("Table 'trabajador_desvinculaciones' doesn't exist"), { errno: 1146, code: 'ER_NO_SUCH_TABLE' });

    test('409 TRABAJADOR_ACTIVO: el finiquito exige trabajador desvinculado (guard invertido respecto del kit)', async () => {
        db.query.mockResolvedValueOnce([[TRAB]]);
        const res = await post({ haberes: HABERES });
        expect(res.status).toBe(409);
        expect(res.body.code).toBe('TRABAJADOR_ACTIVO');
        expect(db.query).toHaveBeenCalledTimes(1);
        expect(fs.writeFileSync).not.toHaveBeenCalled();
    });

    test('409 DATOS_FALTANTES sin fila abierta; 409 MIGRACION_PENDIENTE (no "desvincula primero") si la mig 112 no corrió', async () => {
        db.query.mockResolvedValueOnce([[TRAB_BAJA]]).mockResolvedValueOnce([[]]);
        let res = await post({ haberes: HABERES });
        expect(res.status).toBe(409);
        expect(res.body.code).toBe('DATOS_FALTANTES');
        expect(res.body.faltan).toEqual([expect.stringMatching(/baja vigente registrada/)]);
        expect(res.body.faltan[0]).not.toMatch(/Desvincular/);
        expect(db.query.mock.calls[1][0]).toMatch(/reactivado_en IS NULL/);

        for (const err of [err1146(), err1054()]) {
            db.query.mockReset().mockResolvedValue([[]]);
            db.query.mockResolvedValueOnce([[TRAB_BAJA]]).mockRejectedValueOnce(err);
            res = await post({ haberes: HABERES });
            expect(res.status).toBe(409);
            expect(res.body.code).toBe('MIGRACION_PENDIENTE');
            expect(res.body.error).toMatch(/migración 112/);
        }
        expect(fs.writeFileSync).not.toHaveBeenCalled();
    });

    test('409 sin fecha_finiquito y baja FUTURA: el default (hoy) que imprime build() también se valida', async () => {
        const futura = new Date(); futura.setDate(futura.getDate() + 10);
        const ymd = `${futura.getFullYear()}-${String(futura.getMonth() + 1).padStart(2, '0')}-${String(futura.getDate()).padStart(2, '0')}`;
        db.query.mockResolvedValueOnce([[TRAB_BAJA]]).mockResolvedValueOnce([[{ ...DESV, fecha_desvinculacion: ymd }]]);
        const res = await post({ haberes: HABERES });
        expect(res.status).toBe(409);
        expect(res.body.faltan).toEqual([expect.stringMatching(/igual o posterior a la desvinculación/)]);
        expect(fs.writeFileSync).not.toHaveBeenCalled();
    });

    test('409 si la baja ya tiene causal legal y se intenta imprimir otra (causal_codigo distinta)', async () => {
        db.query.mockResolvedValueOnce([[TRAB_BAJA]]).mockResolvedValueOnce([[DESV]]);   // VENCIMIENTO_PLAZO, art. 159
        const res = await post({ haberes: HABERES, causal_codigo: 'NECESIDADES_EMPRESA' });
        expect(res.status).toBe(409);
        expect(res.body.faltan).toEqual([expect.stringMatching(/causal coherente con la baja/)]);
        expect(fs.writeFileSync).not.toHaveBeenCalled();
    });

    test('409 finiquito de $0 (monto 0 en el único haber) y 409 con montos que no son números (true, "")', async () => {
        db.query.mockResolvedValueOnce([[TRAB_BAJA]]).mockResolvedValueOnce([[DESV]]);
        let res = await post({ haberes: [{ concepto: 'Días trabajados', monto: 0 }] });
        expect(res.status).toBe(409);
        expect(res.body.faltan).toEqual([expect.stringMatching(/monto mayor a cero/)]);

        db.query.mockReset().mockResolvedValue([[]]);
        db.query.mockResolvedValueOnce([[TRAB_BAJA]]).mockResolvedValueOnce([[DESV]]);
        res = await post({ haberes: [{ concepto: 'Bono', monto: true }, { concepto: 'Días', monto: '' }] });
        expect(res.status).toBe(409);
        expect(res.body.faltan).toEqual([expect.stringMatching(/al menos una línea de haberes/)]);
        expect(fs.writeFileSync).not.toHaveBeenCalled();
    });

    test('409 fecha con forma válida pero calendario inválido (2026-13-45): no se imprime "45 de undefined"', async () => {
        db.query.mockResolvedValueOnce([[TRAB_BAJA]]).mockResolvedValueOnce([[DESV]]);
        const res = await post({ haberes: HABERES, fecha_finiquito: '2026-13-45' });
        expect(res.status).toBe(409);
        expect(res.body.faltan).toEqual([expect.stringMatching(/fecha del finiquito válida/)]);
    });

    test('409 causal operativa LOLS (sin artículo) exige elegir la causal legal a imprimir', async () => {
        db.query.mockResolvedValueOnce([[TRAB_BAJA]]).mockResolvedValueOnce([[{ ...DESV, causal_codigo: 'OTRO' }]]);
        const res = await post({ haberes: HABERES });
        expect(res.status).toBe(409);
        expect(res.body.faltan).toEqual([expect.stringMatching(/causal legal a imprimir.*Otro motivo/)]);
        expect(fs.writeFileSync).not.toHaveBeenCalled();
    });

    test('409 descuentos mayores que los haberes (total negativo), sin escribir', async () => {
        db.query.mockResolvedValueOnce([[TRAB_BAJA]]).mockResolvedValueOnce([[DESV]]);
        const res = await post({ haberes: HABERES, descuentos: [{ concepto: 'Anticipo', monto: 999999 }] });
        expect(res.status).toBe(409);
        expect(res.body.faltan).toEqual([expect.stringMatching(/descuentos que no superen/)]);
        expect(fs.writeFileSync).not.toHaveBeenCalled();
    });

    test.each([
        ['monto negativo', { haberes: [{ concepto: 'x', monto: -1 }] }],
        ['línea sin concepto', { haberes: [{ monto: 100 }] }],
        ['monto no entero', { haberes: [{ concepto: 'x', monto: 10.5 }] }],
        ['fecha inválida', { haberes: HABERES, fecha_finiquito: '14-09-2026' }],
        ['causal_codigo largo', { haberes: HABERES, causal_codigo: 'X'.repeat(31) }],
    ])('400 validateBody (%s) sin tocar la BD', async (_n, body) => {
        const res = await post(body);
        expect(res.status).toBe(400);
        expect(db.query).not.toHaveBeenCalled();
    });

    test('201: .doc con el finiquito completo, metadata con montos, enlace finiquito_documento_id, log SIN montos ni detalle', async () => {
        db.query
            .mockResolvedValueOnce([[TRAB_BAJA]])                 // trabajador + empresa
            .mockResolvedValueOnce([[DESV]])                      // baja vigente
            .mockResolvedValueOnce([TIPO('FINIQUITO')])           // tipo del sistema
            .mockResolvedValueOnce([RUTS])                        // rut empresa (crearGenerado)
            .mockResolvedValueOnce([{ insertId: 601, affectedRows: 1 }])
            .mockResolvedValueOnce([{ affectedRows: 1 }]);        // UPDATE trabajador_desvinculaciones
        const res = await post({ fecha_finiquito: '2026-09-14', haberes: HABERES, descuentos: [{ concepto: 'Anticipo quincena', monto: 50000 }] });
        expect(res.status).toBe(201);
        expect(res.body.data).toMatchObject({ documento_id: 601, tipo_codigo: 'FINIQUITO', estado: 'generado', desvinculacion_id: 77, enlazado: true });
        expect(res.body.data.nombre_archivo).toMatch(/^Finiquito_Perez_Juan_Andres_\d{8}-\d{6}\.doc$/);

        const html = fs.writeFileSync.mock.calls[0][1].toString('utf8');
        expect(html).toContain('FINIQUITO DE TRABAJADOR');
        expect(html).toContain('En Santiago, a 14 de septiembre de 2026');
        expect(html).toContain('desde el 31 de agosto de 2026 y hasta el 10 de septiembre de 2026');
        expect(html).toContain('Vencimiento del plazo convenido en el contrato');
        expect(html).toContain('Artículo 159, N° 4 del Código del Trabajo');
        expect(html).toContain('<b>$400.000</b>');
        expect(html).toContain('<b>Son:</b> Cuatrocientos mil pesos.');
        expect(html).not.toContain('pesos pesos');
        expect(html).toContain('&minus; $50.000');
        expect(html).toContain('dos ejemplares');
        expect(html).toContain('Ley N° 21.389');
        expect(html).toContain('Luis Lazcano Silva');
        expect(html).not.toContain('ANTECEDENTE-SECRETO');

        const [insSql, insVals] = db.query.mock.calls[4];
        expect(insSql).toMatch(/INSERT INTO documentos/);
        const meta = JSON.parse(insVals[insVals.length - 1]);
        expect(meta.finiquito).toMatchObject({ fecha: '2026-09-14', lugar_firma: 'Santiago', total: 400000 });
        expect(meta.desvinculacion).toMatchObject({ id: 77, causal_registrada: { codigo: 'VENCIMIENTO_PLAZO' }, causal_impresa: { codigo: 'VENCIMIENTO_PLAZO' } });
        expect(JSON.stringify(meta)).not.toContain('ANTECEDENTE-SECRETO');

        const [updSql, updVals] = db.query.mock.calls[5];
        expect(updSql).toMatch(/UPDATE trabajador_desvinculaciones SET finiquito_documento_id = \? WHERE id = \? AND reactivado_en IS NULL/);
        expect(updVals).toEqual([601, 77]);

        expect(logManualActivity).toHaveBeenCalledTimes(1);
        const detalle = logManualActivity.mock.calls[0][4];
        expect(JSON.parse(detalle)).toMatchObject({ evento: 'documento_emitido', tipo: 'FINIQUITO', trabajador_id: 5 });
        expect(detalle).not.toMatch(/450000|400000|50000|ANTECEDENTE/);
    });

    test('201 con causal_codigo elegida cuando la baja se registró como OTRO: imprime la legal, metadata guarda ambas', async () => {
        db.query
            .mockResolvedValueOnce([[TRAB_BAJA]]).mockResolvedValueOnce([[{ ...DESV, causal_codigo: 'OTRO' }]])
            .mockResolvedValueOnce([TIPO('FINIQUITO')]).mockResolvedValueOnce([RUTS])
            .mockResolvedValueOnce([{ insertId: 602 }]).mockResolvedValueOnce([{ affectedRows: 1 }]);
        const res = await post({ haberes: HABERES, causal_codigo: 'CONCLUSION_OBRA', lugar_firma: 'Cerrillos' });
        expect(res.status).toBe(201);
        const html = fs.writeFileSync.mock.calls[0][1].toString('utf8');
        expect(html).toContain('Conclusión del trabajo o servicio que dio origen al contrato');
        expect(html).toContain('Artículo 159, N° 5 del Código del Trabajo');
        expect(html).toContain('En Cerrillos, a ');
        const meta = JSON.parse(db.query.mock.calls[4][1].slice(-1)[0]);
        expect(meta.desvinculacion.causal_registrada.codigo).toBe('OTRO');
        expect(meta.desvinculacion.causal_impresa.codigo).toBe('CONCLUSION_OBRA');
    });

    test('201 aunque el enlace a la baja falle (fila desaparecida o 1146): el documento ya existe, se avisa y no se responde error', async () => {
        db.query
            .mockResolvedValueOnce([[TRAB_BAJA]]).mockResolvedValueOnce([[DESV]])
            .mockResolvedValueOnce([TIPO('FINIQUITO')]).mockResolvedValueOnce([RUTS])
            .mockResolvedValueOnce([{ insertId: 603 }]).mockResolvedValueOnce([{ affectedRows: 0 }]);
        let res = await post({ haberes: HABERES });
        expect(res.status).toBe(201);
        expect(res.body.data).toMatchObject({ documento_id: 603, enlazado: false });

        db.query.mockReset().mockResolvedValue([[]]);
        db.query
            .mockResolvedValueOnce([[TRAB_BAJA]]).mockResolvedValueOnce([[DESV]])
            .mockResolvedValueOnce([TIPO('FINIQUITO')]).mockResolvedValueOnce([RUTS])
            .mockResolvedValueOnce([{ insertId: 604 }]).mockRejectedValueOnce(err1146());
        res = await post({ haberes: HABERES });
        expect(res.status).toBe(201);
        expect(res.body.data).toMatchObject({ documento_id: 604, enlazado: false });

        // Error que NO es de esquema (deadlock, conexión): el try/catch de emitir() lo absorbe igual.
        db.query.mockReset().mockResolvedValue([[]]);
        db.query
            .mockResolvedValueOnce([[TRAB_BAJA]]).mockResolvedValueOnce([[DESV]])
            .mockResolvedValueOnce([TIPO('FINIQUITO')]).mockResolvedValueOnce([RUTS])
            .mockResolvedValueOnce([{ insertId: 605 }]).mockRejectedValueOnce(new Error('Deadlock found'));
        res = await post({ haberes: HABERES });
        expect(res.status).toBe(201);
        expect(res.body.data).toMatchObject({ documento_id: 605, enlazado: false });
        expect(db.query.mock.calls[5][0]).toMatch(/UPDATE trabajador_desvinculaciones/);
    });

    test('el kit y la amonestación siguen rechazando al desvinculado (409) y el catálogo publica FINIQUITO', async () => {
        db.query.mockResolvedValueOnce([[TRAB_BAJA]]);
        let res = await request(app).post(`${BASE}/emitir/5`).set('Authorization', `Bearer ${tokenEmitir}`).send({ codigo: 'AMONESTACION', fecha_carta: '2026-09-14' });
        expect(res.status).toBe(409);
        db.query.mockReset().mockResolvedValue([[]]);
        db.query.mockResolvedValueOnce([[TRAB_BAJA]]);
        res = await request(app).post(`${BASE}/kit-ingreso/5`).set('Authorization', `Bearer ${tokenEmitir}`).send({ documentos: ['DAS'] });
        expect(res.status).toBe(409);
        res = await request(app).get(`${BASE}/catalogo`).set('Authorization', `Bearer ${tokenTerreno}`);
        expect(res.body.data.emitibles.map(e => e.codigo)).toContain('FINIQUITO');
        expect(res.body.data.kit.map(k => k.codigo)).not.toContain('FINIQUITO');
    });
});
