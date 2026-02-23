require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const errorHandler = require('./src/middleware/errorHandler');
const dashboardService = require('./src/services/dashboard.service');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Database connection (auto-tests on import)
require('./src/config/db');

// ============================================
// ROUTES
// ============================================

// Auth
app.use('/api/auth', require('./src/routes/auth.routes'));

// Empresas (CRUD genérico)
const createCrudRoutes = require('./src/routes/crud.routes');

app.use('/api/empresas', (() => {
  const router = require('express').Router();
  const auth = require('./src/middleware/auth');
  const { checkPermission } = require('./src/middleware/rbac');
  const createCrudService = require('./src/services/crud.service');
  const createCrudController = require('./src/controllers/crud.controller');

  const service = createCrudService('empresas', { searchFields: ['rut', 'razon_social'] });
  const ctrl = createCrudController(service);

  router.get('/', auth, checkPermission('empresas', 'puede_ver'), ctrl.getAll);
  router.get('/:id', auth, checkPermission('empresas', 'puede_ver'), ctrl.getById);
  router.post('/', auth, checkPermission('empresas', 'puede_crear'), ctrl.create);
  router.put('/:id', auth, checkPermission('empresas', 'puede_editar'), ctrl.update);
  router.delete('/:id', auth, checkPermission('empresas', 'puede_eliminar'), ctrl.remove);
  return router;
})());

app.use('/api/obras', (() => {
  const router = require('express').Router();
  const auth = require('./src/middleware/auth');
  const { checkPermission } = require('./src/middleware/rbac');
  const createCrudService = require('./src/services/crud.service');
  const createCrudController = require('./src/controllers/crud.controller');

  const service = createCrudService('obras', {
    searchFields: ['nombre', 'direccion'],
    joins: 'LEFT JOIN empresas e ON obras.empresa_id = e.id',
    selectFields: 'obras.*, e.razon_social as empresa_nombre',
    activeColumn: 'activa'
  });
  const ctrl = createCrudController(service);

  router.get('/', auth, checkPermission('obras', 'puede_ver'), ctrl.getAll);
  router.get('/:id', auth, checkPermission('obras', 'puede_ver'), ctrl.getById);
  router.post('/', auth, checkPermission('obras', 'puede_crear'), ctrl.create);
  router.put('/:id', auth, checkPermission('obras', 'puede_editar'), ctrl.update);
  router.delete('/:id', auth, checkPermission('obras', 'puede_eliminar'), ctrl.remove);
  return router;
})());

app.use('/api/cargos', (() => {
  const router = require('express').Router();
  const auth = require('./src/middleware/auth');
  const { checkPermission } = require('./src/middleware/rbac');
  const createCrudService = require('./src/services/crud.service');
  const createCrudController = require('./src/controllers/crud.controller');

  const service = createCrudService('cargos', { searchFields: ['nombre'] });
  const ctrl = createCrudController(service);

  router.get('/', auth, checkPermission('cargos', 'puede_ver'), ctrl.getAll);
  router.get('/:id', auth, checkPermission('cargos', 'puede_ver'), ctrl.getById);
  router.post('/', auth, checkPermission('cargos', 'puede_crear'), ctrl.create);
  router.put('/:id', auth, checkPermission('cargos', 'puede_editar'), ctrl.update);
  router.delete('/:id', auth, checkPermission('cargos', 'puede_eliminar'), ctrl.remove);
  return router;
})());

// Trabajadores
app.use('/api/trabajadores', (() => {
  const router = require('express').Router();
  const auth = require('./src/middleware/auth');
  const { checkPermission } = require('./src/middleware/rbac');
  const createCrudService = require('./src/services/crud.service');
  const createCrudController = require('./src/controllers/crud.controller');

  const service = createCrudService('trabajadores', {
    searchFields: ['rut', 'nombres', 'apellido_paterno'],
    joins: 'LEFT JOIN empresas e ON trabajadores.empresa_id = e.id LEFT JOIN obras o ON trabajadores.obra_id = o.id LEFT JOIN cargos c ON trabajadores.cargo_id = c.id',
    selectFields: 'trabajadores.*, e.razon_social as empresa_nombre, o.nombre as obra_nombre, c.nombre as cargo_nombre',
    allowedFilters: ['obra_id', 'empresa_id', 'cargo_id']
  });
  const ctrl = createCrudController(service);

  router.get('/', auth, checkPermission('trabajadores', 'puede_ver'), ctrl.getAll);
  router.get('/:id', auth, checkPermission('trabajadores', 'puede_ver'), ctrl.getById);
  router.post('/', auth, checkPermission('trabajadores', 'puede_crear'), ctrl.create);
  router.put('/:id', auth, checkPermission('trabajadores', 'puede_editar'), ctrl.update);
  router.delete('/:id', auth, checkPermission('trabajadores', 'puede_eliminar'), ctrl.remove);
  return router;
})());

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

// Tipos Ausencia
app.use('/api/tipos-ausencia', (() => {
  const router = require('express').Router();
  const auth = require('./src/middleware/auth');
  const { checkPermission } = require('./src/middleware/rbac');
  const createCrudService = require('./src/services/crud.service');
  const createCrudController = require('./src/controllers/crud.controller');

  const service = createCrudService('tipos_ausencia', { searchFields: ['nombre'] });
  const ctrl = createCrudController(service);

  router.get('/', auth, checkPermission('asistencia', 'puede_ver'), ctrl.getAll);
  router.post('/', auth, checkPermission('asistencia', 'puede_crear'), ctrl.create);
  router.put('/:id', auth, checkPermission('asistencia', 'puede_editar'), ctrl.update);
  router.delete('/:id', auth, checkPermission('asistencia', 'puede_eliminar'), ctrl.remove);
  return router;
})());

// Estados Asistencia (CRUD dinámico)
app.use('/api/estados-asistencia', (() => {
  const router = require('express').Router();
  const auth = require('./src/middleware/auth');
  const { checkPermission } = require('./src/middleware/rbac');
  const createCrudService = require('./src/services/crud.service');
  const createCrudController = require('./src/controllers/crud.controller');

  const service = createCrudService('estados_asistencia', { searchFields: ['nombre', 'codigo'] });
  const ctrl = createCrudController(service);

  router.get('/', auth, checkPermission('asistencia', 'puede_ver'), ctrl.getAll);
  router.post('/', auth, checkPermission('asistencia', 'puede_crear'), ctrl.create);
  router.put('/:id', auth, checkPermission('asistencia', 'puede_editar'), ctrl.update);
  router.delete('/:id', auth, checkPermission('asistencia', 'puede_eliminar'), ctrl.remove);
  return router;
})());

// Configuración de Horarios
app.use('/api/config-horarios', require('./src/routes/config-horarios.routes'));

// ============================================
// Health Check & Dashboard
// ============================================

// Dashboard KPIs
app.get('/api/dashboard/summary', require('./src/middleware/auth'), async (req, res, next) => {
  try {
    const summary = await dashboardService.getSummary(req.query.obra_id);
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
