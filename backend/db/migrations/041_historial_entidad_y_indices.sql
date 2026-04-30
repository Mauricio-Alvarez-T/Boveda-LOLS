-- =============================================
-- Migración 041: historial enriquecido con entidad + índices compuestos
--
-- Sprint 1 de la auditoría del Historial de Actividad.
--
-- A. Columnas entidad_tipo + entidad_label en logs_actividad para que la UI
--    muestre "Editó trabajador → Juan Pérez" en lugar de "Editó trabajador
--    ID 42". Populadas en el INSERT del middleware (no hay backfill).
-- B. Índices compuestos para los filtros frecuentes del nuevo panel de
--    Historial (módulo+fecha, usuario+fecha, acción, entidad).
--
-- Idempotente vía information_schema + PREPARE/EXECUTE (patrón 037-040).
-- =============================================

-- ─────────────────────────────────────────────
-- A.1 Columna entidad_tipo
-- ─────────────────────────────────────────────
SET @col_exists := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'logs_actividad'
      AND COLUMN_NAME = 'entidad_tipo'
);
SET @sql := IF(@col_exists = 0,
    'ALTER TABLE logs_actividad ADD COLUMN entidad_tipo VARCHAR(40) NULL AFTER item_id',
    'SELECT "logs_actividad.entidad_tipo ya existe" AS msg'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ─────────────────────────────────────────────
-- A.2 Columna entidad_label
-- ─────────────────────────────────────────────
SET @col_exists := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'logs_actividad'
      AND COLUMN_NAME = 'entidad_label'
);
SET @sql := IF(@col_exists = 0,
    'ALTER TABLE logs_actividad ADD COLUMN entidad_label VARCHAR(160) NULL AFTER entidad_tipo',
    'SELECT "logs_actividad.entidad_label ya existe" AS msg'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ─────────────────────────────────────────────
-- B.1 Índice compuesto (modulo, created_at DESC)
-- Reemplaza idx_logs_modulo cuando la query filtra módulo y ordena por fecha.
-- ─────────────────────────────────────────────
SET @idx_exists := (
    SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'logs_actividad'
      AND INDEX_NAME = 'idx_logs_modulo_created'
);
SET @sql := IF(@idx_exists = 0,
    'ALTER TABLE logs_actividad ADD INDEX idx_logs_modulo_created (modulo, created_at)',
    'SELECT "idx_logs_modulo_created ya existe" AS msg'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ─────────────────────────────────────────────
-- B.2 Índice compuesto (usuario_id, created_at DESC)
-- ─────────────────────────────────────────────
SET @idx_exists := (
    SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'logs_actividad'
      AND INDEX_NAME = 'idx_logs_usuario_created'
);
SET @sql := IF(@idx_exists = 0,
    'ALTER TABLE logs_actividad ADD INDEX idx_logs_usuario_created (usuario_id, created_at)',
    'SELECT "idx_logs_usuario_created ya existe" AS msg'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ─────────────────────────────────────────────
-- B.3 Índice por accion
-- Soporta filtros como "todas las acciones DELETE" y la exclusión de LOGIN
-- por default que aplica el endpoint /api/logs.
-- ─────────────────────────────────────────────
SET @idx_exists := (
    SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'logs_actividad'
      AND INDEX_NAME = 'idx_logs_accion'
);
SET @sql := IF(@idx_exists = 0,
    'ALTER TABLE logs_actividad ADD INDEX idx_logs_accion (accion)',
    'SELECT "idx_logs_accion ya existe" AS msg'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ─────────────────────────────────────────────
-- B.4 Índice por entidad (tipo + label) para drill-down.
-- ─────────────────────────────────────────────
SET @idx_exists := (
    SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'logs_actividad'
      AND INDEX_NAME = 'idx_logs_entidad'
);
SET @sql := IF(@idx_exists = 0,
    'ALTER TABLE logs_actividad ADD INDEX idx_logs_entidad (entidad_tipo, entidad_label)',
    'SELECT "idx_logs_entidad ya existe" AS msg'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
