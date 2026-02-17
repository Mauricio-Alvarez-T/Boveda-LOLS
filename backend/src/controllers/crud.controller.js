/**
 * Genera un controlador CRUD genérico a partir de un servicio.
 * @param {object} service - Servicio CRUD (generado por crud.service.js)
 */
const createCrudController = (service) => ({
    async getAll(req, res, next) {
        try {
            const result = await service.getAll(req.query);
            res.json(result);
        } catch (err) { next(err); }
    },

    async getById(req, res, next) {
        try {
            const item = await service.getById(req.params.id);
            res.json(item);
        } catch (err) { next(err); }
    },

    async create(req, res, next) {
        try {
            const item = await service.create(req.body);
            res.status(201).json(item);
        } catch (err) { next(err); }
    },

    async update(req, res, next) {
        try {
            const item = await service.update(req.params.id, req.body);
            res.json(item);
        } catch (err) { next(err); }
    },

    async remove(req, res, next) {
        try {
            const result = await service.softDelete(req.params.id);
            res.json(result);
        } catch (err) { next(err); }
    }
});

module.exports = createCrudController;
