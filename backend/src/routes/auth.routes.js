const router = require('express').Router();
const authController = require('../controllers/auth.controller');
const auth = require('../middleware/auth');

router.post('/login', authController.login);
router.get('/me', auth, authController.me);
router.post('/setup-admin', authController.setupAdmin); // Only for initial setup

module.exports = router;
