-- ─────────────────────────────────────────────────────────────────────────
-- Migración 044 — Permisos de visibilidad por pestaña del módulo Inventario.
--
-- Agrega 6 permisos al catálogo (uno por tab del módulo Inventario) y los
-- asigna automáticamente al rol Super Administrador (rol_id=1) para
-- mantener consistencia visible en la tabla `permisos_rol_v2`.
--
-- Política deny-by-default: los demás roles parten sin estos permisos y el
-- administrador los asigna manualmente vía PermisosRolPanel.
--
-- Idempotente: usa INSERT IGNORE — re-ejecutar la migración no duplica filas.
-- ─────────────────────────────────────────────────────────────────────────

-- 1) Catálogo de permisos. `syncCatalogoEnArranque()` ya hace esto en boot
--    pero lo dejamos explícito para que la migración deje rastro en SQL.
INSERT IGNORE INTO permisos_catalogo (clave, modulo, nombre, descripcion, orden) VALUES
    ('inventario.tab.resumen_ejecutivo','Inventario','Ver Tab Resumen Ejecutivo','Inventario → Pestaña "Resumen Ejecutivo": si está denegado, la pestaña no aparece en el menú superior del módulo.', 6),
    ('inventario.tab.resumen',          'Inventario','Ver Tab Resumen',          'Inventario → Pestaña "Resumen": si está denegado, la pestaña no aparece en el menú superior del módulo.', 7),
    ('inventario.tab.por_ubicacion',    'Inventario','Ver Tab Por Obra/Bodega',  'Inventario → Pestaña "Por Obra/Bodega": si está denegado, la pestaña no aparece en el menú superior del módulo.', 8),
    ('inventario.tab.transferencias',   'Inventario','Ver Tab Transferencias',   'Inventario → Pestaña "Transferencias": si está denegado, la pestaña no aparece en el menú superior del módulo.', 9),
    ('inventario.tab.maestro',          'Inventario','Ver Tab Maestro',          'Inventario → Pestaña "Maestro" (edición de items y stock): si está denegado, la pestaña no aparece. Requiere también "Editar Inventario" para usar las acciones internas.', 10),
    ('inventario.tab.bombas',           'Inventario','Ver Tab Bombas Hormigón',  'Inventario → Pestaña "Bombas Hormigón": si está denegado, la pestaña no aparece en el menú superior del módulo.', 11);

-- 2) Asignar los 6 permisos al Super Administrador (rol_id=1). Es redundante
--    porque la lógica de god mode ya devuelve todos los permisos, pero lo
--    asignamos para que el panel de gestión muestre los checkboxes activados.
INSERT IGNORE INTO permisos_rol_v2 (rol_id, permiso_clave) VALUES
    (1, 'inventario.tab.resumen_ejecutivo'),
    (1, 'inventario.tab.resumen'),
    (1, 'inventario.tab.por_ubicacion'),
    (1, 'inventario.tab.transferencias'),
    (1, 'inventario.tab.maestro'),
    (1, 'inventario.tab.bombas');

-- 3) Bump version del rol Super Admin → fuerza re-login para que el JWT
--    incluya los permisos nuevos.
UPDATE roles SET version = version + 1 WHERE id = 1;
