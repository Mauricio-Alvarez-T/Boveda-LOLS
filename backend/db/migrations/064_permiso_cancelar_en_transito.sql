-- =============================================
-- Migración 064: permiso "Cancelar en Tránsito"
-- =============================================
-- Punto 34 del checklist: una transferencia ya despachada (en_transito) no
-- debe poder cancelarse en el flujo normal. Solo un rol con este permiso
-- especial (ej. jefatura / "Leo") puede hacerlo.
--
-- El catálogo de permisos vive en permisos.config.js (código). Aquí sólo
-- concedemos el permiso a Super Admin (rol_id=1). Patrón migración 046.
-- Otros roles lo asignan manualmente desde Configuración → Roles.

INSERT IGNORE INTO permisos_rol_v2 (rol_id, permiso_clave)
VALUES (1, 'inventario.transferencias.cancelar_en_transito');
