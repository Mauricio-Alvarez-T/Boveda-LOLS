-- =============================================
-- Migración 052: cantidad INT → DECIMAL(12,4)
-- =============================================
-- Schema original (mig 017, 018) almacena `cantidad` y derivados como INT.
-- Esto trunca silenciosamente fracciones para ítems con unidades como
-- kg, ton o m³ (ej. "1.5 kg" se guardaba como 1 → pérdida de 500 g).
--
-- Cambio a DECIMAL(12,4):
--   - Permite valores con hasta 4 decimales (suficiente para kg/g, m³/cm³, etc.)
--   - Rango máximo 99,999,999.9999 unidades por fila (muy holgado para inventario)
--   - DECIMAL evita los errores de precisión de FLOAT/DOUBLE en multiplicaciones
--     contra precios (que también deberían ser DECIMAL — out of scope acá)
--
-- Tablas afectadas:
--   - items_inventario.cantidad
--   - ubicaciones_stock.cantidad
--   - transferencia_items.cantidad_solicitada / cantidad_enviada / cantidad_recibida
--   - transferencia_discrepancias.cantidad_enviada / cantidad_recibida
--   - transferencia_item_origenes.cantidad / cantidad_decrementada (mig 048)
--   - transferencia_recepcion_items.cantidad_recibida
--   - discrepancias_inventario.diferencia (si existe)
--
-- Compatibilidad: ALTER TABLE MODIFY mantiene los valores existentes
-- (INT 5 se convierte en DECIMAL 5.0000 automáticamente). Lectura desde
-- mysql2 puede devolver string en lugar de number — el código backend ya
-- normaliza con parseFloat() en los puntos críticos (getStockPorObra,
-- getStockPorBodega, getResumen).
--
-- Riesgo: ALTER TABLE en producción con millones de filas puede bloquear.
-- Si la tabla items_inventario o ubicaciones_stock crece mucho, considerar
-- ejecutar en ventana de mantención o usar `pt-online-schema-change`.

-- ─── items_inventario ───
-- (Aunque actualmente la cantidad real vive en ubicaciones_stock, dejamos
-- la columna también en DECIMAL por consistencia y futuras agregaciones.)
ALTER TABLE items_inventario
    MODIFY COLUMN cantidad DECIMAL(12,4) NOT NULL DEFAULT 0;

-- ─── ubicaciones_stock ───
ALTER TABLE ubicaciones_stock
    MODIFY COLUMN cantidad DECIMAL(12,4) NOT NULL DEFAULT 0;

-- ─── transferencia_items ───
ALTER TABLE transferencia_items
    MODIFY COLUMN cantidad_solicitada DECIMAL(12,4) NOT NULL,
    MODIFY COLUMN cantidad_enviada    DECIMAL(12,4) NULL,
    MODIFY COLUMN cantidad_recibida   DECIMAL(12,4) NULL;

-- ─── transferencia_discrepancias ───
ALTER TABLE transferencia_discrepancias
    MODIFY COLUMN cantidad_enviada    DECIMAL(12,4) NOT NULL,
    MODIFY COLUMN cantidad_recibida   DECIMAL(12,4) NOT NULL;

-- ─── transferencia_item_origenes (mig 048) ───
-- Solo si existe (proteger contra entornos sin la migración 048).
SET @has_origenes = (
    SELECT COUNT(*) FROM information_schema.tables
    WHERE table_schema = DATABASE() AND table_name = 'transferencia_item_origenes'
);

SET @sql := IF(@has_origenes > 0,
    'ALTER TABLE transferencia_item_origenes
        MODIFY COLUMN cantidad DECIMAL(12,4) NOT NULL,
        MODIFY COLUMN cantidad_decrementada DECIMAL(12,4) NOT NULL DEFAULT 0',
    'SELECT "skip transferencia_item_origenes (no existe)" AS info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ─── transferencia_recepcion_items (mig 048) ───
SET @has_recepcion_items = (
    SELECT COUNT(*) FROM information_schema.tables
    WHERE table_schema = DATABASE() AND table_name = 'transferencia_recepcion_items'
);

SET @sql := IF(@has_recepcion_items > 0,
    'ALTER TABLE transferencia_recepcion_items
        MODIFY COLUMN cantidad_recibida DECIMAL(12,4) NOT NULL',
    'SELECT "skip transferencia_recepcion_items (no existe)" AS info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ─── discrepancias_inventario.diferencia ───
SET @has_diferencia = (
    SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'discrepancias_inventario'
      AND column_name = 'diferencia'
);

SET @sql := IF(@has_diferencia > 0,
    'ALTER TABLE discrepancias_inventario MODIFY COLUMN diferencia DECIMAL(12,4) NOT NULL',
    'SELECT "skip discrepancias_inventario.diferencia (no existe)" AS info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
