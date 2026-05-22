-- =============================================
-- Migración 052: cantidad INT → DECIMAL(12,4)
-- =============================================
-- Schema original (mig 017, 018, 024, 032, 048) almacena cantidades como INT.
-- Esto trunca silenciosamente fracciones para ítems con unidades como kg, ton
-- o m³ (ej. "1.5 kg" se guardaba como 1 → pérdida de 500 g).
--
-- Cambio a DECIMAL(12,4):
--   - Permite valores con hasta 4 decimales (suficiente para kg/g, m³/cm³, etc.)
--   - Rango máximo 99,999,999.9999 unidades por fila (muy holgado para inventario)
--   - DECIMAL evita los errores de precisión de FLOAT/DOUBLE en multiplicaciones
--     contra precios (que también son DECIMAL).
--
-- Tablas afectadas (columnas REALES, verificadas contra schema):
--   - ubicaciones_stock.cantidad
--   - transferencia_items.cantidad_solicitada / cantidad_enviada / cantidad_recibida
--   - transferencia_discrepancias.cantidad_enviada / cantidad_recibida + diferencia (GENERATED)
--   - transferencia_item_origenes.cantidad_enviada (mig 032) + cantidad_decrementada (mig 048)
--   - transferencia_recepcion_items.cantidad_recibida (mig 048)
--   - discrepancias_inventario.cantidad_sistema / cantidad_reportada + diferencia (GENERATED)
--
-- NOTA: items_inventario NO tiene columna cantidad (la cantidad real vive en
-- ubicaciones_stock). El intento original de modificarla causaba
-- "Unknown column 'cantidad' in 'items_inventario'".
--
-- Columnas GENERATED: las columnas `diferencia` se calculan en BD a partir de
-- las cantidades. Para cambiar el tipo de las cantidades hay que primero
-- dropear la GENERATED y re-crearla con la nueva precisión.
--
-- Compatibilidad: ALTER TABLE MODIFY mantiene los valores existentes
-- (INT 5 se convierte en DECIMAL 5.0000 automáticamente).
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
-- `diferencia` es GENERATED (cantidad_enviada - cantidad_recibida). Hay que
-- dropearla antes de modificar las columnas de origen y re-crearla luego con
-- DECIMAL para que el cálculo conserve precisión decimal.
ALTER TABLE transferencia_discrepancias DROP COLUMN diferencia;
ALTER TABLE transferencia_discrepancias
    MODIFY COLUMN cantidad_enviada  DECIMAL(12,4) NOT NULL,
    MODIFY COLUMN cantidad_recibida DECIMAL(12,4) NOT NULL;
ALTER TABLE transferencia_discrepancias
    ADD COLUMN diferencia DECIMAL(12,4)
    GENERATED ALWAYS AS (cantidad_enviada - cantidad_recibida) STORED;

-- ─── transferencia_item_origenes (mig 032 + 048) ───
-- Solo si la tabla existe (proteger contra entornos sin mig 032 aplicada).
-- Columna correcta: `cantidad_enviada` (NO `cantidad`). `cantidad_decrementada`
-- se agregó en mig 048 — chequear si existe.
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
    WHERE table_schema = DATABASE() AND table_name = 'transferencia_item_origenes'
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

-- ─── discrepancias_inventario (mig 021) ───
-- `diferencia` también es GENERATED (cantidad_reportada - cantidad_sistema).
-- Mismo patrón: drop → modify cantidades → re-add diferencia con DECIMAL.
SET @has_discrepancias = (
    SELECT COUNT(*) FROM information_schema.tables
    WHERE table_schema = DATABASE() AND table_name = 'discrepancias_inventario'
);

SET @sql := IF(@has_discrepancias > 0,
    'ALTER TABLE discrepancias_inventario DROP COLUMN diferencia',
    'SELECT "skip discrepancias_inventario (no existe)" AS info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(@has_discrepancias > 0,
    'ALTER TABLE discrepancias_inventario
        MODIFY COLUMN cantidad_sistema DECIMAL(12,4) NOT NULL,
        MODIFY COLUMN cantidad_reportada DECIMAL(12,4) NOT NULL',
    'SELECT "skip" AS info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(@has_discrepancias > 0,
    'ALTER TABLE discrepancias_inventario
        ADD COLUMN diferencia DECIMAL(12,4)
        GENERATED ALWAYS AS (cantidad_reportada - cantidad_sistema) STORED',
    'SELECT "skip" AS info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
