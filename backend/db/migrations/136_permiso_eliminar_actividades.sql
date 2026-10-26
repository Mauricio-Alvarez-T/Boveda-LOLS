-- =============================================
-- 136 — Permiso: eliminar definitivamente una lista de actividades sugeridas
-- =============================================
-- Pedido de jefatura (2026-10-26): poder borrar POR COMPLETO una lista (cualquier
-- estado, también una «Realizada» con asistencia registrada) cuando se armó por
-- error. Distinto de «Cancelar lista» (soft delete, queda en el historial): borrar
-- quita la cabecera y sus trabajadores, y la lista deja de contar en el informe.
--
-- Permiso propio (no reusa `...cancelar`, que tiene terreno) y solo para el Super
-- Administrador por defecto; se le puede dar a otro rol desde Configuración.
-- Catálogo primero y luego el rol (FK permisos_rol_v2.permiso_clave → permisos_catalogo.clave).
-- Sin `roles.version`: quien lo reciba vuelve a iniciar sesión para verlo (va en el JWT).

INSERT IGNORE INTO permisos_catalogo (clave, modulo, nombre, descripcion, orden) VALUES
    ('asistencia.actividades_sugeridas.eliminar', 'Asistencia',
     'Eliminar lista de actividades sugeridas',
     'Borrar por completo una lista (cualquier estado) con sus trabajadores; deja de contar en el informe. No se puede deshacer', 19);

INSERT IGNORE INTO permisos_rol_v2 (rol_id, permiso_clave)
VALUES (1, 'asistencia.actividades_sugeridas.eliminar');
