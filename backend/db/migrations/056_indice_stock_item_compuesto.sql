-- =============================================
-- Migración 056: índice compuesto (item_id, obra_id, bodega_id) en ubicaciones_stock
-- =============================================
-- Queries actuales en ubicaciones_stock filtran por item_id como primera
-- condición:
--   - factura-inventario.service.js → UPSERT por item en INSERT/UPDATE
--   - transferencia.service.js → decrement/increment stock por item
--   - inventario.service.js → getStockPorItem (auditoría)
--   - stockBulk.service.js → SELECT batch nuevo (Sprint 1.4)
--
-- Índices existentes (mig 017, 039):
--   - uk_item_ubicacion(item_id, obra_id, bodega_id) UNIQUE ya cubre, pero
--     puede no usarse por el planner si MySQL prefiere idx_us_obra_bodega
--     (cardinalidad mayor en obra).
--
-- Este índice no-UNIQUE compuesto refuerza al planner para queries que
-- empiezan por item_id sin necesidad del UNIQUE constraint (más ligero
-- para SELECTs que no validan duplicados).
--
-- Riesgo: índice extra ocupa ~10-15% más espacio en disco para esta tabla.
-- Beneficio: SELECTs por item_id pasan de probable Index Range Scan a
-- Single Row Lookup, especialmente en bulk SELECT IN (item_id IN (...)).
--
-- Idempotente: PREPARE/EXECUTE con check en information_schema.
-- =============================================

SET @has_idx := (
    SELECT COUNT(*) FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'ubicaciones_stock'
      AND index_name = 'idx_us_item_obra_bodega'
);
SET @sql := IF(@has_idx = 0,
    'CREATE INDEX idx_us_item_obra_bodega ON ubicaciones_stock(item_id, obra_id, bodega_id)',
    'SELECT "idx_us_item_obra_bodega ya existe" AS msg'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
