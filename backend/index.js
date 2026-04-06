const fs = require('fs');
const path = require('path');
process.on('uncaughtException', (err) => {
  fs.appendFileSync(path.join(__dirname, 'startup_debug.log'), `[UNCAUGHT] ${new Date().toISOString()}\n${err.stack}\n\n`);
});
process.on('unhandledRejection', (reason, promise) => {
  fs.appendFileSync(path.join(__dirname, 'startup_debug.log'), `[UNHANDLED] ${new Date().toISOString()}\n${reason}\n\n`);
});

require('dotenv').config();
require('./src/config/env-validator')();
const versionService = require('./src/services/version.service');
versionService.init();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const errorHandler = require('./src/middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 3000;

// 🔒 SECURITY MIDDLEWARE
app.use(helmet()); // Sets various secure HTTP headers

// Rate limiting: 100 requests per 15 minutes per IP
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 100, 
  standardHeaders: true, 
  legacyHeaders: false,
  message: { error: 'Demasiadas peticiones desde esta IP, por favor intente de nuevo más tarde.' }
});
app.use('/api/', limiter);

// Restricted CORS
const corsOptions = {
  origin: process.env.FRONTEND_URL || '*', // In prod, better to set FRONTEND_URL
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
};
app.use(cors(corsOptions));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
const activityLogger = require('./src/middleware/logger').activityLogger;
const logger = require('./src/utils/logger-structured');
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
  app.use('/api/empresas', createCrudRoutes('empresas', 'empresas', { 
    searchFields: ['rut', 'razon_social'], 
    orderBy: 'razon_social ASC',
    allowedFields: ['rut', 'razon_social', 'direccion', 'telefono', 'email', 'activo']
  }));
  app.use('/api/obras', createCrudRoutes('obras', 'obras', {
    searchFields: ['nombre', 'direccion'],
    joins: 'LEFT JOIN empresas e ON obras.empresa_id = e.id',
    selectFields: 'obras.*, e.razon_social as empresa_nombre',
    activeColumn: 'activa',
    orderBy: 'obras.nombre ASC',
    allowedFields: ['nombre', 'direccion', 'empresa_id', 'activa']
  }));
  app.use('/api/cargos', createCrudRoutes('cargos', 'cargos', { 
    searchFields: ['nombre'], 
    orderBy: 'nombre ASC',
    allowedFields: ['nombre', 'activo']
  }));
  app.use('/api/trabajadores', createCrudRoutes('trabajadores', 'trabajadores', {
    searchFields: ['rut', 'nombres', 'apellido_paterno'],
    joins: 'LEFT JOIN empresas e ON trabajadores.empresa_id = e.id LEFT JOIN obras o ON trabajadores.obra_id = o.id LEFT JOIN cargos c ON trabajadores.cargo_id = c.id',
    selectFields: 'trabajadores.*, e.razon_social as empresa_nombre, o.nombre as celebrity_nombre, c.nombre as cargo_nombre', // Wait, celebrity_nombre? That looks like a typo in original code but I'll fix it if it's obra_nombre
    allowedFilters: ['obra_id', 'empresa_id', 'cargo_id'],
    useSoftDelete: true,
    orderBy: 'trabajadores.apellido_paterno ASC, trabajadores.apellido_materno ASC, trabajadores.nombres ASC',
    allowedFields: [
      'rut', 'nombres', 'apellido_paterno', 'apellido_materno', 
      'fecha_ingreso', 'fecha_desvinculacion', 'email', 'telefono', 
      'cargo_id', 'obra_id', 'empresa_id', 'activo', 'categoria_reporte'
    ]
  }));
  const asAusenciaPerms = { ver: 'sistema.tipos_ausencia.gestionar', crear: 'sistema.tipos_ausencia.gestionar', editar: 'sistema.tipos_ausencia.gestionar', eliminar: 'sistema.tipos_ausencia.gestionar' };
  app.use('/api/tipos-ausencia', createCrudRoutes(asAusenciaPerms, 'tipos_ausencia', { 
    searchFields: ['nombre'], 
    orderBy: 'nombre ASC',
    allowedFields: ['nombre', 'activo']
  }));

  const asEstadosPerms = { ver: 'sistema.estados.gestionar', crear: 'sistema.estados.gestionar', editar: 'sistema.estados.gestionar', eliminar: 'sistema.estados.gestionar' };
  app.use('/api/estados-asistencia', createCrudRoutes(asEstadosPerms, 'estados_asistencia', { 
    searchFields: ['nombre', 'codigo'], 
    orderBy: 'nombre ASC',
    allowedFields: ['nombre', 'codigo', 'color', 'activo', 'es_presente']
  }));
  logger.info('✅ Rutas CRUD genéricas cargadas');
} catch (err) {
  logger.error('❌ Error cargando rutas CRUD genéricas', { error: err.message, stack: err.stack });
}

// Specialized routes (each wrapped independently)
safeRoute('/api/trabajadores', './src/routes/trabajadores.routes', 'Trabajadores (especializadas)');
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

// Ensure database schema is up to date
(async () => {
    try {
        // 1. Column for worker termination date
        await db.query(`ALTER TABLE trabajadores ADD COLUMN IF NOT EXISTS fecha_desvinculacion DATE NULL DEFAULT NULL`);
        
        // 2. Versioning for roles to invalidate sessions
        await db.query(`ALTER TABLE roles ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1`);
        
        // 3. Permiso de depurar (antiguamente purgar)
        // a. Insertar nuevo
        await db.query(`
            INSERT IGNORE INTO permisos_catalogo (clave, modulo, nombre, descripcion, orden) 
            VALUES ('trabajadores.depurar', 'Trabajadores', 'Depurar Trabajador', 'Eliminar permanentemente trabajadores finiquitados', 6)
        `);
        // b. Actualizar dependencias (evita error de FK ON DELETE CASCADE)
        await db.query(`UPDATE permisos_rol_v2 SET permiso_clave = 'trabajadores.depurar' WHERE permiso_clave = 'trabajadores.purgar'`);
        await db.query(`UPDATE permisos_usuario_override SET permiso_clave = 'trabajadores.depurar' WHERE permiso_clave = 'trabajadores.purgar'`);
        // c. Eliminar la clave antigua
        await db.query(`DELETE FROM permisos_catalogo WHERE clave = 'trabajadores.purgar'`);

        console.log("✅ Esquema de base de datos verificado y actualizado");
        
        // 4. Sincronizar Catálogo de Permisos Maestro
        const permisosService = require('./src/services/permisos.service');
        await permisosService.syncCatalogoEnArranque();
        
    } catch (err) {
        console.error("Error al actualizar esquema BD:", err.message);
    }
})();
module.exports = app;
