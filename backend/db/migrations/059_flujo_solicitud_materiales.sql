-- ─────────────────────────────────────────────────────────────────────
-- 059 — Nuevo flujo "solicitud_materiales" para materiales de construcción
-- ─────────────────────────────────────────────────────────────────────
-- Agrega el valor 'solicitud_materiales' al ENUM tipo_flujo de transferencias
-- y registra el permiso granular para gating en el modal de creación.
-- Idempotente: usa MODIFY COLUMN (el ENUM completo se reescribe).

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

-- 2. Registrar permiso en catálogo
INSERT IGNORE INTO permisos (clave, modulo, nombre, descripcion, orden_peso)
VALUES (
    'inventario.transferencias.solicitud_materiales',
    'Inventario',
    'Solicitud de Materiales',
    'Crear solicitudes de materiales de construcción (cemento, fierro, áridos, etc.). Flujo con aprobación: pendiente → aprobada → en tránsito → recibida.',
    22
);

-- 3. Conceder a Super Admin (rol_id=1)
INSERT IGNORE INTO permisos_rol_v2 (rol_id, permiso_clave)
VALUES (1, 'inventario.transferencias.solicitud_materiales');
