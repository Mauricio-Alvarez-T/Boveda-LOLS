-- =============================================
-- Migración 035: Revertir flags hardcoded en bodegas
--
-- Decisión de negocio: bodegas = cualquier entrada del apartado
-- bodegas. Son obras tratadas con lógica aparte; no hay bodegas
-- "permanentes" ni empresa propietaria fija a nivel tabla. La
-- distinción bodega/obra es puramente estructural (tabla separada).
--
-- Cambios:
--   1. DROP items_inventario.propietario se MANTIENE (no era parte
--      del reclamo — sigue aplicando: ítems pueden ser Dedalius|LOLS).
--   2. DROP bodegas.es_permanente.
--   3. DROP bodegas.empresa_propietaria.
--   4. Los 3 rows sembrados por 034 (Cerrillos, Paraguay, Rivas
--      Vicuña) NO se borran — si ya hay stock o transferencias
--      referenciándolos, deletearlos romperia FKs. Usuario decide
--      vía UI si desactivarlos.
--
-- Idempotente vía information_schema check.
-- =============================================

-- ─────────────────────────────────────────────
-- 1. DROP bodegas.es_permanente
-- ─────────────────────────────────────────────
SET @col_exists := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'bodegas'
      AND COLUMN_NAME = 'es_permanente'
);
SET @sql := IF(@col_exists = 1,
    'ALTER TABLE bodegas DROP COLUMN es_permanente',
    'SELECT "bodegas.es_permanente ya no existe" AS msg'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ─────────────────────────────────────────────
-- 2. DROP bodegas.empresa_propietaria
-- ─────────────────────────────────────────────
SET @col_exists := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'bodegas'
      AND COLUMN_NAME = 'empresa_propietaria'
);
SET @sql := IF(@col_exists = 1,
    'ALTER TABLE bodegas DROP COLUMN empresa_propietaria',
    'SELECT "bodegas.empresa_propietaria ya no existe" AS msg'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
