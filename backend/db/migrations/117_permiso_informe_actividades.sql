-- =============================================
-- 117 — Permiso: informe de asistencia a actividades sugeridas
-- =============================================
-- Pedido del dueño (2026-09-21): quien tenga permiso puede ver el resumen por cargo
-- en Inicio/Gestiones y descargar el Excel de dos hojas (por cargo / por obra→cargo)
-- de quiénes asistieron a las actividades sugeridas de una semana.
--
-- Permiso propio (no reusa `...ver`) para poder dárselo solo a quien prepara pagos.
-- Catálogo primero y luego el rol (FK permisos_rol_v2.permiso_clave → permisos_catalogo.clave).
-- Sin `roles.version`: agregar una clave no invalida los tokens vigentes; quien la reciba
-- debe volver a iniciar sesión para verla (los permisos viajan en el JWT).

INSERT IGNORE INTO permisos_catalogo (clave, modulo, nombre, descripcion, orden) VALUES
    ('asistencia.actividades_sugeridas.informe', 'Asistencia',
     'Descargar informe de actividades sugeridas',
     'Ver el resumen por cargo y descargar el Excel (por cargo / por obra) de quiénes asistieron en una semana', 18);

INSERT IGNORE INTO permisos_rol_v2 (rol_id, permiso_clave)
VALUES (1, 'asistencia.actividades_sugeridas.informe');
