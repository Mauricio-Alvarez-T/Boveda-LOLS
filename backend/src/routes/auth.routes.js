const router = require('express').Router();
const authController = require('../controllers/auth.controller');
const auth = require('../middleware/auth');
const validateBody = require('../middleware/validateBody');
const { cambiarPassword } = require('../schemas/usuarios.schema');

router.post('/login', authController.login);
router.get('/me', auth, authController.me);
router.put('/me/password', auth, validateBody(cambiarPassword), authController.changePassword);
router.post('/setup-admin', authController.setupAdmin); // Only for initial setup

module.exports = router;
