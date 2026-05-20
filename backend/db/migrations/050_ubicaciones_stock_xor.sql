-- =============================================
-- Migración 050: XOR en ubicaciones_stock (obra | bodega)
-- =============================================
-- Schema original (mig 017) permite que obra_id y bodega_id estén ambos
-- seteados o ambos NULL en la misma fila. Semánticamente una ubicación
-- es obra XOR bodega — nunca ambas, nunca ninguna.
--
-- Esta laxitud causó duplicados visibles en la vista "Por Obra/Bodega":
-- transferencia.service.js insertaba con ambos campos del request sin
-- filtrar, generando rows `(item, obra=X, bodega=Y)` que matcheaban
-- simultáneamente getStockPorObra(X) y getStockPorBodega(Y).
--
-- Esta migración:
--   1) Consolida cantidades de rows corruptas en la row obra-only.
--   2) Borra rows corruptas y huérfanas.
--   3) Agrega CHECK constraint XOR (MySQL 8.0+).
--
-- Política de consolidación: "mantener obra, descartar bodega".
-- Conservador para flujos de transferencias donde la obra es el destino real.
--
-- Idempotente: pattern PREPARE/EXECUTE como migraciones 047/049.
-- =============================================

-- ─── A. Crear row "obra-only" placeholder donde existan corruptas ───
-- INSERT con ON DUPLICATE KEY no-op: si la row (item, obra, NULL) ya existe,
-- no la toca. Si no existe, la crea con cantidad=0 para tener target del UPDATE.
INSERT INTO ubicaciones_stock (item_id, obra_id, bodega_id, cantidad, valor_arriendo_override)
SELECT DISTINCT item_id, obra_id, NULL, 0, NULL
FROM ubicaciones_stock
WHERE obra_id IS NOT NULL AND bodega_id IS NOT NULL
ON DUPLICATE KEY UPDATE cantidad = cantidad;

-- ─── B. Acumular cantidades de rows corruptas en la row obra-only ───
UPDATE ubicaciones_stock target
JOIN (
    SELECT item_id, obra_id, SUM(cantidad) AS total_corrupto
    FROM ubicaciones_stock
    WHERE obra_id IS NOT NULL AND bodega_id IS NOT NULL
    GROUP BY item_id, obra_id
) src
  ON target.item_id = src.item_id
 AND target.obra_id = src.obra_id
 AND target.bodega_id IS NULL
SET target.cantidad = target.cantidad + src.total_corrupto;

-- ─── C. Borrar rows corruptas (obra + bodega ambos seteados) ───
DELETE FROM ubicaciones_stock
WHERE obra_id IS NOT NULL AND bodega_id IS NOT NULL;

-- ─── D. Borrar rows huérfanas (ambos NULL) ───
DELETE FROM ubicaciones_stock
WHERE obra_id IS NULL AND bodega_id IS NULL;

-- ─── E. CHECK constraint XOR (MySQL 8.0+) ───
-- En MySQL 5.7 los CHECK se parsean pero no se enforce; la BD productiva
-- de cPanel es MySQL 8.x. Pattern PREPARE/EXECUTE para no fallar si el
-- constraint ya existe.
SET @constraint_exists := (
    SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'ubicaciones_stock'
      AND CONSTRAINT_NAME = 'chk_ubicacion_xor'
);
SET @sql := IF(@constraint_exists = 0,
    'ALTER TABLE ubicaciones_stock ADD CONSTRAINT chk_ubicacion_xor CHECK ((obra_id IS NULL) <> (bodega_id IS NULL))',
    'SELECT "chk_ubicacion_xor ya existe" AS msg'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
