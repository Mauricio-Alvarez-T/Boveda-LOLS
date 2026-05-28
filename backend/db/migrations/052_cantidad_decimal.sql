-- =============================================
-- Migración 052: cantidad INT → DECIMAL(12,4) (idempotente, schema-aware)
-- =============================================
-- Schema original (mig 017, 018, 024, 032, 048) almacena cantidades como INT.
-- Esto trunca silenciosamente fracciones para ítems con unidades como kg, ton
-- o m³ (ej. "1.5 kg" se guardaba como 1 → pérdida de 500 g).
--
-- Cambio a DECIMAL(12,4):
--   - Permite valores con hasta 4 decimales
--   - Rango máximo 99,999,999.9999 unidades por fila
--   - DECIMAL evita errores de precisión float en multiplicaciones contra precios
--
-- Esta migración es idempotente y maneja drift de schema:
--   - ALTER MODIFY DECIMAL → DECIMAL es no-op en MariaDB (metadata only)
--   - Guards via information_schema para DROP/ADD condicionales
--   - discrepancias_inventario tiene DOS variantes posibles:
--       (a) schema mig 021: cantidad_reportada + diferencia GENERATED
--       (b) schema legacy: cantidad_real + sin diferencia
--     La migración detecta cuál existe y aplica acorde.
--
-- NOTA: items_inventario NO tiene columna cantidad (vive en ubicaciones_stock).
-- =============================================

-- ─── ubicaciones_stock ───
ALTER TABLE ubicaciones_stock
    MODIFY COLUMN cantidad DECIMAL(12,4) NOT NULL DEFAULT 0;

-- ─── transferencia_items ───
ALTER TABLE transferencia_items
    MODIFY COLUMN cantidad_solicitada DECIMAL(12,4) NOT NULL,
    MODIFY COLUMN cantidad_enviada    DECIMAL(12,4) NULL,
    MODIFY COLUMN cantidad_recibida   DECIMAL(12,4) NULL;

-- ─── transferencia_discrepancias ───
-- diferencia es GENERATED (cantidad_enviada - cantidad_recibida).
-- DROP condicional → MODIFY cantidades → re-ADD diferencia condicional.

SET @has_dif_trfd = (
    SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'transferencia_discrepancias'
      AND column_name = 'diferencia'
);
SET @sql := IF(@has_dif_trfd > 0,
    'ALTER TABLE transferencia_discrepancias DROP COLUMN diferencia',
    'SELECT "skip drop trfd.diferencia (no existe)" AS info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

ALTER TABLE transferencia_discrepancias
    MODIFY COLUMN cantidad_enviada  DECIMAL(12,4) NOT NULL,
    MODIFY COLUMN cantidad_recibida DECIMAL(12,4) NOT NULL;

SET @has_dif_trfd_now = (
    SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'transferencia_discrepancias'
      AND column_name = 'diferencia'
);
SET @sql := IF(@has_dif_trfd_now = 0,
    'ALTER TABLE transferencia_discrepancias
        ADD COLUMN diferencia DECIMAL(12,4)
        GENERATED ALWAYS AS (cantidad_enviada - cantidad_recibida) STORED',
    'SELECT "skip add trfd.diferencia (ya existe)" AS info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ─── transferencia_item_origenes (mig 032 + 048) ───
SET @has_origenes = (
    SELECT COUNT(*) FROM information_schema.tables
    WHERE table_schema = DATABASE() AND table_name = 'transferencia_item_origenes'
);
SET @sql := IF(@has_origenes > 0,
    'ALTER TABLE transferencia_item_origenes MODIFY COLUMN cantidad_enviada DECIMAL(12,4) NOT NULL',
    'SELECT "skip transferencia_item_origenes (no existe)" AS info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_decrementada = (
    SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'transferencia_item_origenes'
      AND column_name = 'cantidad_decrementada'
);
SET @sql := IF(@has_decrementada > 0,
    'ALTER TABLE transferencia_item_origenes MODIFY COLUMN cantidad_decrementada DECIMAL(12,4) NOT NULL DEFAULT 0',
    'SELECT "skip cantidad_decrementada (mig 048 no aplicada)" AS info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ─── transferencia_recepcion_items (mig 048) ───
SET @has_recepcion_items = (
    SELECT COUNT(*) FROM information_schema.tables
    WHERE table_schema = DATABASE() AND table_name = 'transferencia_recepcion_items'
);
SET @sql := IF(@has_recepcion_items > 0,
    'ALTER TABLE transferencia_recepcion_items MODIFY COLUMN cantidad_recibida DECIMAL(12,4) NOT NULL',
    'SELECT "skip transferencia_recepcion_items (mig 048 no aplicada)" AS info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ─── discrepancias_inventario (schema-aware) ───
-- Drift detectado: algunos entornos tienen schema mig 021 (cantidad_reportada
-- + diferencia GENERATED), otros tienen schema legacy (cantidad_real, sin
-- diferencia). Detectamos qué columnas existen y aplicamos sólo lo necesario.

SET @has_disc_table = (
    SELECT COUNT(*) FROM information_schema.tables
    WHERE table_schema = DATABASE() AND table_name = 'discrepancias_inventario'
);

-- 1) DROP diferencia si existe (para poder modificar columnas origen)
SET @has_dif_disc = IF(@has_disc_table > 0, (
    SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'discrepancias_inventario'
      AND column_name = 'diferencia'
), 0);
SET @sql := IF(@has_dif_disc > 0,
    'ALTER TABLE discrepancias_inventario DROP COLUMN diferencia',
    'SELECT "skip drop disc.diferencia (no existe o tabla no existe)" AS info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2) MODIFY cantidad_sistema (siempre existe si la tabla existe)
SET @sql := IF(@has_disc_table > 0,
    'ALTER TABLE discrepancias_inventario MODIFY COLUMN cantidad_sistema DECIMAL(12,4) NOT NULL DEFAULT 0',
    'SELECT "skip discrepancias_inventario (tabla no existe)" AS info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3) MODIFY cantidad_reportada (schema mig 021) si existe
SET @has_reportada = IF(@has_disc_table > 0, (
    SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'discrepancias_inventario'
      AND column_name = 'cantidad_reportada'
), 0);
SET @sql := IF(@has_reportada > 0,
    'ALTER TABLE discrepancias_inventario MODIFY COLUMN cantidad_reportada DECIMAL(12,4) NOT NULL DEFAULT 0',
    'SELECT "skip cantidad_reportada (schema legacy o no existe)" AS info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 4) MODIFY cantidad_real (schema legacy) si existe
SET @has_real = IF(@has_disc_table > 0, (
    SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'discrepancias_inventario'
      AND column_name = 'cantidad_real'
), 0);
SET @sql := IF(@has_real > 0,
    'ALTER TABLE discrepancias_inventario MODIFY COLUMN cantidad_real DECIMAL(12,4) NOT NULL DEFAULT 0',
    'SELECT "skip cantidad_real (schema mig021 o no existe)" AS info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 5) Re-ADD diferencia GENERATED. Fórmula depende de qué columna existe.
--    Si ninguna columna de "reportada"/"real" está → no podemos calcular, skip.
SET @has_dif_now = IF(@has_disc_table > 0, (
    SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'discrepancias_inventario'
      AND column_name = 'diferencia'
), 0);
SET @sql := IF(@has_dif_now = 0 AND @has_reportada > 0,
    'ALTER TABLE discrepancias_inventario
        ADD COLUMN diferencia DECIMAL(12,4)
        GENERATED ALWAYS AS (cantidad_reportada - cantidad_sistema) STORED',
    IF(@has_dif_now = 0 AND @has_real > 0,
        'ALTER TABLE discrepancias_inventario
            ADD COLUMN diferencia DECIMAL(12,4)
            GENERATED ALWAYS AS (cantidad_real - cantidad_sistema) STORED',
        'SELECT "skip add disc.diferencia (ya existe o falta columna origen)" AS info'
    )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
