-- ─────────────────────────────────────────────────────────────────────
-- 097 — Vínculo usuario ↔ bodega (rol Bodeguero)
-- ─────────────────────────────────────────────────────────────────────
-- Requerimiento: un bodeguero (ej. bodega Peñaflor) debe VER y RECEPCIONAR
-- las transferencias cuyo DESTINO es su bodega, sin necesitar
-- `inventario.transferencias.ver_todas` (que expone todo el sistema).
--
-- `usuarios.bodega_id` (NULL = sin bodega, comportamiento actual intacto):
--   - Visibilidad: GET /transferencias suma "OR t.destino_bodega_id = <mi bodega>"
--     al scope por solicitante (transferencia.service.getAll).
--   - Enforcement: un usuario CON bodega solo puede recibir/rechazar-recepción
--     de transferencias destinadas a SU bodega (transferencia.service.recibir/rechazar).
--   - Se acuña en el JWT al login → re-login tras asignar/cambiar bodega.
--
-- Nota: NO se reusa bodegas.responsable_id (deprecado en mig 060, texto libre);
-- la relación va en usuarios para soportar N bodegueros por bodega.
--
-- Idempotente: ADD COLUMN IF NOT EXISTS + FK envuelta (MySQL/MariaDB NO soporta
-- `ADD CONSTRAINT IF NOT EXISTS` → patrón guardado con information_schema, igual
-- que migraciones 039/040/061/076/082).

-- 1. Columna (NULL = sin bodega)
ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS bodega_id INT NULL
  AFTER obra_id;

-- 2. FK bodega_id → bodegas.id (SET NULL si se borra la bodega). Envuelta para
--    tolerar re-ejecución sin `ADD CONSTRAINT IF NOT EXISTS` (no soportado).
SET @fk_exists := (
    SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'usuarios'
      AND CONSTRAINT_NAME = 'fk_usuarios_bodega'
);
SET @sql := IF(@fk_exists = 0,
    'ALTER TABLE usuarios ADD CONSTRAINT fk_usuarios_bodega FOREIGN KEY (bodega_id) REFERENCES bodegas(id) ON DELETE SET NULL',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
