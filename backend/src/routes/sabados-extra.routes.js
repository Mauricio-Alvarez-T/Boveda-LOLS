const router = require('express').Router();
const auth = require('../middleware/auth');
const { checkPermission } = require('../middleware/rbac');
const sabadosExtraService = require('../services/sabadosExtra.service');

/**
 * GET /api/sabados-extra?obra_id&mes&anio
 * Lista citaciones del mes (filtro por obra opcional).
 */
router.get('/', auth, checkPermission('asistencia.sabados_extra.ver'), async (req, res, next) => {
    try {
        const { obra_id, mes, anio } = req.query;
        const result = await sabadosExtraService.listar({ obra_id, mes, anio });
        res.json({ data: result });
    } catch (err) { next(err); }
});

/**
 * GET /api/sabados-extra/:id
 * Detalle: cabecera + trabajadores con datos enriquecidos.
 */
router.get('/:id', auth, checkPermission('asistencia.sabados_extra.ver'), async (req, res, next) => {
    try {
        const id = Number(req.params.id);
        if (!id) return res.status(400).json({ error: 'ID inválido' });
        const result = await sabadosExtraService.getDetalle(id);
        res.json({ data: result });
    } catch (err) {
        if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
        next(err);
    }
});

/**
 * POST /api/sabados-extra
 * Crea citación nueva con lista inicial de trabajadores.
 */
router.post('/', auth, checkPermission('asistencia.sabados_extra.crear'), async (req, res, next) => {
    try {
        const result = await sabadosExtraService.crearCitacion(req.body, req.user.id);
        res.status(201).json({ data: result });
    } catch (err) {
        if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
        next(err);
    }
});

/**
 * PUT /api/sabados-extra/:id/citacion
 * Edita citación (solo si estado='citada'): observaciones + lista trabajadores.
 */
router.put('/:id/citacion', auth, checkPermission('asistencia.sabados_extra.editar'), async (req, res, next) => {
    try {
        const id = Number(req.params.id);
        if (!id) return res.status(400).json({ error: 'ID inválido' });
        const result = await sabadosExtraService.editarCitacion(id, req.body, req.user.id);
        res.json({ data: result });
    } catch (err) {
        if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
        next(err);
    }
});

/**
 * PUT /api/sabados-extra/:id/asistencia
 * Registra asistencia el día (asistio + horas + observacion por trabajador).
 * Acepta no-citados que llegaron (citado=0).
 */
router.put('/:id/asistencia', auth, checkPermission('asistencia.sabados_extra.registrar'), async (req, res, next) => {
    try {
        const id = Number(req.params.id);
        if (!id) return res.status(400).json({ error: 'ID inválido' });
        const result = await sabadosExtraService.registrarAsistencia(id, req.body, req.user.id);
        res.json({ data: result });
    } catch (err) {
        if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
        next(err);
    }
});

/**
 * DELETE /api/sabados-extra/:id
 * Soft delete: estado='cancelada' + estado='cancelado' en trabajadores.
 */
router.delete('/:id', auth, checkPermission('asistencia.sabados_extra.cancelar'), async (req, res, next) => {
    try {
        const id = Number(req.params.id);
        if (!id) return res.status(400).json({ error: 'ID inválido' });
        const result = await sabadosExtraService.cancelar(id, req.user.id);
        res.json({ data: result });
    } catch (err) {
        if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
        next(err);
    }
});

module.exports = router;
