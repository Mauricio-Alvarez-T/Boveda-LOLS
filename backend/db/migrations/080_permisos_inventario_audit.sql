-- 080_permisos_inventario_audit.sql
-- Auditoría de permisos de Inventario (2026-06) tras el rediseño de transferencias (Fase 4).
--   1) Separa `devolucion` e `intra_obra` en permisos propios (antes heredaban `solicitar`).
--   2) Backfill SIN regresión: todo rol/override-grant que tenía `solicitar` conserva ambos nuevos.
--   3) Elimina la obsoleta `inventario.aprobar` (reemplazada por `inventario.transferencias.aprobar`).
-- Idempotente (INSERT IGNORE / DELETE WHERE). Tras correr: RE-LOGIN de usuarios afectados
-- (los permisos se acuñan en el JWT al login). El sync de arranque (permisos.service.js) ya NO
-- re-inserta `inventario.aprobar` porque se quitó del catálogo JS.

-- 1. Alta de los permisos nuevos en el catálogo (por si el sync aún no corrió → evita fallo de FK
--    en el backfill). El sync luego sólo actualiza nombre/descripcion/orden desde el catálogo JS.
INSERT IGNORE INTO permisos_catalogo (clave, modulo, nombre, descripcion, orden) VALUES
  ('inventario.transferencias.devolucion', 'Inventario', 'Devolución (obra→bodega)',
   'Crear devoluciones de stock de obra a bodega. Flujo con aprobación.', 24),
  ('inventario.transferencias.intra_obra', 'Inventario', 'Traslado entre obras',
   'Crear traslados de stock de una obra a otra. Flujo con aprobación.', 25);

-- 2. Backfill sin regresión — roles con `solicitar` reciben también `devolucion` + `intra_obra`.
INSERT IGNORE INTO permisos_rol_v2 (rol_id, permiso_clave)
  SELECT rol_id, 'inventario.transferencias.devolucion'
    FROM permisos_rol_v2 WHERE permiso_clave = 'inventario.transferencias.solicitar';
INSERT IGNORE INTO permisos_rol_v2 (rol_id, permiso_clave)
  SELECT rol_id, 'inventario.transferencias.intra_obra'
    FROM permisos_rol_v2 WHERE permiso_clave = 'inventario.transferencias.solicitar';

-- 2b. Igual para overrides de usuario de tipo 'grant' (los 'deny' NO se propagan).
INSERT IGNORE INTO permisos_usuario_override (usuario_id, permiso_clave, tipo)
  SELECT usuario_id, 'inventario.transferencias.devolucion', 'grant'
    FROM permisos_usuario_override WHERE permiso_clave = 'inventario.transferencias.solicitar' AND tipo = 'grant';
INSERT IGNORE INTO permisos_usuario_override (usuario_id, permiso_clave, tipo)
  SELECT usuario_id, 'inventario.transferencias.intra_obra', 'grant'
    FROM permisos_usuario_override WHERE permiso_clave = 'inventario.transferencias.solicitar' AND tipo = 'grant';

-- 3. Baja de la obsoleta `inventario.aprobar` (grants primero por FK, luego el catálogo).
DELETE FROM permisos_rol_v2 WHERE permiso_clave = 'inventario.aprobar';
DELETE FROM permisos_usuario_override WHERE permiso_clave = 'inventario.aprobar';
DELETE FROM permisos_catalogo WHERE clave = 'inventario.aprobar';
