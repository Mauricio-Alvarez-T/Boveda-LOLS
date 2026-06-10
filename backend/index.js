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

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { applyTrustProxy, generalLimiter, loginLimiter } = require('./src/middleware/rateLimiter');
const errorHandler = require('./src/middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 3000;

// Confiar en el reverse proxy (Apache/Passenger) para que req.ip sea la IP real
// del cliente. DEBE ir antes de cualquier middleware que use la IP. Tunable por
// env TRUST_PROXY (default 1 = un hop). Ver src/middleware/rateLimiter.js.
applyTrustProxy(app);

// 🔒 SECURITY MIDDLEWARE
app.use(helmet()); // Sets various secure HTTP headers

// Restricted CORS — antes del rate limiter para que incluso un 429 lleve headers CORS
const corsOptions = {
  origin: process.env.FRONTEND_URL || '*', // In prod, better to set FRONTEND_URL
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
};
app.use(cors(corsOptions));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Serve inventory item images (under /api so cPanel proxy forwards them to Express).
// Va ANTES del rate limiter: las imágenes servidas no llegan al limiter (no consumen cupo).
app.use('/api/uploads/inventario', express.static(path.join(__dirname, 'uploads/inventario')));

// Rate limiting general (por usuario autenticado; cae a IP). Montado DESPUÉS del
// static para que las miniaturas de inventario no cuenten contra el cupo.
app.use('/api/', generalLimiter);
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
// Limiter estricto SOLO para el login (anti fuerza bruta, por IP). Va antes del
// router de auth para no afectar /me ni /me/password.
app.use('/api/auth/login', loginLimiter);
app.use('/api/auth', require('./src/routes/auth.routes'));

// CRUD routes (safe loading)
const createCrudRoutes = require('./src/routes/crud.routes');

try {
  app.use('/api/empresas', createCrudRoutes('empresas', 'empresas', {
    searchFields: ['rut', 'razon_social'],
    useSoftDelete: true,
    orderBy: 'razon_social ASC',
    allowedFields: ['rut', 'razon_social', 'direccion', 'telefono', 'email', 'activo']
  }));
  // ── Obras: opciones extraídas para reusar el service en el PUT con cascada ──
  const createCrudService = require('./src/services/crud.service');
  const authMw = require('./src/middleware/auth');
  const { checkPermission } = require('./src/middleware/rbac');

  const obrasOptions = {
    searchFields: ['nombre', 'direccion'],
    joins: 'LEFT JOIN empresas e ON obras.empresa_id = e.id',
    selectFields: 'obras.*, e.razon_social as empresa_nombre',
    activeColumn: 'activa',
    useSoftDelete: true,
    orderBy: 'obras.nombre ASC',
    allowedFilters: ['participa_inventario', 'participa_asistencia', 'participa_transferencias', 'participa_bombas', 'es_prueba', 'finalizada'],
    // 'finalizada' NO va en allowedFields: finalizar/reactivar es exclusivo de
    // los endpoints /finalizar y /reactivar (permiso obras.finalizar + validación).
    // Dejarlo aquí permitía finalizar vía el PUT genérico con solo obras.editar.
    allowedFields: ['nombre', 'direccion', 'empresa_id', 'activa', 'participa_inventario', 'participa_asistencia', 'participa_transferencias', 'participa_bombas', 'encargado_nombre', 'es_prueba', 'fecha_inicio', 'fecha_termino'],
    testFlagColumn: 'es_prueba',
    // Aislamiento de obras finalizadas: GET /obras las excluye por defecto;
    // ?incluir_finalizadas=true las incluye; ?finalizada=1 sólo finalizadas.
    hiddenFlagColumn: 'finalizada',
    hiddenFlagParam: 'incluir_finalizadas'
  };

  // Custom PUT /obras/:id: aplica cascada es_prueba a los trabajadores de la obra.
  // Se monta ANTES del router CRUD genérico para interceptar SOLO el update;
  // GET/POST/DELETE caen al router genérico de abajo.
  const obrasService = createCrudService('obras', obrasOptions);
  const obrasCascadeRouter = express.Router();
  obrasCascadeRouter.put('/:id', authMw, checkPermission('obras.editar'), async (req, res, next) => {
    try {
      const { id } = req.params;
      const updated = await obrasService.update(id, req.body);
      // Cascada solo si el body trae es_prueba (no toca el resto de updates).
      if (req.body.es_prueba !== undefined) {
        const flag = (req.body.es_prueba === true || req.body.es_prueba === 1 || req.body.es_prueba === '1') ? 1 : 0;
        await db.query('UPDATE trabajadores SET es_prueba = ? WHERE obra_id = ?', [flag, id]);
      }
      res.json(updated);
    } catch (err) { next(err); }
  });

  // GET /api/obras/finalizadas — tarjetas con stats históricos para la sección
  // "Obras Finalizadas". Va en este router (montado ANTES del CRUD genérico)
  // para no colisionar con GET /:id. Conteo y fechas DERIVADOS de asistencias
  // (un trabajador solo guarda su obra actual; tras finalizar suele estar en otra).
  obrasCascadeRouter.get('/finalizadas', authMw, checkPermission('obras.ver'), async (req, res, next) => {
    try {
      const [obras] = await db.query(`
        SELECT o.id, o.nombre, e.razon_social AS empresa_nombre,
               COALESCE(o.fecha_inicio,  MIN(a.fecha)) AS fecha_inicio,
               COALESCE(o.fecha_termino, MAX(a.fecha)) AS fecha_termino,
               GREATEST(DATEDIFF(COALESCE(o.fecha_termino, MAX(a.fecha)),
                        COALESCE(o.fecha_inicio,  MIN(a.fecha))), 0) AS dias_duracion,
               COUNT(DISTINCT t.id) AS total_trabajadores
        FROM obras o
        LEFT JOIN empresas e ON e.id = o.empresa_id
        LEFT JOIN asistencias a ON a.obra_id = o.id
        LEFT JOIN trabajadores t ON t.id = a.trabajador_id AND t.es_prueba = 0
        WHERE o.finalizada = 1 AND o.es_prueba = 0
        GROUP BY o.id, o.nombre, e.razon_social, o.fecha_inicio, o.fecha_termino
        ORDER BY fecha_termino DESC, o.nombre ASC
      `);

      const byObra = {};
      if (obras.length > 0) {
        const ids = obras.map(o => o.id);
        const [rows] = await db.query(`
          SELECT a.obra_id, COALESCE(c.nombre, 'Sin cargo') AS cargo,
                 COUNT(DISTINCT a.trabajador_id) AS cantidad
          FROM asistencias a
          JOIN trabajadores t ON t.id = a.trabajador_id
          LEFT JOIN cargos c ON c.id = t.cargo_id
          WHERE a.obra_id IN (?) AND t.es_prueba = 0
          GROUP BY a.obra_id, c.id, c.nombre
          ORDER BY cantidad DESC
        `, [ids]);
        rows.forEach(r => {
          (byObra[r.obra_id] = byObra[r.obra_id] || []).push({ cargo: r.cargo, cantidad: Number(r.cantidad) || 0 });
        });
      }

      const data = obras.map(o => ({
        id: o.id,
        nombre: o.nombre,
        empresa_nombre: o.empresa_nombre,
        fecha_inicio: o.fecha_inicio,
        fecha_termino: o.fecha_termino,
        dias_duracion: o.dias_duracion != null ? Number(o.dias_duracion) : null,
        total_trabajadores: Number(o.total_trabajadores) || 0,
        por_cargo: byObra[o.id] || [],
      }));
      res.json({ data });
    } catch (err) { next(err); }
  });

  // PUT /api/obras/:id/finalizar — marca la obra como concluida. NO cascadea a
  // trabajadores (siguen reales / probablemente ya trasladados).
  obrasCascadeRouter.put('/:id/finalizar', authMw, checkPermission('obras.finalizar'), async (req, res, next) => {
    try {
      const { id } = req.params;
      const { fecha_termino, fecha_inicio } = req.body || {};
      const dateRe = /^\d{4}-\d{2}-\d{2}$/;
      if (!fecha_termino || !dateRe.test(String(fecha_termino))) {
        return res.status(400).json({ error: 'fecha_termino es requerida (formato YYYY-MM-DD)' });
      }
      if (fecha_inicio && !dateRe.test(String(fecha_inicio))) {
        return res.status(400).json({ error: 'fecha_inicio inválida (formato YYYY-MM-DD)' });
      }
      if (fecha_inicio && String(fecha_termino) < String(fecha_inicio)) {
        return res.status(400).json({ error: 'fecha_termino no puede ser anterior a fecha_inicio' });
      }
      const sets = ['finalizada = 1', 'fecha_termino = ?'];
      const params = [fecha_termino];
      if (fecha_inicio) { sets.push('fecha_inicio = ?'); params.push(fecha_inicio); }
      params.push(id);
      const [r] = await db.query(`UPDATE obras SET ${sets.join(', ')} WHERE id = ?`, params);
      if (r.affectedRows === 0) return res.status(404).json({ error: 'Obra no encontrada' });
      res.json({ id: Number(id), finalizada: true, fecha_termino, fecha_inicio: fecha_inicio || undefined });
    } catch (err) { next(err); }
  });

  // PUT /api/obras/:id/reactivar — revierte la finalización (conserva fecha_termino).
  obrasCascadeRouter.put('/:id/reactivar', authMw, checkPermission('obras.finalizar'), async (req, res, next) => {
    try {
      const { id } = req.params;
      const [r] = await db.query('UPDATE obras SET finalizada = 0 WHERE id = ?', [id]);
      if (r.affectedRows === 0) return res.status(404).json({ error: 'Obra no encontrada' });
      res.json({ id: Number(id), finalizada: false });
    } catch (err) { next(err); }
  });

  app.use('/api/obras', obrasCascadeRouter);
  app.use('/api/obras', createCrudRoutes('obras', 'obras', obrasOptions));

  app.use('/api/cargos', createCrudRoutes('cargos', 'cargos', {
    searchFields: ['nombre'],
    useSoftDelete: true,
    orderBy: 'nombre ASC',
    allowedFields: ['nombre', 'activo']
  }));
  app.use('/api/trabajadores', createCrudRoutes('trabajadores', 'trabajadores', {
    searchFields: ['rut', 'nombres', 'apellido_paterno'],
    joins: 'LEFT JOIN empresas e ON trabajadores.empresa_id = e.id LEFT JOIN obras o ON trabajadores.obra_id = o.id LEFT JOIN cargos c ON trabajadores.cargo_id = c.id',
    selectFields: 'trabajadores.*, e.razon_social as empresa_nombre, o.nombre as obra_nombre, c.nombre as cargo_nombre',
    allowedFilters: ['obra_id', 'empresa_id', 'cargo_id', 'es_prueba'],
    useSoftDelete: true,
    orderBy: 'trabajadores.apellido_paterno ASC, trabajadores.apellido_materno ASC, trabajadores.nombres ASC',
    allowedFields: [
      'rut', 'nombres', 'apellido_paterno', 'apellido_materno',
      'fecha_ingreso', 'fecha_desvinculacion', 'email', 'telefono',
      'cargo_id', 'obra_id', 'empresa_id', 'activo', 'categoria_reporte', 'es_prueba',
      'licencia_conducir', 'licencia_vencimiento'
    ],
    testFlagColumn: 'es_prueba',
    // Herencia: un trabajador nuevo asignado a una obra de prueba hereda el flag
    // (salvo que el body ya traiga es_prueba explícito).
    beforeCreate: async (safeData, dbConn) => {
      if (safeData.es_prueba === undefined && safeData.obra_id) {
        const [rows] = await dbConn.query('SELECT es_prueba FROM obras WHERE id = ?', [safeData.obra_id]);
        if (rows.length && (rows[0].es_prueba === 1 || rows[0].es_prueba === true)) {
          safeData.es_prueba = 1;
        }
      }
    }
  }));
  const asAusenciaPerms = { ver: 'sistema.tipos_ausencia.gestionar', crear: 'sistema.tipos_ausencia.gestionar', editar: 'sistema.tipos_ausencia.gestionar', eliminar: 'sistema.tipos_ausencia.gestionar' };
  app.use('/api/tipos-ausencia', createCrudRoutes(asAusenciaPerms, 'tipos_ausencia', {
    searchFields: ['nombre'],
    useSoftDelete: true,
    orderBy: 'nombre ASC',
    allowedFields: ['nombre', 'activo']
  }));

  const asEstadosPerms = { ver: 'sistema.estados.gestionar', crear: 'sistema.estados.gestionar', editar: 'sistema.estados.gestionar', eliminar: 'sistema.estados.gestionar' };
  app.use('/api/estados-asistencia', createCrudRoutes(asEstadosPerms, 'estados_asistencia', {
    searchFields: ['nombre', 'codigo'],
    useSoftDelete: true,
    orderBy: 'nombre ASC',
    allowedFields: ['nombre', 'codigo', 'color', 'activo', 'es_presente', 'cuenta_dia_trabajado']
  }));
  // ── Inventario CRUD ──
  const invPerms = { ver: 'inventario.ver', crear: 'inventario.crear', editar: 'inventario.editar', eliminar: 'inventario.eliminar' };
  app.use('/api/categorias-inventario', createCrudRoutes(invPerms, 'categorias_inventario', {
    searchFields: ['nombre'],
    useSoftDelete: true,
    orderBy: 'orden ASC',
    allowedFields: ['nombre', 'orden', 'activo']
  }));
  app.use('/api/bodegas', createCrudRoutes(invPerms, 'bodegas', {
    // responsable_nombre ahora es columna real (mig 060), texto libre editable
    // desde el form. Sin JOIN para evitar colisión de alias con la columna real.
    searchFields: ['nombre', 'direccion', 'responsable_nombre'],
    activeColumn: 'activa',
    useSoftDelete: true,
    orderBy: 'bodegas.nombre ASC',
    allowedFilters: ['participa_inventario', 'participa_transferencias'],
    allowedFields: ['nombre', 'direccion', 'responsable_nombre', 'responsable_id', 'activa', 'participa_inventario', 'participa_transferencias']
  }));
  // Middleware sanitiza valor_compra/valor_arriendo si el usuario no tiene
  // `inventario.costos.ver`. Aplica antes de la ruta CRUD genérica porque
  // ésta llama res.json() directamente desde el controller (no podemos pasar
  // un sanitizer al CRUD genérico sin invasivo refactor).
  const { sanitizeItemsMaestroMiddleware } = require('./src/utils/sanitizeFinancialFields');
  app.use('/api/items-inventario', sanitizeItemsMaestroMiddleware, createCrudRoutes(invPerms, 'items_inventario', {
    searchFields: ['descripcion'],
    joins: 'LEFT JOIN categorias_inventario c ON items_inventario.categoria_id = c.id',
    selectFields: 'items_inventario.*, c.nombre as categoria_nombre',
    allowedFilters: ['categoria_id'],
    useSoftDelete: true,
    orderBy: 'items_inventario.nro_item ASC',
    allowedFields: ['categoria_id', 'descripcion', 'm2', 'valor_compra', 'valor_arriendo', 'unidad', 'imagen_url', 'es_consumible', 'propietario', 'activo'],
    // nro_item es solo referencia visual — autogenerado secuencial por categoria
    beforeCreate: async (safeData, db) => {
      const [rows] = await db.query(
        'SELECT COALESCE(MAX(nro_item), 0) + 1 AS next_nro FROM items_inventario WHERE categoria_id = ?',
        [safeData.categoria_id]
      );
      safeData.nro_item = rows[0].next_nro;
    }
  }));

  logger.info('✅ Rutas CRUD genéricas cargadas');
} catch (err) {
  logger.error('❌ Error cargando rutas CRUD genéricas', { error: err.message, stack: err.stack });
}

// Specialized routes (each wrapped independently)
safeRoute('/api/inventario', './src/routes/inventario.routes', 'Inventario');
safeRoute('/api/transferencias', './src/routes/transferencias.routes', 'Transferencias');
safeRoute('/api/facturas-inventario', './src/routes/facturas-inventario.routes', 'Facturas Inventario');
safeRoute('/api/discrepancias', './src/routes/discrepancias.routes', 'Discrepancias');
safeRoute('/api/bombas-hormigon', './src/routes/bombas-hormigon.routes', 'Bombas Hormigón');
safeRoute('/api/trabajadores', './src/routes/trabajadores.routes', 'Trabajadores (especializadas)');
safeRoute('/api/documentos', './src/routes/documentos.routes', 'Documentos');
safeRoute('/api/asistencias', './src/routes/asistencias.routes', 'Asistencias');
safeRoute('/api/sabados-extra', './src/routes/sabados-extra.routes', 'Sábados Extra');
safeRoute('/api/fiscalizacion', './src/routes/fiscalizacion.routes', 'Fiscalización');
safeRoute('/api/usuarios/me/email-config', './src/routes/email-config.routes', 'Email Config');
safeRoute('/api/usuarios/me/plantillas', './src/routes/plantillas.routes', 'Plantillas Email');
safeRoute('/api/usuarios', './src/routes/usuarios.routes', 'Usuarios');
safeRoute('/api/feriados', './src/routes/feriados.routes', 'Feriados');
safeRoute('/api/config-horarios', './src/routes/config-horarios.routes', 'Config Horarios');
safeRoute('/api/logs', './src/routes/logs.routes', 'Logs');
safeRoute('/api/reportes', './src/routes/reportes.routes', 'Reportes Suscriptores');
safeRoute('/api/vehiculos', './src/routes/vehiculos.routes', 'Vehículos');

// ============================================
// Health Check & Dashboard
// ============================================

// Dashboard KPIs
const dashboardService = require('./src/services/dashboard.service');
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
// Importante: init() de versionService debe completar antes de aceptar requests.
// Si llega un request antes, el Map de versiones está vacío, versionService.get()
// devuelve el fallback de 1 y cualquier token de rol con version>1 en DB es
// rechazado con 401 expired_by_version — causa raíz de los logouts espurios.
if (process.env.NODE_ENV !== 'test') {
  versionService.init()
    .then(() => {
      app.listen(PORT, () => {
        console.log(`🚀 SGDL API corriendo en http://localhost:${PORT}`);
        console.log(`📡 Health check: http://localhost:${PORT}/api/health`);
      });
    })
    .catch(err => {
      console.error('[startup] versionService.init falló — no se levantará el servidor:', err);
      process.exit(1);
    });
}

module.exports = app;
