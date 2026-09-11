/**
 * Documentos laborales generados por Bóveda (plan Gestiones B2, mig 110).
 *
 * Orquesta: cargar trabajador + empresa → armar `ctx` → plantilla.requiere → build → persistir vía
 * documentoService.crearGenerado → log manual sin montos. La descarga/impresión pasa SOLO por acá
 * (gate exclusivo documentos.laborales.descargar en la ruta) y marca el documento como descargado.
 *
 * Reglas: docs/reglas/rrhh-trabajadores.md § Documentos laborales generados.
 */
const fs = require('fs');
const db = require('../config/db');
const documentoService = require('./documento.service');
const cargoSueldoService = require('./cargoSueldo.service');
const g = require('./docGenerador.service');
const { getPlantilla, KIT_INGRESO, EMITIBLES } = require('../plantillas/documentos');
const { logManualActivity } = require('../middleware/logger');
const logger = require('../utils/logger-structured');

const httpError = (msg, statusCode, extra = {}) => Object.assign(new Error(msg), { statusCode, ...extra });
const COL_INEXISTENTE = 1054;

const SELECT_TRABAJADOR_BASE = `
    SELECT t.id, t.rut, t.nombres, t.apellido_paterno, t.apellido_materno, t.fecha_ingreso, t.activo,
           t.nacionalidad, t.estado_civil, t.fecha_nacimiento, t.direccion, t.comuna,
           t.empresa_id, t.cargo_id, t.obra_id,
           c.nombre AS cargo_nombre, o.nombre AS obra_nombre,
           e.rut AS empresa_rut, e.razon_social AS empresa_razon_social, e.direccion AS empresa_direccion
           __REP__
      FROM trabajadores t
      LEFT JOIN cargos c ON c.id = t.cargo_id
      LEFT JOIN obras o ON o.id = t.obra_id
      LEFT JOIN empresas e ON e.id = t.empresa_id
     WHERE t.id = ?`;

const SELECT_SOLICITUD = `
    SELECT s.*, c.nombre AS cargo_nombre, o.nombre AS obra_nombre, e.razon_social AS empresa_nombre,
           us.nombre AS solicitante_nombre, ur.nombre AS resuelto_por_nombre
      FROM solicitudes_ingreso s
      LEFT JOIN cargos c ON c.id = s.cargo_id
      LEFT JOIN obras o ON o.id = s.obra_id
      LEFT JOIN empresas e ON e.id = s.empresa_id
      LEFT JOIN usuarios us ON us.id = s.solicitante_id
      LEFT JOIN usuarios ur ON ur.id = s.resuelto_por
     WHERE s.id = ?`;

const toYmd = (v) => (v == null ? null : (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10)));
const nombreCompleto = (t) => [t.nombres, t.apellido_paterno, t.apellido_materno].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();

/** Trabajador + empresa (con representante si la mig 110 ya corrió; si no, degrada sin las columnas). */
async function _cargarTrabajador(trabajadorId, conn = db) {
    const id = Number(trabajadorId);
    if (!Number.isInteger(id) || id <= 0) throw httpError('Trabajador inválido', 400);
    let rows;
    try {
        [rows] = await conn.query(SELECT_TRABAJADOR_BASE.replace('__REP__', ', e.representante_nombre, e.representante_rut'), [id]);
    } catch (err) {
        if (err.errno !== COL_INEXISTENTE) throw err;
        logger.warn('empresas.representante_* no existe (mig 110 pendiente): contrato/finiquito no podrán emitirse');
        [rows] = await conn.query(SELECT_TRABAJADOR_BASE.replace('__REP__', ''), [id]);
    }
    if (!rows.length) throw httpError('Trabajador no encontrado', 404);
    const r = rows[0];
    return {
        row: r,
        trabajador: {
            id: r.id, rut: r.rut, nombres: r.nombres, apellido_paterno: r.apellido_paterno, apellido_materno: r.apellido_materno,
            nombre: nombreCompleto(r), activo: !!r.activo,
            nacionalidad: r.nacionalidad, estado_civil: r.estado_civil, fecha_nacimiento: toYmd(r.fecha_nacimiento),
            direccion: r.direccion, comuna: r.comuna, fecha_ingreso: toYmd(r.fecha_ingreso),
            cargo_id: r.cargo_id, cargo_nombre: r.cargo_nombre, obra_nombre: r.obra_nombre,
        },
        empresa: r.empresa_id ? {
            id: r.empresa_id, rut: r.empresa_rut, razon_social: r.empresa_razon_social, direccion: r.empresa_direccion,
            representante_nombre: r.representante_nombre ?? null, representante_rut: r.representante_rut ?? null,
        } : null,
    };
}

/** ctx completo para una plantilla (agrega remuneración solo cuando la plantilla la imprime). */
async function _armarCtx(codigo, cargado, datos) {
    const ctx = { hoy: g.hoyYmd(), empresa: cargado.empresa, trabajador: cargado.trabajador, datos: datos || {}, remuneracion: null };
    if (codigo === 'CONTRATO' && cargado.trabajador.cargo_id) {
        const s = await cargoSueldoService.getPorCargo(cargado.trabajador.cargo_id);
        if (s && Number(s.sueldo_base) > 0) ctx.remuneracion = { sueldo_base: Number(s.sueldo_base), fuente: 'cargo_sueldos' };
    }
    return ctx;
}

function _validar(plantilla, ctx) {
    const faltan = plantilla.requiere(ctx);
    if (!faltan.length) return;
    const details = { faltan, codigo: plantilla.codigo };
    // Hook opcional: qué columnas de `trabajadores` faltan. El modal de emisión las pide ahí mismo
    // en vez de mandar al usuario a editar la ficha (plan Gestiones B2b).
    const campos = typeof plantilla.camposTrabajadorFaltantes === 'function' ? plantilla.camposTrabajadorFaltantes(ctx) : [];
    if (campos.length) details.campos_trabajador = campos;
    throw httpError(`No se puede emitir ${plantilla.titulo}: falta ${faltan.join('; ')}.`, 409, { code: 'DATOS_FALTANTES', details });
}

async function _persistir(plantilla, ctx, trabajadorId, userId, req) {
    const html = g.wrapHtml(plantilla.titulo, plantilla.build(ctx));
    const doc = await documentoService.crearGenerado({
        trabajadorId,
        tipoCodigo: plantilla.codigo,
        html,
        userId,
        metadata: plantilla.metadata(ctx),
        plantillaVersion: plantilla.version,
        nombreBase: plantilla.nombreBase(ctx),
    });
    await logManualActivity(
        userId, 'documentos', 'CREATE', String(doc.id),
        JSON.stringify({ evento: 'documento_emitido', tipo: plantilla.codigo, trabajador_id: Number(trabajadorId), plantilla_version: plantilla.version,
            resumen: `${plantilla.titulo} emitido para ${ctx.trabajador?.nombre || `trabajador #${trabajadorId}`}` }),
        req
    );
    return { documento_id: doc.id, nombre_archivo: doc.nombre_archivo, tipo_codigo: plantilla.codigo, tipo_nombre: doc.tipo_nombre, estado: 'generado' };
}

const documentosLaboralesService = {
    KIT_INGRESO,
    EMITIBLES,

    /** Catálogo para el modal: qué documentos existen y cuál es el kit. */
    catalogo() {
        return {
            kit: KIT_INGRESO.map(c => { const p = getPlantilla(c); return { codigo: c, titulo: p.titulo, version: p.version }; }),
            emitibles: EMITIBLES.map(c => { const p = getPlantilla(c); return { codigo: c, titulo: p.titulo, version: p.version }; }),
            epp_default: getPlantilla('EPP_RECEPCION').EPP_DEFAULT,
            amonestacion_motivos: getPlantilla('AMONESTACION').MOTIVOS,
        };
    },

    /**
     * Emite UN documento para el trabajador. 400 código desconocido; 404 sin trabajador;
     * 409 desvinculado, datos faltantes o tipo del sistema no configurado (mig 110).
     */
    async emitir(trabajadorId, codigo, datos, userId, req) {
        const plantilla = getPlantilla(codigo);
        if (!plantilla || !EMITIBLES.includes(codigo)) throw httpError(`Documento desconocido: ${codigo}`, 400);
        const cargado = await _cargarTrabajador(trabajadorId);
        if (!cargado.trabajador.activo) throw httpError('El trabajador está desvinculado: no se emiten documentos de ingreso ni amonestaciones.', 409);
        const ctx = await _armarCtx(codigo, cargado, datos);
        _validar(plantilla, ctx);
        return _persistir(plantilla, ctx, cargado.trabajador.id, userId, req);
    },

    /**
     * Kit de ingreso: emite los documentos marcados (subconjunto de KIT_INGRESO) en orden. Valida TODOS
     * antes de escribir el primero (un contrato sin sueldo no deja un kit a medias).
     */
    async emitirKit(trabajadorId, body, userId, req) {
        const codigos = KIT_INGRESO.filter(c => (body.documentos || []).includes(c));
        if (!codigos.length) throw httpError(`Marca al menos un documento del kit (${KIT_INGRESO.join(', ')})`, 400);
        const cargado = await _cargarTrabajador(trabajadorId);
        if (!cargado.trabajador.activo) throw httpError('El trabajador está desvinculado: el kit de ingreso no aplica.', 409);

        const pendientes = [];
        for (const codigo of codigos) {
            const plantilla = getPlantilla(codigo);
            const ctx = await _armarCtx(codigo, cargado, body);
            _validar(plantilla, ctx);
            pendientes.push({ plantilla, ctx });
        }
        const emitidos = [];
        for (const { plantilla, ctx } of pendientes) {
            emitidos.push(await _persistir(plantilla, ctx, cargado.trabajador.id, userId, req));
        }
        return { trabajador_id: cargado.trabajador.id, emitidos };
    },

    /**
     * Ficha de solicitud en Word. Aprobada → se persiste en la ficha del trabajador creado (una sola vez;
     * si ya existe se reutiliza). Pendiente/rechazada → HTML al vuelo sin persistir.
     * @returns {{ persistido: boolean, documento_id?: number, nombre_archivo: string, html?: string }}
     */
    async solicitudDoc(solicitudId, userId, req, { emitirSiFalta = true } = {}) {
        const sid = Number(solicitudId);
        if (!Number.isInteger(sid) || sid <= 0) throw httpError('Solicitud inválida', 400);
        const [rows] = await db.query(SELECT_SOLICITUD, [sid]);
        if (!rows.length) throw httpError('Solicitud no encontrada', 404);
        const s = rows[0];
        const plantilla = getPlantilla('SOLICITUD_INGRESO');
        const ctx = { hoy: g.hoyYmd(), solicitud: s, datos: {} };
        const nombreBase = plantilla.nombreBase(ctx);

        if (s.estado === 'aprobada' && s.trabajador_id) {
            const existente = await documentoService.buscarGenerado(s.trabajador_id, 'SOLICITUD_INGRESO');
            if (existente) return { persistido: true, documento_id: existente.id, nombre_archivo: existente.nombre_archivo, trabajador_id: s.trabajador_id };
            if (!emitirSiFalta) throw httpError('La ficha de esta solicitud aún no fue emitida', 409);
            const html = g.wrapHtml(plantilla.titulo, plantilla.build(ctx));
            const doc = await documentoService.crearGenerado({
                trabajadorId: s.trabajador_id, tipoCodigo: 'SOLICITUD_INGRESO', html, userId,
                metadata: plantilla.metadata(ctx), plantillaVersion: plantilla.version, nombreBase,
            });
            await logManualActivity(userId, 'documentos', 'CREATE', String(doc.id),
                JSON.stringify({ evento: 'documento_emitido', tipo: 'SOLICITUD_INGRESO', trabajador_id: s.trabajador_id, solicitud_id: sid, plantilla_version: plantilla.version,
                    resumen: `Ficha de solicitud #${sid} guardada en el trabajador #${s.trabajador_id}` }), req);
            return { persistido: true, documento_id: doc.id, nombre_archivo: doc.nombre_archivo, trabajador_id: s.trabajador_id };
        }
        // Al vuelo (pendiente / rechazada): no queda en ninguna ficha.
        const html = g.wrapHtml(plantilla.titulo, plantilla.build(ctx));
        await logManualActivity(userId, 'solicitudes_ingreso', 'UPDATE', String(sid),
            JSON.stringify({ evento: 'solicitud_descargada', estado: s.estado, resumen: `Ficha de la solicitud #${sid} (${s.estado}) descargada` }), req);
        return { persistido: false, nombre_archivo: `${nombreBase}_${g.stamp()}.doc`, html };
    },

    /** Documentos generados de un trabajador (sin metadata). */
    async listar(trabajadorId) {
        return documentoService.getByTrabajador(trabajadorId, { origen: 'generado' });
    },

    /**
     * Descarga (o lectura para imprimir) de un documento — CUALQUIER documento activo, restringido o no
     * (el gate de la ruta ya exigió documentos.laborales.descargar). Marca la primera descarga y loguea.
     */
    async abrir(id, userId, req, { modo = 'download' } = {}) {
        const info = await documentoService.getFilePath(id);
        if (!fs.existsSync(info.fullPath)) throw httpError('El archivo no está en el servidor', 404);
        if (modo === 'html') {
            // Solo los .doc que ESTE motor generó son HTML: un Word binario (o un PDF) subido a la ficha
            // también queda con extensión .doc/.pdf y se enviaría como texto corrupto. El 409 va ANTES
            // de marcar/loguear: no hay impresión que registrar.
            if (info.origen !== 'generado') {
                throw httpError('Solo los documentos generados por Bóveda se pueden imprimir desde acá; descarga el archivo.', 409, { code: 'NO_IMPRIMIBLE' });
            }
            const html = g.sinBom(fs.readFileSync(info.fullPath, 'utf8'));
            if (!/^\s*<(!doctype|html)/i.test(html)) {
                throw httpError('El archivo no tiene el formato que genera Bóveda; descárgalo en vez de imprimirlo.', 409, { code: 'NO_IMPRIMIBLE' });
            }
            await documentoService.marcarDescargado(id);
            await logManualActivity(userId, 'documentos', 'UPDATE', String(id),
                JSON.stringify({ evento: 'documento_impreso', tipo: info.tipo_codigo || null, trabajador_id: info.trabajador_id || null,
                    resumen: `Impresión de ${info.tipo_nombre || info.fileName}` }), req);
            return { html, titulo: info.tipo_nombre || info.fileName, nombre_archivo: info.fileName };
        }
        await documentoService.marcarDescargado(id);
        await logManualActivity(userId, 'documentos', 'UPDATE', String(id),
            JSON.stringify({ evento: 'documento_descargado', tipo: info.tipo_codigo || null, trabajador_id: info.trabajador_id || null,
                resumen: `Descarga de ${info.tipo_nombre || info.fileName}` }), req);
        return info;
    },
};

module.exports = documentosLaboralesService;
