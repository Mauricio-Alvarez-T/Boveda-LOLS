const router = require('express').Router();
const auth = require('../middleware/auth');
const { checkPermission } = require('../middleware/rbac');
const bombaService = require('../services/bomba-hormigon.service');
const { sanitizeRegistrosBomba, sanitizeRegistroBomba } = require('../utils/sanitizeFinancialFields');

// Sanitización financiera: el campo `costo` de los registros de bomba se
// omite del JSON si el usuario no tiene `inventario.bombas.ver_costos`.
// Mantiene visible el resto (fecha, obra, externa, etc.) para que usuarios
// sin permiso $ sigan operando el módulo.

router.get('/', auth, checkPermission('inventario.ver'), async (req, res, next) => {
    try {
        const result = await bombaService.getAll(req.query);
        // result puede ser { data: [...] } (envuelto por el service) o un array
        // directo. Normalizamos para sanitizar el array y devolver el wrap.
        if (result && Array.isArray(result.data)) {
            result.data = sanitizeRegistrosBomba(result.data, req.user?.p);
            return res.json(result);
        }
        res.json(Array.isArray(result) ? sanitizeRegistrosBomba(result, req.user?.p) : result);
    } catch (err) { next(err); }
});

router.get('/resumen/:obraId', auth, checkPermission('inventario.ver'), async (req, res, next) => {
    try {
        const { mes, anio } = req.query;
        const now = new Date();
        const result = await bombaService.getResumenPorObra(
            req.params.obraId,
            mes ? parseInt(mes) : now.getMonth() + 1,
            anio ? parseInt(anio) : now.getFullYear()
        );
        // El resumen puede traer agregados $ (costo_externo, etc.). Si no
        // tiene permiso, sanitizamos también el agregado.
        const perms = req.user?.p || [];
        if (!perms.includes('inventario.bombas.ver_costos') && result && typeof result === 'object') {
            const { costo, costo_externo, costo_total, ...rest } = result;
            return res.json({ data: rest });
        }
        res.json({ data: result });
    } catch (err) { next(err); }
});

router.post('/', auth, checkPermission('inventario.crear'), async (req, res, next) => {
    try {
        // Si el body trae `costo` y el usuario no tiene permiso $, lo descartamos
        // silenciosamente — preserva la creación sin filtrar montos sensibles.
        const body = (req.user?.p || []).includes('inventario.bombas.ver_costos')
            ? req.body
            : (() => { const { costo, ...rest } = req.body || {}; return rest; })();
        const result = await bombaService.registrar(body, req.user.id);
        res.status(201).json({ data: sanitizeRegistroBomba(result, req.user?.p) });
    } catch (err) { next(err); }
});

router.put('/:id', auth, checkPermission('inventario.editar'), async (req, res, next) => {
    try {
        // Bloqueo de edición de `costo` sin permiso $ — 403 explícito porque
        // editar costos sin verlos lleva a errores y burla intención del gate.
        if (
            req.body && Object.prototype.hasOwnProperty.call(req.body, 'costo') &&
            !(req.user?.p || []).includes('inventario.bombas.ver_costos')
        ) {
            return res.status(403).json({ error: 'No autorizado para editar costo de bomba.' });
        }
        const result = await bombaService.update(req.params.id, req.body);
        res.json({ data: sanitizeRegistroBomba(result, req.user?.p) });
    } catch (err) { next(err); }
});

router.delete('/:id', auth, checkPermission('inventario.eliminar'), async (req, res, next) => {
    try {
        const result = await bombaService.remove(req.params.id);
        res.json({ data: result });
    } catch (err) { next(err); }
});

module.exports = router;
