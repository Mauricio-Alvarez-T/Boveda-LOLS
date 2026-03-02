const fs = require('fs');
const path = require('path');
process.on('uncaughtException', (err) => {
  fs.appendFileSync(path.join(__dirname, 'startup_debug.log'), `[UNCAUGHT] ${new Date().toISOString()}\n${err.stack}\n\n`);
});
process.on('unhandledRejection', (reason, promise) => {
  fs.appendFileSync(path.join(__dirname, 'startup_debug.log'), `[UNHANDLED] ${new Date().toISOString()}\n${reason}\n\n`);
});

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const errorHandler = require('./src/middleware/errorHandler');
const activityLogger = require('./src/middleware/logger').activityLogger;
const dashboardService = require('./src/services/dashboard.service');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(activityLogger);

// Database connection (auto-tests on import)
require('./src/config/db');

// ============================================
// ROUTES
// ============================================

// Auth
app.use('/api/auth', require('./src/routes/auth.routes'));

// Empresas (CRUD genérico)
const createCrudRoutes = require('./src/routes/crud.routes');
app.use('/api/empresas', createCrudRoutes('empresas', 'empresas', { searchFields: ['rut', 'razon_social'] }));

app.use('/api/obras', createCrudRoutes('obras', 'obras', {
  searchFields: ['nombre', 'direccion'],
  joins: 'LEFT JOIN empresas e ON obras.empresa_id = e.id',
  selectFields: 'obras.*, e.razon_social as empresa_nombre',
  activeColumn: 'activa'
}));

app.use('/api/cargos', createCrudRoutes('cargos', 'cargos', { searchFields: ['nombre'] }));

app.use('/api/trabajadores', createCrudRoutes('trabajadores', 'trabajadores', {
  searchFields: ['rut', 'nombres', 'apellido_paterno'],
  joins: 'LEFT JOIN empresas e ON trabajadores.empresa_id = e.id LEFT JOIN obras o ON trabajadores.obra_id = o.id LEFT JOIN cargos c ON trabajadores.cargo_id = c.id',
  selectFields: 'trabajadores.*, e.razon_social as empresa_nombre, o.nombre as obra_nombre, c.nombre as cargo_nombre',
  allowedFilters: ['obra_id', 'empresa_id', 'cargo_id']
}));

// Documentos (rutas especializadas)
app.use('/api/documentos', require('./src/routes/documentos.routes'));

// Asistencia
app.use('/api/asistencias', require('./src/routes/asistencias.routes'));

// Fiscalización
app.use('/api/fiscalizacion', require('./src/routes/fiscalizacion.routes'));

// Email Config & Templates (per-user) - Register before standard usuarios CRUD to avoid /:id collision
app.use('/api/usuarios', require('./src/routes/email-config.routes'));

// Usuarios + Roles + Permisos
app.use('/api/usuarios', require('./src/routes/usuarios.routes'));

app.use('/api/tipos-ausencia', createCrudRoutes('asistencia', 'tipos_ausencia', { searchFields: ['nombre'] }));

app.use('/api/estados-asistencia', createCrudRoutes('asistencia', 'estados_asistencia', { searchFields: ['nombre', 'codigo'] }));

// Configuración de Horarios
app.use('/api/config-horarios', require('./src/routes/config-horarios.routes'));
app.use('/api/logs', require('./src/routes/logs.routes'));

// ============================================
// Health Check & Dashboard
// ============================================

// Dashboard KPIs
app.get('/api/dashboard/summary', require('./src/middleware/auth'), async (req, res, next) => {
  try {
    const db = require('./src/config/db');
    // Fetch permisos & nombre for the authenticated user (JWT only has id/rol_id)
    const [permisos] = await db.query(
      'SELECT modulo, puede_ver, puede_crear, puede_editar, puede_eliminar FROM permisos_rol WHERE rol_id = ?',
      [req.user.rol_id]
    );
    const [users] = await db.query('SELECT nombre FROM usuarios WHERE id = ?', [req.user.id]);
    const nombre = users.length > 0 ? users[0].nombre.split(' ')[0] : '';

    const summary = await dashboardService.getSummary(req.query.obra_id, permisos, nombre);
    res.json({ data: summary });
  } catch (err) { next(err); }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

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
app.listen(PORT, () => {
  console.log(`🚀 SGDL API corriendo en http://localhost:${PORT}`);
  console.log(`📡 Health check: http://localhost:${PORT}/api/health`);
});

module.exports = app;
