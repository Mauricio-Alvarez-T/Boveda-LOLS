-- =============================================
-- Migración 054: DECIMAL(12,4) en cantidad — tablas olvidadas por mig 052
-- =============================================
-- Mig 052 normalizó `cantidad` a DECIMAL(12,4) en ubicaciones_stock,
-- transferencia_items, transferencia_discrepancias, transferencia_item_origenes,
-- transferencia_recepcion_items y discrepancias_inventario.
--
-- Omitió dos tablas con la misma semántica:
--   - factura_items.cantidad (INT) — facturas de compra de inventario
--   - transferencia_items_custom.cantidad (INT) — ítems libres en
--     transferencias (fuera de catálogo, p.ej. "comprar X")
--
-- Riesgo: facturas con fracciones (1.5 m² de malla, 0.25 ton de fierro) se
-- truncan silenciosamente al INSERT. Items custom heredan el mismo problema.
--
-- Idempotente: ALTER MODIFY DECIMAL → DECIMAL es no-op en MariaDB/MySQL 8.
-- Los datos INT existentes se convierten automáticamente a DECIMAL sin pérdida.
-- =============================================

ALTER TABLE factura_items
    MODIFY COLUMN cantidad DECIMAL(12,4) NOT NULL DEFAULT 0;

ALTER TABLE transferencia_items_custom
    MODIFY COLUMN cantidad DECIMAL(12,4) NOT NULL DEFAULT 0;
