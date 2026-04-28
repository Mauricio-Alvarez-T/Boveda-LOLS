-- =============================================
-- Migración 039: audit trail + índices inventario
--
-- Sprint 1 de la auditoría completa del módulo Inventario.
--
-- A. Columnas audit trail en transferencias para trazar quién hizo
--    cada transición de estado (creado, aprobado, despachado,
--    recibido, rechazado, cancelado).
-- B. Backfill creado_por desde la columna existente solicitante_id.
-- C. Índices que faltaban en filtros frecuentes.
--
-- Idempotente vía information_schema + PREPARE/EXECUTE (patrón 037/038).
-- Tipos INT signed para matchear usuarios.id (aprendizaje 038 errno 150).
-- =============================================

-- ─────────────────────────────────────────────
-- A.1 Columnas audit en transferencias
-- ─────────────────────────────────────────────

-- Helper: agregar columna si no existe
SET @col_exists := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'transferencias'
      AND COLUMN_NAME = 'creado_por'
);
SET @sql := IF(@col_exists = 0,
    'ALTER TABLE transferencias ADD COLUMN creado_por INT NULL AFTER solicitante_id',
    'SELECT "creado_por ya existe" AS msg'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'transferencias'
      AND COLUMN_NAME = 'aprobado_por'
);
SET @sql := IF(@col_exists = 0,
    'ALTER TABLE transferencias ADD COLUMN aprobado_por INT NULL AFTER creado_por',
    'SELECT "aprobado_por ya existe" AS msg'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'transferencias'
      AND COLUMN_NAME = 'despachado_por'
);
SET @sql := IF(@col_exists = 0,
    'ALTER TABLE transferencias ADD COLUMN despachado_por INT NULL AFTER aprobado_por',
    'SELECT "despachado_por ya existe" AS msg'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'transferencias'
      AND COLUMN_NAME = 'recibido_por'
);
SET @sql := IF(@col_exists = 0,
    'ALTER TABLE transferencias ADD COLUMN recibido_por INT NULL AFTER despachado_por',
    'SELECT "recibido_por ya existe" AS msg'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'transferencias'
      AND COLUMN_NAME = 'rechazado_por'
);
SET @sql := IF(@col_exists = 0,
    'ALTER TABLE transferencias ADD COLUMN rechazado_por INT NULL AFTER recibido_por',
    'SELECT "rechazado_por ya existe" AS msg'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'transferencias'
      AND COLUMN_NAME = 'cancelado_por'
);
SET @sql := IF(@col_exists = 0,
    'ALTER TABLE transferencias ADD COLUMN cancelado_por INT NULL AFTER rechazado_por',
    'SELECT "cancelado_por ya existe" AS msg'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ─────────────────────────────────────────────
-- A.2 FKs hacia usuarios
-- ─────────────────────────────────────────────

SET @fk_exists := (
    SELECT COUNT(*) FROM information_schema.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'transferencias'
      AND CONSTRAINT_NAME = 'fk_trf_creado_por'
);
SET @sql := IF(@fk_exists = 0,
    'ALTER TABLE transferencias ADD CONSTRAINT fk_trf_creado_por FOREIGN KEY (creado_por) REFERENCES usuarios(id) ON DELETE RESTRICT',
    'SELECT "fk_trf_creado_por ya existe" AS msg'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk_exists := (
    SELECT COUNT(*) FROM information_schema.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'transferencias'
      AND CONSTRAINT_NAME = 'fk_trf_aprobado_por'
);
SET @sql := IF(@fk_exists = 0,
    'ALTER TABLE transferencias ADD CONSTRAINT fk_trf_aprobado_por FOREIGN KEY (aprobado_por) REFERENCES usuarios(id) ON DELETE RESTRICT',
    'SELECT "fk_trf_aprobado_por ya existe" AS msg'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk_exists := (
    SELECT COUNT(*) FROM information_schema.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'transferencias'
      AND CONSTRAINT_NAME = 'fk_trf_despachado_por'
);
SET @sql := IF(@fk_exists = 0,
    'ALTER TABLE transferencias ADD CONSTRAINT fk_trf_despachado_por FOREIGN KEY (despachado_por) REFERENCES usuarios(id) ON DELETE RESTRICT',
    'SELECT "fk_trf_despachado_por ya existe" AS msg'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk_exists := (
    SELECT COUNT(*) FROM information_schema.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'transferencias'
      AND CONSTRAINT_NAME = 'fk_trf_recibido_por'
);
SET @sql := IF(@fk_exists = 0,
    'ALTER TABLE transferencias ADD CONSTRAINT fk_trf_recibido_por FOREIGN KEY (recibido_por) REFERENCES usuarios(id) ON DELETE RESTRICT',
    'SELECT "fk_trf_recibido_por ya existe" AS msg'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk_exists := (
    SELECT COUNT(*) FROM information_schema.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'transferencias'
      AND CONSTRAINT_NAME = 'fk_trf_rechazado_por'
);
SET @sql := IF(@fk_exists = 0,
    'ALTER TABLE transferencias ADD CONSTRAINT fk_trf_rechazado_por FOREIGN KEY (rechazado_por) REFERENCES usuarios(id) ON DELETE RESTRICT',
    'SELECT "fk_trf_rechazado_por ya existe" AS msg'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk_exists := (
    SELECT COUNT(*) FROM information_schema.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'transferencias'
      AND CONSTRAINT_NAME = 'fk_trf_cancelado_por'
);
SET @sql := IF(@fk_exists = 0,
    'ALTER TABLE transferencias ADD CONSTRAINT fk_trf_cancelado_por FOREIGN KEY (cancelado_por) REFERENCES usuarios(id) ON DELETE RESTRICT',
    'SELECT "fk_trf_cancelado_por ya existe" AS msg'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ─────────────────────────────────────────────
-- B. Backfill creado_por desde solicitante_id
-- ─────────────────────────────────────────────
UPDATE transferencias SET creado_por = solicitante_id
WHERE creado_por IS NULL AND solicitante_id IS NOT NULL;

-- ─────────────────────────────────────────────
-- C. Índices faltantes
-- ─────────────────────────────────────────────

SET @idx_exists := (
    SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'transferencias'
      AND INDEX_NAME = 'idx_trf_estado_activo'
);
SET @sql := IF(@idx_exists = 0,
    'ALTER TABLE transferencias ADD INDEX idx_trf_estado_activo (estado, activo)',
    'SELECT "idx_trf_estado_activo ya existe" AS msg'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists := (
    SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'ubicaciones_stock'
      AND INDEX_NAME = 'idx_us_obra_bodega'
);
SET @sql := IF(@idx_exists = 0,
    'ALTER TABLE ubicaciones_stock ADD INDEX idx_us_obra_bodega (obra_id, bodega_id)',
    'SELECT "idx_us_obra_bodega ya existe" AS msg'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @tbl_exists := (
    SELECT COUNT(*) FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'transferencia_discrepancias'
);
SET @idx_exists := IF(@tbl_exists = 0, 1, (
    SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'transferencia_discrepancias'
      AND INDEX_NAME = 'idx_disc_estado'
));
SET @sql := IF(@idx_exists = 0,
    'ALTER TABLE transferencia_discrepancias ADD INDEX idx_disc_estado (estado)',
    'SELECT "idx_disc_estado ya existe o tabla no existe" AS msg'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
