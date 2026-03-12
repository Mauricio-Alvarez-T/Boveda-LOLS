const express = require('express');
const router = express.Router();
const feriadosService = require('../services/feriados.service');

router.get('/', async (req, res, next) => {
    try {
        const data = await feriadosService.getAll();
        res.json(data);
    } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
    try {
        const data = await feriadosService.create(req.body);
        res.json(data);
    } catch (err) { next(err); }
});

router.post('/sync', async (req, res, next) => {
    try {
        const year = req.body.year || new Date().getFullYear();
        const result = await feriadosService.syncNacionalHolidays(year);
        res.json(result);
    } catch (err) { next(err); }
});

router.put('/:id', async (req, res, next) => {
    try {
        const data = await feriadosService.update(req.params.id, req.body);
        res.json(data);
    } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
    try {
        await feriadosService.delete(req.params.id);
        res.json({ success: true });
    } catch (err) { next(err); }
});

module.exports = router;
