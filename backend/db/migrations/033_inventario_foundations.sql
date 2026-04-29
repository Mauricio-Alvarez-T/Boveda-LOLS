-- =============================================
-- Migración 033: Foundations para rediseño de inventario
--
-- Objetivo: dejar el modelo de datos listo para los 8 flujos de
-- movimiento del negocio (Dedalius ↔ LOLS) y para el ciclo de
-- arriendo con facturación (ola 4, en pausa).
--
-- Cambios:
--   1. items_inventario.es_consumible (BOOLEAN) — distingue consumibles
--      que no vuelven a bodega y no generan arriendo.
--   2. items_inventario.propietario (ENUM dedalius|lols) — quién es
--      dueño del ítem. Minimalista; migrable a FK si mañana Dedalius
--      arrienda a un tercero.
--   3. bodegas.es_permanente (BOOLEAN) — distingue bodega canónica vs
--      almacén operativo eventual.
--   4. bodegas.empresa_propietaria (ENUM dedalius|lols).
--   5. transferencias.tipo_flujo (ENUM) — discriminador de los 8 flujos
--      (solicitud, push_directo, intra_bodega, intra_obra, orden_gerencia,
--      devolucion, rechazo_recepcion, cancelacion_post_despacho).
--      Los 2 últimos pueden vivir como variantes de estado; se dejan
--      fuera del ENUM por ahora.
--   6. transferencias.motivo (VARCHAR) — texto libre para auditoría.
--   7. Índices: idx_items_propietario, idx_transf_tipo_flujo.
--
-- Idempotente vía information_schema check + PREPARE/EXECUTE
-- (mismo patrón que 030-032). Compatible MySQL 5.7+.
-- =============================================

-- ─────────────────────────────────────────────
-- 1. items_inventario.es_consumible
-- ─────────────────────────────────────────────
SET @col_exists := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'items_inventario'
      AND COLUMN_NAME = 'es_consumible'
);
SET @sql := IF(@col_exists = 0,
    'ALTER TABLE items_inventario ADD COLUMN es_consumible BOOLEAN NOT NULL DEFAULT FALSE AFTER unidad',
    'SELECT "items_inventario.es_consumible ya existe" AS msg'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ─────────────────────────────────────────────
-- 2. items_inventario.propietario
-- ─────────────────────────────────────────────
SET @col_exists := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'items_inventario'
      AND COLUMN_NAME = 'propietario'
);
SET @sql := IF(@col_exists = 0,
    "ALTER TABLE items_inventario ADD COLUMN propietario ENUM('dedalius','lols') NOT NULL DEFAULT 'dedalius' AFTER es_consumible",
    'SELECT "items_inventario.propietario ya existe" AS msg'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ─────────────────────────────────────────────
-- 3. bodegas.es_permanente
-- ─────────────────────────────────────────────
SET @col_exists := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'bodegas'
      AND COLUMN_NAME = 'es_permanente'
);
SET @sql := IF(@col_exists = 0,
    'ALTER TABLE bodegas ADD COLUMN es_permanente BOOLEAN NOT NULL DEFAULT TRUE AFTER activa',
    'SELECT "bodegas.es_permanente ya existe" AS msg'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ─────────────────────────────────────────────
-- 4. bodegas.empresa_propietaria
-- ─────────────────────────────────────────────
SET @col_exists := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'bodegas'
      AND COLUMN_NAME = 'empresa_propietaria'
);
SET @sql := IF(@col_exists = 0,
    "ALTER TABLE bodegas ADD COLUMN empresa_propietaria ENUM('dedalius','lols') NOT NULL DEFAULT 'dedalius' AFTER es_permanente",
    'SELECT "bodegas.empresa_propietaria ya existe" AS msg'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ─────────────────────────────────────────────
-- 5. transferencias.tipo_flujo
-- ─────────────────────────────────────────────
SET @col_exists := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'transferencias'
      AND COLUMN_NAME = 'tipo_flujo'
);
SET @sql := IF(@col_exists = 0,
    "ALTER TABLE transferencias ADD COLUMN tipo_flujo ENUM('solicitud','push_directo','intra_bodega','intra_obra','orden_gerencia','devolucion') NOT NULL DEFAULT 'solicitud' AFTER estado",
    'SELECT "transferencias.tipo_flujo ya existe" AS msg'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ─────────────────────────────────────────────
-- 6. transferencias.motivo
-- ─────────────────────────────────────────────
SET @col_exists := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'transferencias'
      AND COLUMN_NAME = 'motivo'
);
SET @sql := IF(@col_exists = 0,
    'ALTER TABLE transferencias ADD COLUMN motivo VARCHAR(255) DEFAULT NULL AFTER observaciones',
    'SELECT "transferencias.motivo ya existe" AS msg'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ─────────────────────────────────────────────
-- 7. Índices
-- ─────────────────────────────────────────────
SET @idx_exists := (
    SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'items_inventario'
      AND INDEX_NAME = 'idx_items_propietario'
);
SET @sql := IF(@idx_exists = 0,
    'CREATE INDEX idx_items_propietario ON items_inventario(propietario, activo)',
    'SELECT "idx_items_propietario ya existe" AS msg'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists := (
    SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'transferencias'
      AND INDEX_NAME = 'idx_transf_tipo_flujo'
);
SET @sql := IF(@idx_exists = 0,
    'CREATE INDEX idx_transf_tipo_flujo ON transferencias(tipo_flujo, estado)',
    'SELECT "idx_transf_tipo_flujo ya existe" AS msg'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
