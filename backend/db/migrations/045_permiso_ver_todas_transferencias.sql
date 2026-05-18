-- =============================================
-- Migración 045: Permiso "Ver Todas las Transferencias"
-- =============================================
-- Auto-asigna el permiso nuevo al Super Administrador (rol_id=1).
-- IGNORE garantiza idempotencia (no falla si ya existe).
-- Resto de roles deben ser asignados manualmente vía PermisosRolPanel.
-- Sin este permiso, GET /transferencias filtra por solicitante_id = user.id.

INSERT IGNORE INTO permisos_rol_v2 (rol_id, permiso_clave) VALUES
    (1, 'inventario.transferencias.ver_todas');
