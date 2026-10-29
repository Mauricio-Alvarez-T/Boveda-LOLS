const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { checkPermission } = require('../middleware/rbac');
const validateBody = require('../middleware/validateBody');
const { logManualActivity } = require('../middleware/logger');
const uploadSitioWeb = require('../middleware/upload-sitio-web');
const schemas = require('../schemas/sitioWeb.schema');
const svc = require('../services/sitioWeb.service');
const fotos = require('../services/sitioWebFotos.service');
const pub = require('../services/sitioWebPublicar.service');

/**
 * Sitio web — las obras de lols.cl (mig 147, docs/reglas/sitio-web.md). Envoltorio { data }.
 *
 * Permisos (checkPermission = basta UNO):
 *   ver      sitio_web.ver | editar | publicar   lista, detalle, fotos, configuración
 *   editar   sitio_web.editar | publicar         borradores, orden, incluir/quitar, subir y confirmar fotos
 *   publicar sitio_web.publicar                  aprobar y rechazar fotos, previa, publicar, importar, resincronizar,
 *                                                pendientes (badge) y el ZIP de una simulación
 * Vincular con una obra de la Bóveda pide además `obras.ver`. «Ver como» ya corta toda escritura (auth.js).
 * Las rutas fijas van antes de las que llevan :id. Publicar es SÍNCRONO (Passenger: nada en segundo plano) y
 * responde 200 con el resultado aunque haya fallado (estado 'error' + error_codigo); 409 si hay otra en curso.
 */
const ver = [auth, checkPermission('sitio_web.ver', 'sitio_web.editar', 'sitio_web.publicar')];
const editar = [auth, checkPermission('sitio_web.editar', 'sitio_web.publicar')];
const publicar = [auth, checkPermission('sitio_web.publicar')];
const conObras = checkPermission('obras.ver');

const id = (v) => (/^\d+$/.test(String(v)) ? Number(v) : NaN);
const err400 = (message, code) => Object.assign(new Error(message), { statusCode: 400, code });

/** ZIP del repo para importar en simulación; el tope propio de 40 MB con su mensaje (el genérico dice 10 MB). */
const conPaquete = (req, res, next) => uploadSitioWeb.paquete.single('paquete')(req, res, (e) => {
    if (e && e.code === 'LIMIT_FILE_SIZE') {
        return next(err400(`El ZIP pasa de ${uploadSitioWeb.MAX_PAQUETE / 1024 / 1024} MB: comprime solo src/content/obras y public/proyectos.`, 'SITIO_WEB_PAQUETE_INVALIDO'));
    }
    return next(e);
});
const permisos = (req) => (Array.isArray(req.user?.p) ? req.user.p : []);

/** Historial general de la Bóveda (Configuración → Historial), sin el body: el service ya dejó el detalle. */
const registrarActividad = (req, accion, itemId, resumen) =>
    logManualActivity(req.user.id, 'sitio_web', accion, itemId, JSON.stringify({ resumen }), req,
        { entidad_tipo: 'sitio_web', entidad_label: resumen.slice(0, 120) });

router.get('/config', ...ver, async (req, res, next) => {
    try { res.json({ data: await svc.config() }); } catch (e) { next(e); }
});

// Las tres lecturas que pintan el estado de las obras ponen al día la compilación de la última publicación real
// (cada 20 s a lo más; nunca fallan por eso): una compilación fallida se ve sin abrir esa publicación.
router.get('/obras', ...ver, async (req, res, next) => {
    try {
        await pub.refrescarCompilacion();
        res.json({ data: await svc.listarObras() });
    } catch (e) { next(e); }
});

router.get('/obras/disponibles', ...editar, conObras, async (req, res, next) => {
    try { res.json({ data: await svc.obrasDisponibles() }); } catch (e) { next(e); }
});

router.get('/obras/sugerencias/:obraId', ...editar, conObras, async (req, res, next) => {
    try {
        res.json({ data: await svc.sugerencias(id(req.params.obraId), { verCostos: permisos(req).includes('costos.gestionar') }) });
    } catch (e) { next(e); }
});

router.post('/obras', ...editar, validateBody(schemas.crearObra, { strip: true }), async (req, res, next) => {
    try {
        const r = await svc.crearObra(req.body, req.user.id, { permisos: permisos(req) });
        await registrarActividad(req, 'CREATE', r.id, `Creó la obra «${req.body.nombre}» del sitio web`);
        res.status(201).json({ data: r });
    } catch (e) { next(e); }
});

router.put('/obras/orden', ...editar, validateBody(schemas.orden, { strip: true }), async (req, res, next) => {
    try { res.json({ data: await svc.reordenar(req.body.estado, req.body.ids, req.user.id) }); } catch (e) { next(e); }
});

router.get('/obras/:id', ...ver, async (req, res, next) => {
    try { res.json({ data: await svc.detalleObra(id(req.params.id), { permisos: permisos(req) }) }); } catch (e) { next(e); }
});

router.put('/obras/:id', ...editar, validateBody(schemas.editarObra, { strip: true }), async (req, res, next) => {
    try { res.json({ data: await svc.editarObra(id(req.params.id), req.body, req.user.id, { permisos: permisos(req) }) }); } catch (e) { next(e); }
});

router.put('/obras/:id/incluir', ...editar, validateBody(schemas.incluir, { strip: true }), async (req, res, next) => {
    try {
        const r = await svc.cambiarIncluir(id(req.params.id), req.body.incluir, req.user.id);
        if (!r.sin_cambios) {
            await registrarActividad(req, 'UPDATE', r.id, r.incluir
                ? `Incluyó «${r.nombre}» en el sitio web` : `Quitó «${r.nombre}» del sitio web`);
        }
        res.json({ data: { id: r.id, incluir: r.incluir, ...(r.sin_cambios ? { sin_cambios: true } : {}) } });
    } catch (e) { next(e); }
});

router.delete('/obras/:id', ...editar, async (req, res, next) => {
    try {
        const r = await svc.borrarObra(id(req.params.id), req.user.id);
        await registrarActividad(req, 'DELETE', r.id, `Borró la obra «${r.nombre}» del sitio web`);
        res.json({ data: { id: r.id } });
    } catch (e) { next(e); }
});

router.post('/obras/:id/fotos', ...editar, uploadSitioWeb.single('foto'), async (req, res, next) => {
    try { res.status(201).json({ data: await fotos.subirPortada(id(req.params.id), req.file, req.body || {}, req.user.id) }); } catch (e) { next(e); }
});

router.put('/fotos/:fotoId', ...editar, validateBody(schemas.editarFoto, { strip: true }), async (req, res, next) => {
    try { res.json({ data: await fotos.editarFoto(id(req.params.fotoId), req.body, req.user.id) }); } catch (e) { next(e); }
});

router.post('/fotos/:fotoId/aprobar', ...publicar, async (req, res, next) => {
    try {
        const r = await fotos.aprobarFoto(id(req.params.fotoId), req.user.id);
        if (!r.sin_cambios) await registrarActividad(req, 'UPDATE', r.id, `Aprobó la portada de «${r.obra_nombre}» para el sitio web`);
        res.json({ data: { id: r.id, estado: r.estado || 'vigente', reemplazadas: r.reemplazadas || [], ...(r.sin_cambios ? { sin_cambios: true } : {}) } });
    } catch (e) { next(e); }
});

router.post('/fotos/:fotoId/rechazar', ...publicar, async (req, res, next) => {
    try {
        const r = await fotos.rechazarFoto(id(req.params.fotoId), req.user.id);
        if (!r.sin_cambios) await registrarActividad(req, 'UPDATE', r.id, `Rechazó una foto de «${r.obra_nombre}» del sitio web`);
        res.json({ data: { id: r.id, estado: 'rechazada', estaba_aprobada: !!r.estaba_aprobada, ...(r.sin_cambios ? { sin_cambios: true } : {}) } });
    } catch (e) { next(e); }
});

router.delete('/fotos/:fotoId', ...editar, async (req, res, next) => {
    try { res.json({ data: await fotos.borrarFoto(id(req.params.fotoId), req.user.id) }); } catch (e) { next(e); }
});

/* ──────────────── publicación (plan 4.7, 4.11, 7.2) ──────────────── */

router.get('/pendientes', ...publicar, async (req, res, next) => {
    try {
        await pub.refrescarCompilacion();
        res.json({ data: await pub.pendientes() });
    } catch (e) { next(e); }
});

router.get('/publicacion/previa', ...publicar, async (req, res, next) => {
    try { res.json({ data: await pub.previa() }); } catch (e) { next(e); }
});

router.post('/publicar', ...publicar, validateBody(schemas.publicar, { strip: true }), async (req, res, next) => {
    try {
        if (req.body.confirmo_revision !== true) {
            throw err400('Marca «Revisé los textos y las fotos» antes de publicar.', 'SITIO_WEB_SIN_REVISION');
        }
        const r = await pub.publicar({ userId: req.user.id });
        if (r.estado === 'ok' || r.estado === 'simulada') {
            await registrarActividad(req, 'UPDATE', r.id, r.estado === 'ok'
                ? `Publicó las obras en el sitio web (pub #${r.id})` : `Simuló una publicación del sitio web (pub #${r.id})`);
        }
        res.json({ data: r });
    } catch (e) { next(e); }
});

router.get('/publicaciones', ...ver, async (req, res, next) => {
    try {
        await pub.refrescarCompilacion();
        res.json({ data: await pub.listarPublicaciones() });
    } catch (e) { next(e); }
});

router.post('/publicaciones/importar', ...publicar, conPaquete, async (req, res, next) => {
    try {
        const r = await pub.importar({ userId: req.user.id, archivo: req.file || null });
        if (r.publicacion_id) {
            await registrarActividad(req, 'CREATE', r.publicacion_id, `Importó ${r.importadas.length} obra(s) desde el sitio web`);
        }
        res.json({ data: r });
    } catch (e) { next(e); }
});

router.post('/publicaciones/resincronizar', ...publicar, validateBody(schemas.resincronizar, { strip: true }), async (req, res, next) => {
    try {
        if (req.body.confirmo !== true) throw err400('Confirma que quieres tomar el repo del sitio como base.', 'SITIO_WEB_SIN_CONFIRMAR');
        const r = await pub.resincronizar({ userId: req.user.id });
        await registrarActividad(req, 'UPDATE', r.publicacion_id, `Resincronizó el sitio web con su repo (pub #${r.publicacion_id})`);
        res.json({ data: r });
    } catch (e) { next(e); }
});

router.get('/publicaciones/:id', ...ver, async (req, res, next) => {
    try { res.json({ data: await pub.detallePublicacion(id(req.params.id)) }); } catch (e) { next(e); }
});

router.get('/publicaciones/:id/paquete', ...publicar, async (req, res, next) => {
    try {
        const { rel, root, nombre } = await pub.paquete(id(req.params.id));
        res.attachment(nombre);
        res.sendFile(rel, { root, dotfiles: 'deny', headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } }, (e) => {
            if (e && !res.headersSent) next(e);
        });
    } catch (e) { next(e); }
});

// Descarga autenticada (vista previa en la Bóveda): la ruta sale de la BD, nunca de la URL.
router.get('/fotos/:fotoId/archivo', ...ver, async (req, res, next) => {
    try {
        const { rel, root } = await fotos.archivoFoto(id(req.params.fotoId), req.query.ancho);
        res.sendFile(rel, { root, dotfiles: 'deny', headers: { 'Cache-Control': 'private, max-age=600', 'X-Content-Type-Options': 'nosniff' } }, (e) => {
            if (e && !res.headersSent) next(e);
        });
    } catch (e) { next(e); }
});

module.exports = router;
