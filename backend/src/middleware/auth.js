const jwt = require('jsonwebtoken');
const versionService = require('../services/version.service');

const auth = (req, res, next) => {
    const header = req.headers.authorization;

    if (!header || !header.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Token no proporcionado' });
    }

    const token = header.split(' ')[1];

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Validar versión del rol (RV) para deslogueo por cambio de permisos
        const currentVersion = versionService.get(decoded.rol_id);
        if (!decoded.rv || decoded.rv !== currentVersion) {
            return res.status(401).json({ 
                error: 'Tu sesión ha expirado debido a una actualización de permisos. Por favor, ingresa de nuevo.',
                expired_by_version: true
            });
        }

        req.user = decoded; // { id, email, rol_id, obra_id, permisos, rv }
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Token inválido o expirado' });
    }
};

module.exports = auth;
