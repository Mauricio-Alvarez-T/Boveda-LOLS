-- ─────────────────────────────────────────────────────────────────────
-- 088 — Permiso inventario.transferencias.eliminar (hard delete de transferencias/diferencias)
-- ─────────────────────────────────────────────────────────────────────
-- `syncCatalogoEnArranque()` ya inserta este permiso desde el catálogo JS
-- (permisos.config.js), PERO el backend NO sincroniza en el boot — solo se
-- corre vía `migrate` (runMaintenanceTasks) o el script maintenance. Sin un
-- `migrate`, el permiso no aparece en el catálogo y el panel de roles no lo
-- muestra. Lo insertamos explícito para dejar rastro en SQL y que un `migrate`
-- lo deje disponible. INSERT IGNORE = idempotente.

INSERT IGNORE INTO permisos_catalogo (clave, modulo, nombre, descripcion, orden) VALUES
('inventario.transferencias.eliminar', 'Inventario', '⚠️ Eliminar Transferencia', 'Borrado PERMANENTE (hard delete) de una transferencia y sus diferencias — la saca del historial. Irreversible y NO revierte stock. Pensado para purgar datos de prueba. Reservado a administración.', 27);
