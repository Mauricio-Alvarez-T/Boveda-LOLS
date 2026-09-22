const router = require('express').Router();
const auth = require('../middleware/auth');
const { checkPermission } = require('../middleware/rbac');
const actividadesSugeridasService = require('../services/actividadesSugeridas.service');

/**
 * GET /api/actividades-sugeridas?obra_id&mes&anio
 * Listas del mes (por el lunes de su semana; filtro por obra opcional).
 */
router.get('/', auth, checkPermission('asistencia.actividades_sugeridas.ver'), async (req, res, next) => {
    try {
        const { obra_id, mes, anio } = req.query;
        const result = await actividadesSugeridasService.listar({ obra_id, mes, anio });
        res.json({ data: result });
    } catch (err) { next(err); }
});

/**
 * GET /api/actividades-sugeridas/resumen-semana?semana=
 * Resumen de una semana: cuántos asistieron por cargo + totales + semanas disponibles.
 * Sin `semana` devuelve la última semana con asistencia registrada.
 * OJO: las rutas estáticas van ANTES de `/:id` o Express las captura como id.
 */
router.get('/resumen-semana', auth, checkPermission('asistencia.actividades_sugeridas.ver'), async (req, res, next) => {
    try {
        const result = await actividadesSugeridasService.resumenSemana(req.query.semana);
        res.json({ data: result });
    } catch (err) {
        if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
        next(err);
    }
});

/**
 * GET /api/actividades-sugeridas/informe-excel?semana=
 * Informe de asistencia en Excel, 2 hojas: "Por cargo" y "Por obra".
 * Permiso propio: se le da solo a quien prepara los pagos.
 */
router.get('/informe-excel', auth, checkPermission('asistencia.actividades_sugeridas.informe'), async (req, res, next) => {
    try {
        const buffer = await actividadesSugeridasService.generarInformeExcel(req.query.semana);
        const fileName = `Actividades_sugeridas_semana_${req.query.semana}.xlsx`;
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.send(buffer);
    } catch (err) {
        if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
        next(err);
    }
});

/**
 * GET /api/actividades-sugeridas/:id
 * Detalle: cabecera + trabajadores con datos enriquecidos.
 */
router.get('/:id', auth, checkPermission('asistencia.actividades_sugeridas.ver'), async (req, res, next) => {
    try {
        const id = Number(req.params.id);
        if (!id) return res.status(400).json({ error: 'ID inválido' });
        const result = await actividadesSugeridasService.getDetalle(id);
        res.json({ data: result });
    } catch (err) {
        if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
        next(err);
    }
});

/**
 * POST /api/actividades-sugeridas
 * Crea una lista nueva (obra + semana) con sus trabajadores.
 */
router.post('/', auth, checkPermission('asistencia.actividades_sugeridas.crear'), async (req, res, next) => {
    try {
        const result = await actividadesSugeridasService.crearLista(req.body, req.user.id);
        res.status(201).json({ data: result });
    } catch (err) {
        if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
        next(err);
    }
});

/**
 * PUT /api/actividades-sugeridas/:id/lista
 * Edita la lista (solo si estado='citada'): observaciones + trabajadores.
 */
router.put('/:id/lista', auth, checkPermission('asistencia.actividades_sugeridas.editar'), async (req, res, next) => {
    try {
        const id = Number(req.params.id);
        if (!id) return res.status(400).json({ error: 'ID inválido' });
        const result = await actividadesSugeridasService.editarLista(id, req.body, req.user.id);
        res.json({ data: result });
    } catch (err) {
        if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
        next(err);
    }
});

/**
 * PUT /api/actividades-sugeridas/:id/asistencia
 * Registra asistencia (asistio + observacion por trabajador).
 * Acepta trabajadores que no estaban en la lista (citado=0).
 */
router.put('/:id/asistencia', auth, checkPermission('asistencia.actividades_sugeridas.registrar'), async (req, res, next) => {
    try {
        const id = Number(req.params.id);
        if (!id) return res.status(400).json({ error: 'ID inválido' });
        const result = await actividadesSugeridasService.registrarAsistencia(id, req.body, req.user.id);
        res.json({ data: result });
    } catch (err) {
        if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
        next(err);
    }
});

/**
 * DELETE /api/actividades-sugeridas/:id
 * Soft delete: estado='cancelada' + estado='cancelado' en trabajadores.
 */
router.delete('/:id', auth, checkPermission('asistencia.actividades_sugeridas.cancelar'), async (req, res, next) => {
    try {
        const id = Number(req.params.id);
        if (!id) return res.status(400).json({ error: 'ID inválido' });
        const result = await actividadesSugeridasService.cancelar(id, req.user.id);
        res.json({ data: result });
    } catch (err) {
        if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
        next(err);
    }
});

module.exports = router;
