const jwt = require('jsonwebtoken');
const db = require('../config/db');
const logger = require('./logger-structured');

/**
 * Debug Toolkit for Bóveda LOLS
 * Provides diagnostic endpoints for quick troubleshooting.
 * All endpoints require Super Admin (rol_id = 1).
 */

const requireSuperAdmin = (req, res, next) => {
    if (!req.user || req.user.rol_id !== 1) {
        return res.status(403).json({ error: 'Solo Super Administrador puede acceder a diagnósticos' });
    }
    next();
};

/**
 * Mount all debug routes on an Express app.
 */
function mountDebugRoutes(app, auth) {
    // Deep Health Check: verifies DB connectivity, key tables, JWT configuration
    app.get('/api/health/deep', auth, requireSuperAdmin, async (req, res) => {
        const checks = {};
        
        // 1. Database connectivity
        try {
            const [rows] = await db.query('SELECT 1 as ok');
            checks.database = { status: 'ok', detail: 'MySQL conectado' };
        } catch (err) {
            checks.database = { status: 'error', detail: err.message };
        }

        // 2. Permissions catalog check
        try {
            const [catalog] = await db.query('SELECT COUNT(*) as count FROM permisos_catalogo');
            checks.permisos_catalogo = { 
                status: catalog[0].count > 0 ? 'ok' : 'warning', 
                count: catalog[0].count,
                detail: catalog[0].count > 0 ? `${catalog[0].count} permisos registrados` : 'CATÁLOGO VACÍO - ejecutar migración'
            };
        } catch (err) {
            checks.permisos_catalogo = { status: 'error', detail: err.message };
        }

        // 3. Roles check
        try {
            const [roles] = await db.query('SELECT id, nombre, version FROM roles');
            checks.roles = { status: 'ok', count: roles.length, roles };
        } catch (err) {
            checks.roles = { status: 'error', detail: err.message };
        }

        // 4. JWT_SECRET configured
        checks.jwt = { 
            status: process.env.JWT_SECRET ? 'ok' : 'error', 
            detail: process.env.JWT_SECRET ? 'Configurado' : 'JWT_SECRET no definido en .env'
        };

        // 5. Node environment
        checks.environment = {
            node_env: process.env.NODE_ENV || 'development',
            node_version: process.version,
            uptime: `${Math.floor(process.uptime())}s`,
            memory: `${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB`
        };

        const hasErrors = Object.values(checks).some(c => c.status === 'error');
        res.status(hasErrors ? 503 : 200).json({ 
            status: hasErrors ? 'degraded' : 'healthy', 
            timestamp: new Date().toISOString(),
            checks 
        });
    });

    // Token Debugger: decode the current user's JWT to see their permissions
    app.get('/api/debug/token', auth, requireSuperAdmin, (req, res) => {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(400).json({ error: 'No token' });

        try {
            const decoded = jwt.decode(token);
            res.json({
                user_id: decoded.id,
                email: decoded.email,
                rol_id: decoded.rol_id,
                obra_id: decoded.obra_id,
                permisos_count: (decoded.p || []).length,
                permisos: decoded.p || [],
                role_version: decoded.rv,
                issued_at: new Date(decoded.iat * 1000).toISOString(),
                expires_at: new Date(decoded.exp * 1000).toISOString(),
                time_remaining: `${Math.max(0, Math.floor((decoded.exp * 1000 - Date.now()) / 60000))} minutos`
            });
        } catch (err) {
            res.status(400).json({ error: 'Error decodificando token', detail: err.message });
        }
    });

    // Route Lister: shows all registered Express routes
    app.get('/api/debug/routes', auth, requireSuperAdmin, (req, res) => {
        const routes = [];
        
        function extractRoutes(stack, basePath = '') {
            stack.forEach(layer => {
                if (layer.route) {
                    const methods = Object.keys(layer.route.methods).map(m => m.toUpperCase()).join(',');
                    routes.push({ method: methods, path: basePath + layer.route.path });
                } else if (layer.name === 'router' && layer.handle.stack) {
                    const routerPath = layer.regexp.source
                        .replace('\\/?(?=\\/|$)', '')
                        .replace(/\\\//g, '/')
                        .replace(/\^/, '')
                        .replace(/\(\?:\(\[\^\\\/\]\+\?\)\)/, ':param');
                    extractRoutes(layer.handle.stack, basePath + routerPath);
                }
            });
        }

        extractRoutes(app._router.stack);
        res.json({ total: routes.length, routes });
    });

    logger.info('🔧 Debug toolkit montado: /api/health/deep, /api/debug/token, /api/debug/routes');
}

module.exports = { mountDebugRoutes };
