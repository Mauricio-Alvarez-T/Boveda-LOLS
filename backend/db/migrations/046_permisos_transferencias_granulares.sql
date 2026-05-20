-- =============================================
-- Migración 046: Permisos granulares de transferencias + SoD
-- =============================================
-- Reemplaza los gates genéricos (inventario.crear/.aprobar/.editar) en el
-- flujo de transferencias con 9 permisos atómicos. Habilita Segregation of
-- Duties (SoD): el backend rechaza acciones consecutivas del mismo usuario
-- sobre la misma transferencia (excepto con sod_bypass).
--
-- Política de asignación:
--   · Sólo Super Admin (rol_id=1) recibe los 9 permisos automáticamente.
--   · Roles existentes (En Terreno, Bodeguero, Jefe Obra, etc.) NO heredan
--     automáticamente — admin debe reasignar manualmente usando el modal
--     nuevo de permisos (Configuración → Roles).
--   · Esto evita auto-asignar permisos sensibles (sod_bypass, flujos
--     especiales) sin revisión humana.
--
-- Decisión usuario (Phase 3): "manual por admin", ver plan
-- regalon-necesito-contruir-una-sorted-diffie.md § 1.2.

INSERT IGNORE INTO permisos_rol_v2 (rol_id, permiso_clave) VALUES
    (1, 'inventario.transferencias.solicitar'),
    (1, 'inventario.transferencias.aprobar'),
    (1, 'inventario.transferencias.despachar'),
    (1, 'inventario.transferencias.recibir'),
    (1, 'inventario.transferencias.cancelar'),
    (1, 'inventario.transferencias.push_directo'),
    (1, 'inventario.transferencias.intra_bodega'),
    (1, 'inventario.transferencias.orden_gerencia'),
    (1, 'inventario.transferencias.sod_bypass');
