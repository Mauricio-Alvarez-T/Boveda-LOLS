require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
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

// Error Handler (must be last)
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  console.log(`🚀 SGDL API corriendo en http://localhost:${PORT}`);
  console.log(`📡 Health check: http://localhost:${PORT}/api/health`);
});

module.exports = app;
