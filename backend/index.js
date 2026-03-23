const fs = require('fs');
const path = require('path');
process.on('uncaughtException', (err) => {
  fs.appendFileSync(path.join(__dirname, 'startup_debug.log'), `[UNCAUGHT] ${new Date().toISOString()}\n${err.stack}\n\n`);
});
process.on('unhandledRejection', (reason, promise) => {
  fs.appendFileSync(path.join(__dirname, 'startup_debug.log'), `[UNHANDLED] ${new Date().toISOString()}\n${reason}\n\n`);
});

require('dotenv').config();
const versionService = require('./src/services/version.service');
versionService.init();

const express = require('express');
const cors = require('cors');
const errorHandler = require('./src/middleware/errorHandler');
const activityLogger = require('./src/middleware/logger').activityLogger;
const logger = require('./src/utils/logger-structured');
const dashboardService = require('./src/services/dashboard.service');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(activityLogger);
app.use(logger.requestLogger);

// Database connection (auto-tests on import)
const db = require('./src/config/db');

// Helper: safely load a route module
function safeRoute(path, routeModule, routeName) {
  try {
    if (typeof routeModule === 'function') {
      app.use(path, routeModule);
    } else {
      app.use(path, require(routeModule));
    }
    logger.info(`✅ Ruta cargada: ${routeName || path}`);
  } catch (err) {
    logger.error(`❌ Error cargando ruta ${routeName || path}: ${err.message}`, { stack: err.stack });
    // Mount a fallback that returns 503 for this path
    app.use(path, (req, res) => {
      res.status(503).json({ error: `Módulo ${routeName || path} no disponible`, detail: err.message });
    });
  }
}


// ============================================
// ROUTES
// ============================================

// Auth (critical — always load directly)
app.use('/api/auth', require('./src/routes/auth.routes'));

// CRUD routes (safe loading)
const createCrudRoutes = require('./src/routes/crud.routes');

try {
  app.use('/api/empresas', createCrudRoutes('empresas', 'empresas', { searchFields: ['rut', 'razon_social'], orderBy: 'razon_social ASC' }));
  app.use('/api/obras', createCrudRoutes('obras', 'obras', {
    searchFields: ['nombre', 'direccion'],
    joins: 'LEFT JOIN empresas e ON obras.empresa_id = e.id',
    selectFields: 'obras.*, e.razon_social as empresa_nombre',
    activeColumn: 'activa',
    orderBy: 'obras.nombre ASC'
  }));
  app.use('/api/cargos', createCrudRoutes('cargos', 'cargos', { searchFields: ['nombre'], orderBy: 'nombre ASC' }));
  app.use('/api/trabajadores', createCrudRoutes('trabajadores', 'trabajadores', {
    searchFields: ['rut', 'nombres', 'apellido_paterno'],
    joins: 'LEFT JOIN empresas e ON trabajadores.empresa_id = e.id LEFT JOIN obras o ON trabajadores.obra_id = o.id LEFT JOIN cargos c ON trabajadores.cargo_id = c.id',
    selectFields: 'trabajadores.*, e.razon_social as empresa_nombre, o.nombre as obra_nombre, c.nombre as cargo_nombre',
    allowedFilters: ['obra_id', 'empresa_id', 'cargo_id'],
    useSoftDelete: true,
    orderBy: 'trabajadores.apellido_paterno ASC, trabajadores.apellido_materno ASC, trabajadores.nombres ASC'
  }));
  app.use('/api/tipos-ausencia', createCrudRoutes('asistencia', 'tipos_ausencia', { searchFields: ['nombre'], orderBy: 'nombre ASC' }));
  app.use('/api/estados-asistencia', createCrudRoutes('asistencia', 'estados_asistencia', { searchFields: ['nombre', 'codigo'], orderBy: 'nombre ASC' }));
  logger.info('✅ Rutas CRUD genéricas cargadas');
} catch (err) {
  logger.error('❌ Error cargando rutas CRUD genéricas', { error: err.message, stack: err.stack });
}

// Specialized routes (each wrapped independently)
safeRoute('/api/documentos', './src/routes/documentos.routes', 'Documentos');
safeRoute('/api/asistencias', './src/routes/asistencias.routes', 'Asistencias');
safeRoute('/api/fiscalizacion', './src/routes/fiscalizacion.routes', 'Fiscalización');
safeRoute('/api/usuarios/me/email-config', './src/routes/email-config.routes', 'Email Config');
safeRoute('/api/usuarios/me/plantillas', './src/routes/plantillas.routes', 'Plantillas Email');
safeRoute('/api/usuarios', './src/routes/usuarios.routes', 'Usuarios');
safeRoute('/api/feriados', './src/routes/feriados.routes', 'Feriados');
safeRoute('/api/config-horarios', './src/routes/config-horarios.routes', 'Config Horarios');
safeRoute('/api/logs', './src/routes/logs.routes', 'Logs');

// ============================================
// Health Check & Dashboard
// ============================================

// Dashboard KPIs
app.get('/api/dashboard/summary', require('./src/middleware/auth'), async (req, res, next) => {
  try {
    const db = require('./src/config/db');
    // Permisos atómicos ya vienen en el JWT payload
    const permisos = req.user.p || [];
    const [users] = await db.query('SELECT nombre FROM usuarios WHERE id = ?', [req.user.id]);
    const nombre = users.length > 0 ? users[0].nombre.split(' ')[0] : '';

    const summary = await dashboardService.getSummary(req.query.obra_id, permisos, nombre);
    res.json({ data: summary });
  } catch (err) { next(err); }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Debug Toolkit (protected by Super Admin)
try {
  const { mountDebugRoutes } = require('./src/utils/debug-toolkit');
  mountDebugRoutes(app, require('./src/middleware/auth'));
} catch (err) {
  logger.warn('Debug toolkit no disponible:', { error: err.message });
}

// ============================================
// PRODUCTION: Serve Frontend Static Files
// ============================================
if (process.env.NODE_ENV === 'production') {
  // The frontend files are uploaded by the user to the subdomain's document root
  const publicPath = path.resolve(__dirname, '../public_html/boveda.lols.cl');
  app.use(express.static(publicPath));

  // SPA catch-all: any non-API GET route serves index.html
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api')) {
      const indexPath = path.join(publicPath, 'index.html');
      // Use sendFile with error callback fallback
      res.sendFile(indexPath, (err) => {
        if (err) {
          // Fallback: try reading the file manually
          try {
            const html = fs.readFileSync(indexPath, 'utf8');
            res.set('Content-Type', 'text/html; charset=utf-8');
            res.send(html);
          } catch (readErr) {
            // Debug: return the exact error so we can diagnose
            res.status(500).json({
              error: 'SPA frontend not found',
              path: indexPath,
              sendFileError: err.message,
              readError: readErr.message
            });
          }
        }
      });
    } else {
      next();
    }
  });
}

// Error Handler (must be last)
app.use(errorHandler);

// Start server
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`🚀 SGDL API corriendo en http://localhost:${PORT}`);
    console.log(`📡 Health check: http://localhost:${PORT}/api/health`);
  });
}

/*
// Ensure database schema is up to date
(async () => {
    try {
        // 1. Column for worker termination date
        await db.query(`ALTER TABLE trabajadores ADD COLUMN IF NOT EXISTS fecha_desvinculacion DATE NULL DEFAULT NULL`);
        
        // 2. Versioning for roles to invalidate sessions
        await db.query(`ALTER TABLE roles ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1`);
        
        console.log("✅ Esquema de base de datos verificado y actualizado");
    } catch (err) {
        console.error("Error al actualizar esquema BD:", err.message);
    }
})();
*/

module.exports = app;
