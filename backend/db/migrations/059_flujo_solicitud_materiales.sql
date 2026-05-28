-- ─────────────────────────────────────────────────────────────────────
-- 059 — Nuevo flujo "solicitud_materiales" para materiales de construcción
-- ─────────────────────────────────────────────────────────────────────
-- Agrega el valor 'solicitud_materiales' al ENUM tipo_flujo de transferencias
-- y concede el permiso granular a Super Admin (rol_id=1).
--
-- Nota: el catálogo de permisos vive en backend/src/config/permisos.config.js
-- (no en una tabla `permisos`). Sólo persistimos la asignación rol↔permiso
-- en `permisos_rol_v2`. Patrón replicado de migración 046.
--
-- Idempotente: MODIFY COLUMN reescribe el ENUM y INSERT IGNORE evita duplicados.

-- 1. Ampliar ENUM tipo_flujo
ALTER TABLE transferencias
MODIFY COLUMN tipo_flujo ENUM(
    'solicitud',
    'solicitud_materiales',
    'push_directo',
    'intra_bodega',
    'intra_obra',
    'orden_gerencia',
    'devolucion'
) NOT NULL DEFAULT 'solicitud';

-- 2. Conceder permiso a Super Admin (rol_id=1)
INSERT IGNORE INTO permisos_rol_v2 (rol_id, permiso_clave)
VALUES (1, 'inventario.transferencias.solicitud_materiales');
