-- =============================================
-- Migración 043: Permisos Financieros + asignación a Super Admin
-- =============================================
-- Agrega 10 permisos en módulo "Financiero" al catálogo y los concede al
-- rol Super Admin (id=1). Política deny-by-default: los demás roles NO
-- reciben estos permisos automáticamente — admin debe asignarlos
-- manualmente vía PermisosRolPanel o PermisosUsuarioPanel (Overrides).
--
-- Por qué duplicar la inserción al catálogo si `syncCatalogoEnArranque()`
-- ya lo hace al bootear el backend? Porque `migrate` puede correrse
-- ANTES del primer boot (típico flujo cPanel: deploy → migrate → restart).
-- Para que el INSERT en permisos_rol_v2 no falle por FK, garantizamos
-- que las claves existan en permisos_catalogo dentro de esta migración.
--
-- Idempotente: `INSERT IGNORE` (PRIMARY KEY + UNIQUE garantizan no-dup).
-- =============================================

-- ─────────────────────────────────────────────
-- 1. Catálogo: las 10 claves financieras
-- ─────────────────────────────────────────────
INSERT IGNORE INTO permisos_catalogo (clave, modulo, nombre, descripcion, orden) VALUES
    ('inventario.costos.ver',            'Financiero', 'Ver Costos de Inventario',         'Ver valor_compra y valor_arriendo de items y ubicaciones', 1),
    ('inventario.costos.editar',         'Financiero', 'Editar Costos de Inventario',      'Modificar valor_compra y valor_arriendo (requiere ver)', 2),
    ('inventario.facturas.ver',          'Financiero', 'Ver Facturas',                     'Acceder a la pestaña Facturas con montos y precios unitarios', 3),
    ('inventario.facturas.gestionar',    'Financiero', 'Gestionar Facturas',               'Crear, editar o anular facturas con precios', 4),
    ('inventario.bombas.ver_costos',     'Financiero', 'Ver Costos Bombas Hormigón',       'Ver el costo de registros de bombas de hormigón', 5),
    ('inventario.descuentos.gestionar',  'Financiero', 'Gestionar Descuentos Obra',        'Configurar porcentajes de descuento por obra', 6),
    ('inventario.resumen.ver_valores',   'Financiero', 'Ver Valores en Resumen Ejecutivo', 'Ver valor_bruto, valor_neto y subtotales monetarios en el Resumen Ejecutivo', 7),
    ('asistencia.horas_extra.ver',       'Financiero', 'Ver Horas Extra',                  'Ver columnas de horas extra y sábado en asistencia (insumo de pago)', 8),
    ('trabajadores.financiero.ver',      'Financiero', 'Ver Datos Financieros Trabajador', 'Ver sueldo base, anticipos y descuentos del trabajador (campos futuros)', 9),
    ('trabajadores.financiero.editar',   'Financiero', 'Editar Datos Financieros Trabajador','Editar sueldo base, anticipos y descuentos del trabajador (campos futuros)', 10);

-- ─────────────────────────────────────────────
-- 2. Conceder los 10 permisos al Super Admin (rol_id = 1)
--
-- Nota: la lógica de Super Admin en permisos.service.js ya devuelve
-- TODOS los permisos del catálogo automáticamente (línea 11). Esta
-- asignación explícita mantiene consistencia visible en la tabla por
-- si alguien debuggea o exporta los datos.
-- ─────────────────────────────────────────────
INSERT IGNORE INTO permisos_rol_v2 (rol_id, permiso_clave) VALUES
    (1, 'inventario.costos.ver'),
    (1, 'inventario.costos.editar'),
    (1, 'inventario.facturas.ver'),
    (1, 'inventario.facturas.gestionar'),
    (1, 'inventario.bombas.ver_costos'),
    (1, 'inventario.descuentos.gestionar'),
    (1, 'inventario.resumen.ver_valores'),
    (1, 'asistencia.horas_extra.ver'),
    (1, 'trabajadores.financiero.ver'),
    (1, 'trabajadores.financiero.editar');

-- ─────────────────────────────────────────────
-- 3. Invalidar sesiones del Super Admin para forzar re-login con los
--    permisos nuevos. Bump de version en la tabla roles (patrón usado
--    también por POST /usuarios/user-overrides/:id).
-- ─────────────────────────────────────────────
UPDATE roles SET version = version + 1 WHERE id = 1;
