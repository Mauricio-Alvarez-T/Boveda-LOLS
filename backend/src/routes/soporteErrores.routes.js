/**
 * /api/soporte/errores — «Errores» de Soporte (mig 141; service soporteErrores.service.js).
 *  · Mandar un aviso, su foto o lo que pasó: CUALQUIER persona con sesión (lo hace su app sola cuando le sale un
 *    error). Un token de «ver como» no llega acá: `auth` rechaza todo lo que no sea GET con esos tokens.
 *  · La bandeja, las fotos y marcar revisado: solo el Super Administrador (`soloSuperAdmin`: rol 1 en el token y en la
 *    BD). Se monta ANTES de /api/soporte (que exige rol 1 a todo) en index.js.
 * Las rutas fijas (/resumen) van antes de /:id. Nada de esto entra al historial (logger.js lo excluye).
 */
const router = require('express').Router();
const auth = require('../middleware/auth');
const soloSuperAdmin = require('../middleware/superAdmin');
const validateBody = require('../middleware/validateBody');
const svc = require('../services/soporteErrores.service');

const sinCache = (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); };

const schemaReportar = {
    categoria: { required: true, type: 'string', in: svc.CATEGORIAS },
    mensaje: { required: true, type: 'string', maxLength: 2000 },
    accion: { type: 'string', maxLength: 500 },
    codigo: { type: 'integer', min: 0, max: 999 },
    permisos_faltantes: { type: 'array' },
    detalle_tecnico: { type: 'string', maxLength: 20000 },
    pantalla: { type: 'string', maxLength: 1000 },
    pantalla_nombre: { type: 'string', maxLength: 500 },
    obra_id: { type: 'integer', min: 1 },
    dispositivo: { type: 'string', in: ['movil', 'escritorio'] },
    duracion_ms: { type: 'integer', min: 0 },
};

// ───────────── Desde la app de cualquier persona ─────────────

/** POST /api/soporte/errores — un aviso. Responde si el servidor quiere la foto (`pedir_foto`). */
router.post('/', auth, validateBody(schemaReportar, { strip: true }), async (req, res, next) => {
    try {
        res.status(201).json({ data: await svc.reportar(req.user, req.body, req) });
    } catch (e) { next(e); }
});

/** POST /api/soporte/errores/:id/foto — la foto pedida (data URL), una sola vez. */
router.post('/:id/foto', auth, validateBody({ foto: { required: true, type: 'string', maxLength: 300000 } }, { strip: true }), async (req, res, next) => {
    try {
        res.json({ data: await svc.subirFoto(req.user, req.params.id, req.body.foto) });
    } catch (e) { next(e); }
});

/** DELETE /api/soporte/errores/:id/foto — «Quitar»: la persona borra la foto de su aviso. */
router.delete('/:id/foto', auth, async (req, res, next) => {
    try {
        res.json({ data: await svc.quitarFoto(req.user, req.params.id) });
    } catch (e) { next(e); }
});

/** PATCH /api/soporte/errores/:id/descripcion — «Contar qué pasó». */
router.patch('/:id/descripcion', auth, validateBody({ descripcion: { type: 'string', maxLength: 1000 } }, { strip: true }), async (req, res, next) => {
    try {
        res.json({ data: await svc.describir(req.user, req.params.id, req.body.descripcion) });
    } catch (e) { next(e); }
});

// ───────────── Solo Super Administrador ─────────────

/** GET /api/soporte/errores/resumen — el número del menú y el aviso de lentitud. */
router.get('/resumen', auth, soloSuperAdmin, sinCache, async (req, res, next) => {
    try {
        res.json({ data: await svc.resumen() });
    } catch (e) { next(e); }
});

/** GET /api/soporte/errores?vista=revisar|revisados|senal|datos|todos */
router.get('/', auth, soloSuperAdmin, sinCache, async (req, res, next) => {
    try {
        res.json({ data: await svc.listar(String(req.query.vista || 'revisar')) });
    } catch (e) { next(e); }
});

/** GET /api/soporte/errores/:id/foto */
router.get('/:id/foto', auth, soloSuperAdmin, async (req, res, next) => {
    try {
        const { buf, mime } = await svc.foto(req.params.id);
        res.set('Content-Type', mime);
        res.set('Cache-Control', 'private, no-store');
        res.send(buf);
    } catch (e) { next(e); }
});

/** PATCH /api/soporte/errores/:id — { estado: 'revisado' | 'pendiente', nota? } */
router.patch('/:id', auth, soloSuperAdmin, sinCache,
    validateBody({ estado: { required: true, type: 'string', in: ['pendiente', 'revisado'] }, nota: { type: 'string', maxLength: 1000 } }, { strip: true }),
    async (req, res, next) => {
        try {
            res.json({ data: await svc.revisar(req.superAdmin, req.params.id, req.body) });
        } catch (e) { next(e); }
    });

module.exports = router;
