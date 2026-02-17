const authService = require('../services/auth.service');

const authController = {
    async login(req, res, next) {
        try {
            const { email, password } = req.body;
            if (!email || !password) {
                return res.status(400).json({ error: 'Email y contraseña son requeridos' });
            }
            const result = await authService.login(email, password);
            res.json(result);
        } catch (err) {
            next(err);
        }
    },

    async me(req, res, next) {
        try {
            const user = await authService.getMe(req.user.id);
            res.json(user);
        } catch (err) {
            next(err);
        }
    },

    async setupAdmin(req, res, next) {
        try {
            const { nombre, email, password } = req.body;
            if (!nombre || !email || !password) {
                return res.status(400).json({ error: 'Nombre, email y contraseña son requeridos' });
            }
            const id = await authService.createInitialAdmin(nombre, email, password);
            res.status(201).json({ id, message: 'Administrador creado exitosamente' });
        } catch (err) {
            next(err);
        }
    }
};

module.exports = authController;
