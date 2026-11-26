/**
 * Cartas de aviso de término (mig 160; Marcos 2026-11-26: «necesidades de la empresa, vencimiento de plazo y no
 * concurrencia… esas tres cartas… y que solo Matías pueda imprimir»; sin «Recibí copia» ni «c.c.» al pie).
 *
 *  - Solo con `documentos.cartas_aviso`: emitir, descargar, imprimir y los días de falta. El permiso de documentos
 *    laborales NO alcanza (ni por /documentos-laborales ni por /documentos/download).
 *  - Sale de la baja vigente (como el finiquito): 409 con el trabajador activo; solo las tres causales.
 *  - No concurrencia: los días de falta; necesidades de la empresa: los hechos. Sin montos (solo texto).
 */
const fs = require('fs');
const express = require('express');

jest.mock('../src/config/db', () => ({
    query: jest.fn().mockResolvedValue([[]]),
    getConnection: jest.fn(),
}));
jest.mock('../src/middleware/logger', () => ({
    logManualActivity: jest.fn().mockResolvedValue(undefined),
    activityLogger: (req, res, next) => next(),
    resolveEntidad: jest.fn(),
}));

const request = require('supertest');
const app = require('../index');
const db = require('../src/config/db');
const jwt = require('jsonwebtoken');
const carta = require('../src/plantillas/documentos/cartaAviso.plantilla');
const { getCausal } = require('../src/config/causalesDesvinculacion');

const SECRET = process.env.JWT_SECRET || 'secret';
const makeToken = (permisos) => jwt.sign({ id: 3, email: 'rrhh@lols.cl', rol_id: 2, rv: 1, p: permisos }, SECRET);
const tokenOficina = makeToken(['documentos.laborales.emitir', 'documentos.laborales.descargar', 'documentos.descargar', 'documentos.ver']);
const tokenMatias = makeToken(['documentos.laborales.emitir', 'documentos.laborales.descargar', 'documentos.cartas_aviso']);
const BASE = '/api/documentos-laborales';

const TRAB_BAJA = {
    id: 5, rut: '12.345.678-5', nombres: 'Juan Andrés', apellido_paterno: 'Pérez', apellido_materno: 'Soto', fecha_ingreso: '2026-03-02', activo: 0,
    nacionalidad: 'chilena', estado_civil: 'casado', fecha_nacimiento: '1995-12-03', direccion: 'Av. España 505', comuna: 'Santiago',
    empresa_id: 1, cargo_id: 2, obra_id: 7, cargo_nombre: 'Jornal', obra_nombre: 'Edificio Central',
    empresa_rut: '77.085.560-8', empresa_razon_social: 'LOLS Empresas de Ingeniería Ltda.', empresa_direccion: 'El Mirador 150, Cerrillos',
    representante_nombre: 'Luis Lazcano Silva', representante_rut: '7.907.220-6',
};
const DESV = (causal_codigo) => ({
    id: 77, trabajador_id: 5, rut_normalized: '123456785', nombre_snapshot: 'Pérez Soto Juan Andrés',
    fecha_desvinculacion: '2026-10-26', fecha_ingreso_periodo: '2026-03-02', causal_codigo, detalle: 'ANTECEDENTE-SECRETO',
    no_recontratar: 0, desvinculado_por: 3, desvinculado_por_nombre: 'RRHH', desvinculado_en: '2026-10-26 10:00:00',
    finiquito_documento_id: null, reactivado_por: null, reactivado_por_nombre: null, reactivado_en: null,
});
const TIPO = [{ id: 19, nombre: 'Carta de Aviso de Término (Bóveda)' }];
const RUTS = [{ rut_trabajador: '12.345.678-5', rut_empresa: '77.085.560-8' }];
const DIAS = ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24'];

let spies = [];
beforeEach(() => {
    db.query.mockReset().mockResolvedValue([[]]);
    const realRead = fs.readFileSync.bind(fs);
    spies = [
        jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {}),
        jest.spyOn(fs, 'mkdirSync').mockImplementation(() => {}),
        jest.spyOn(fs, 'existsSync').mockImplementation(() => true),
        jest.spyOn(fs, 'readFileSync').mockImplementation((p, enc) => (String(p).includes('uploads') ? '﻿<!DOCTYPE html><html><body>CARTA</body></html>' : realRead(p, enc))),
        jest.spyOn(express.response, 'download').mockImplementation(function (p, name) { this.status(200).send(`FILE:${name}`); }),
    ];
});
afterEach(() => spies.forEach(s => s.mockRestore()));

const post = (token, body) => request(app).post(`${BASE}/emitir/5`).set('Authorization', `Bearer ${token}`).send({ codigo: 'CARTA_AVISO', ...body });

describe('solo con «Cartas de aviso de término»', () => {
    test('emitir con el permiso de documentos laborales (sin el de cartas) → 403 sin tocar la BD', async () => {
        const res = await post(tokenOficina, { dias_inasistencia: DIAS });
        expect(res.status).toBe(403);
        expect(res.body.error).toMatch(/Cartas de aviso de término/);
        expect(db.query).not.toHaveBeenCalled();
    });

    test('quien tiene solo el de cartas no emite otros documentos laborales', async () => {
        const soloCartas = makeToken(['documentos.cartas_aviso']);
        const res = await request(app).post(`${BASE}/emitir/5`).set('Authorization', `Bearer ${soloCartas}`).send({ codigo: 'AMONESTACION', fecha_carta: '2026-11-26' });
        expect(res.status).toBe(403);
        expect(db.query).not.toHaveBeenCalled();
    });

    const FILA = { ruta_archivo: '5/Carta_aviso_Perez_20261126-100000.doc', nombre_archivo: 'Carta_aviso_Perez_20261126-100000.doc', trabajador_id: 5, origen: 'generado', estado: 'generado', tipo_codigo: 'CARTA_AVISO', tipo_nombre: 'Carta de Aviso de Término (Bóveda)', restringido: 1 };

    test.each([
        ['/documentos-laborales/:id/download', `${BASE}/601/download`],
        ['/documentos-laborales/:id/html', `${BASE}/601/html`],
        ['/documentos/download/:id', '/api/documentos/download/601'],
    ])('%s: oficina sin el permiso → 403; con el permiso → 200', async (_n, url) => {
        db.query.mockResolvedValueOnce([[FILA]]);
        let res = await request(app).get(url).set('Authorization', `Bearer ${tokenOficina}`);
        expect(res.status).toBe(403);
        expect(db.query.mock.calls.some(c => /UPDATE documentos/i.test(String(c[0])))).toBe(false);

        db.query.mockReset().mockResolvedValue([[]]);
        db.query.mockResolvedValueOnce([[FILA]]).mockResolvedValueOnce([{ affectedRows: 1 }]);
        const tokenConDocs = makeToken(['documentos.descargar', 'documentos.laborales.descargar', 'documentos.cartas_aviso']);
        res = await request(app).get(url).set('Authorization', `Bearer ${url.startsWith('/api/documentos/') ? tokenConDocs : tokenMatias}`);
        expect(res.status).toBe(200);
    });

    test('un contrato no se abre con solo el permiso de cartas', async () => {
        const soloCartas = makeToken(['documentos.cartas_aviso']);
        db.query.mockResolvedValueOnce([[{ ...FILA, tipo_codigo: 'CONTRATO', tipo_nombre: 'Contrato de Trabajo (Bóveda)' }]]);
        const res = await request(app).get(`${BASE}/601/html`).set('Authorization', `Bearer ${soloCartas}`);
        expect(res.status).toBe(403);
    });

    test('días de falta: solo con el permiso de cartas; los 60 días antes de la baja, estado F', async () => {
        let res = await request(app).get(`${BASE}/carta-aviso/inasistencias/5`).set('Authorization', `Bearer ${tokenOficina}`);
        expect(res.status).toBe(403);

        db.query.mockResolvedValueOnce([[DESV('INASISTENCIA')]])
            .mockResolvedValueOnce([DIAS.map(fecha => ({ fecha, obra: 'Edificio Central' }))]);
        res = await request(app).get(`${BASE}/carta-aviso/inasistencias/5`).set('Authorization', `Bearer ${tokenMatias}`);
        expect(res.status).toBe(200);
        expect(res.body.data).toMatchObject({ desde: '2026-08-27', hasta: '2026-10-26' });
        expect(res.body.data.dias.map(d => d.fecha)).toEqual(DIAS);
        const [sql, params] = db.query.mock.calls[1];
        expect(sql).toContain("ea.codigo = 'F'");
        expect(params).toEqual([5, '2026-08-27', '2026-10-26']);
    });
});

describe('emitir la carta', () => {
    test('409 con el trabajador activo (la carta sale de la baja, como el finiquito)', async () => {
        db.query.mockResolvedValueOnce([[{ ...TRAB_BAJA, activo: 1 }]]);
        const res = await post(tokenMatias, { dias_inasistencia: DIAS });
        expect(res.status).toBe(409);
        expect(res.body.code).toBe('TRABAJADOR_ACTIVO');
        expect(res.body.error).toMatch(/la carta de aviso/);
    });

    test('409 si la baja tiene otra causal legal (abandono): solo las tres causales', async () => {
        db.query.mockResolvedValueOnce([[TRAB_BAJA]]).mockResolvedValueOnce([[DESV('ABANDONO')]]);
        const res = await post(tokenMatias, {});
        expect(res.status).toBe(409);
        expect(res.body.faltan).toEqual([expect.stringMatching(/necesidades de la empresa, vencimiento del plazo o no concurrencia.*Abandono/)]);
        expect(fs.writeFileSync).not.toHaveBeenCalled();
    });

    test('409 no concurrencia sin días; necesidades de la empresa sin hechos', async () => {
        db.query.mockResolvedValueOnce([[TRAB_BAJA]]).mockResolvedValueOnce([[DESV('INASISTENCIA')]]);
        let res = await post(tokenMatias, {});
        expect(res.body.faltan).toEqual(['los días de inasistencia']);

        db.query.mockReset().mockResolvedValue([[]]);
        db.query.mockResolvedValueOnce([[TRAB_BAJA]]).mockResolvedValueOnce([[DESV('NECESIDADES_EMPRESA')]]);
        res = await post(tokenMatias, {});
        expect(res.status).toBe(409);
        expect(res.body.faltan).toEqual([expect.stringMatching(/hechos/)]);
    });

    test('baja operativa LOLS (término de faena): se elige una de las tres', async () => {
        db.query.mockResolvedValueOnce([[TRAB_BAJA]]).mockResolvedValueOnce([[DESV('TERMINO_FAENA')]]);
        let res = await post(tokenMatias, {});
        expect(res.body.faltan).toEqual([expect.stringMatching(/causal legal a imprimir/)]);

        db.query.mockReset().mockResolvedValue([[]]);
        db.query.mockResolvedValueOnce([[TRAB_BAJA]]).mockResolvedValueOnce([[DESV('TERMINO_FAENA')]]);
        res = await post(tokenMatias, { causal_codigo: 'ABANDONO' });
        expect(res.body.faltan).toEqual([expect.stringMatching(/causal de la carta/)]);
    });

    test('201 no concurrencia: la carta con los días, sin «Recibí copia» ni «c.c.»', async () => {
        db.query
            .mockResolvedValueOnce([[TRAB_BAJA]])
            .mockResolvedValueOnce([[DESV('INASISTENCIA')]])
            .mockResolvedValueOnce([TIPO])
            .mockResolvedValueOnce([RUTS])
            .mockResolvedValueOnce([{ insertId: 611, affectedRows: 1 }]);
        const res = await post(tokenMatias, { fecha_carta: '2026-10-26', dias_inasistencia: [...DIAS, 'basura', DIAS[0]] });
        expect(res.status).toBe(201);
        expect(res.body.data).toMatchObject({ documento_id: 611, tipo_codigo: 'CARTA_AVISO' });
        expect(res.body.data.nombre_archivo).toMatch(/^Carta_aviso_Perez_Juan_Andres_\d{8}-\d{6}\.doc$/);
        const html = fs.writeFileSync.mock.calls[0][1].toString('utf8');
        expect(html).toContain('REF.: AVISO DE TÉRMINO DE CONTRATO DE TRABAJO');
        expect(html).toContain('Artículo 160, N° 3 del Código del Trabajo');
        expect(html).toContain('No concurrencia del trabajador a sus labores sin causa justificada');
        expect(html).toContain('los días 19, 20, 21, 22, 23 y 24 de octubre de 2026, lo que suma 6 días');
        expect(html).toContain('Av. España 505, Santiago');
        expect(html).not.toContain('Recibí copia');
        expect(html).not.toContain('c.c.');
        expect(html).not.toContain('ANTECEDENTE-SECRETO');
    });
});

describe('plantilla', () => {
    const ctx = (codigo, datos = {}) => ({
        hoy: '2026-11-26',
        empresa: { id: 1, razon_social: 'LOLS Ltda.', rut: '1-9', representante_nombre: 'Rep' },
        trabajador: { id: 5, nombre: 'Juan', rut: '2-7', direccion: 'Calle 1', comuna: 'Maipú', nombres: 'Juan', apellido_paterno: 'P' },
        desvinculacion: { id: 1, fecha_desvinculacion: '2026-11-30', causal_codigo: codigo, causal: getCausal(codigo) },
        datos,
    });

    test('vencimiento del plazo: con la fecha de término; nada más que pedir', () => {
        const c = ctx('VENCIMIENTO_PLAZO');
        expect(carta.requiere(c)).toEqual([]);
        expect(carta.build(c)).toContain('el plazo convenido en su contrato de trabajo vence el día 30 de noviembre de 2026');
    });

    test('necesidades de la empresa: solo el texto de la causal y los hechos, nada de dinero (Marcos 2026-11-26)', () => {
        const c = ctx('NECESIDADES_EMPRESA', { hechos: 'termina la obra gruesa.', montos: [{ concepto: 'x', monto: 1 }] });
        expect(carta.requiere(c)).toEqual([]);
        const html = carta.build(c);
        expect(html).toContain('Artículo 161, N° 1 del Código del Trabajo');
        expect(html).toContain('termina la obra gruesa.');
        for (const palabra of ['$', 'monto', 'indemnizaci', 'treinta días']) expect(html.toLowerCase()).not.toContain(palabra);
    });

    test('días de varios meses se agrupan por mes', () => {
        expect(carta._interno.listaDias(['2026-10-30', '2026-11-02', '2026-11-03'])).toBe('30 de octubre de 2026 y 2 y 3 de noviembre de 2026');
    });
});
