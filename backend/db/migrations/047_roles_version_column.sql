-- =============================================
-- Migración 047: Defensiva — columna roles.version
-- =============================================
-- En producción la columna `version` fue añadida manualmente (no quedó
-- registro en ninguna migración SQL previa). Esta migración la codifica
-- para que staging, desarrollo local y nuevos deployments la tengan
-- automáticamente.
--
-- Pattern PREPARE/EXECUTE (no `ADD COLUMN IF NOT EXISTS`) para soportar
-- MySQL 5.7 además de 8.0+. Si la columna ya existe, ejecuta un SELECT
-- inocuo en lugar del ALTER. Idempotente.
--
-- Contexto: `versionService.init()` lee esta columna al arranque del
-- backend. Si no existe, el SELECT falla y el backend no levanta.
-- Necesaria para que el sistema de invalidación de JWT (rv en payload)
-- funcione tras cambios de rol o permisos.
-- =============================================

SET @col_exists := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'roles'
      AND COLUMN_NAME = 'version'
);
SET @sql := IF(@col_exists = 0,
    'ALTER TABLE roles ADD COLUMN version INT NOT NULL DEFAULT 1',
    'SELECT "roles.version ya existe" AS msg'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Backfill: cualquier rol con version NULL (caso edge si la columna se
-- añadió manualmente como nullable) pasa a 1.
UPDATE roles SET version = 1 WHERE version IS NULL;
