-- =============================================
-- Mig 057: dedup ubicaciones_stock + UNIQUE null-safe via generated columns
-- =============================================
-- Problema: uk_item_ubicacion(item_id, obra_id, bodega_id) UNIQUE permite
-- duplicados con NULL porque MySQL trata NULL != NULL en checks UNIQUE
-- (estándar SQL). Consecuencia: rows (item, obra=X, bodega=NULL) se
-- acumulan cada vez que factura/transferencia hace
--   INSERT INTO ubicaciones_stock ... ON DUPLICATE KEY UPDATE ...
-- El ODKU no detecta el "duplicado" (NULL != NULL) → crea row nueva en
-- lugar de actualizar la existente.
--
-- Visible en UI: items aparecen N veces en Por Obra/Bodega con cantidades
-- distintas (50, 2, 5, 4, 1 = 5 rows corruptas para mismo item+obra).
--
-- Mig 050 limpió rows "XOR-corruptas" (ambos campos no-NULL) pero NO
-- detectó este caso (XOR válido pero duplicado por NULL).
--
-- Fix de 4 pasos:
--   A) Consolidar: SUM(cantidad) GROUP BY (item, obra, bodega) en row con
--      MIN(id) — preserva la primera, suma cantidades del resto.
--   B) Borrar duplicados (todos excepto MIN(id) por tupla).
--   C) Agregar generated columns obra_uk + bodega_uk (COALESCE NULL → 0).
--   D) DROP uk_item_ubicacion antiguo. Add UNIQUE sobre cols generated —
--      ahora 2 rows con misma (item, obra, NULL) chocan correctamente
--      porque ambas tienen bodega_uk=0.
--
-- Idempotente: A y B son no-op si no hay duplicados. C y D usan
-- PREPARE/EXECUTE con check en information_schema.
-- =============================================

-- ─── A. Consolidar cantidades en row mínima (MIN id) por tupla ───
-- Para cada grupo (item, obra, bodega) con N>1 rows, UPDATE la row con
-- MIN(id) sumando cantidades del resto. override = MAX(override) prefiere
-- valor seteado sobre NULL.
UPDATE ubicaciones_stock target
JOIN (
    SELECT MIN(id) AS keeper_id,
           SUM(cantidad) AS total_cantidad,
           MAX(valor_arriendo_override) AS keeper_override
    FROM ubicaciones_stock
    GROUP BY item_id, obra_id, bodega_id
    HAVING COUNT(*) > 1
) src ON src.keeper_id = target.id
SET target.cantidad = src.total_cantidad,
    target.valor_arriendo_override = src.keeper_override;

-- ─── B. Borrar duplicados (todos excepto MIN(id) por tupla) ───
DELETE us FROM ubicaciones_stock us
LEFT JOIN (
    SELECT MIN(id) AS keeper_id
    FROM ubicaciones_stock
    GROUP BY item_id, obra_id, bodega_id
) keepers ON keepers.keeper_id = us.id
WHERE keepers.keeper_id IS NULL;

-- ─── C. Agregar generated columns NULL-safe (idempotente) ───
SET @has_obra_uk := (
    SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'ubicaciones_stock'
      AND column_name = 'obra_uk'
);
SET @sql := IF(@has_obra_uk = 0,
    'ALTER TABLE ubicaciones_stock
        ADD COLUMN obra_uk INT GENERATED ALWAYS AS (COALESCE(obra_id, 0)) STORED',
    'SELECT "obra_uk ya existe" AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_bodega_uk := (
    SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'ubicaciones_stock'
      AND column_name = 'bodega_uk'
);
SET @sql := IF(@has_bodega_uk = 0,
    'ALTER TABLE ubicaciones_stock
        ADD COLUMN bodega_uk INT GENERATED ALWAYS AS (COALESCE(bodega_id, 0)) STORED',
    'SELECT "bodega_uk ya existe" AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ─── D. Drop UNIQUE antiguo. Add UNIQUE null-safe ───
SET @has_old_uk := (
    SELECT COUNT(*) FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'ubicaciones_stock'
      AND index_name = 'uk_item_ubicacion'
);
SET @sql := IF(@has_old_uk > 0,
    'ALTER TABLE ubicaciones_stock DROP INDEX uk_item_ubicacion',
    'SELECT "uk_item_ubicacion ya borrado" AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_new_uk := (
    SELECT COUNT(*) FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'ubicaciones_stock'
      AND index_name = 'uk_item_ubic_norm'
);
SET @sql := IF(@has_new_uk = 0,
    'ALTER TABLE ubicaciones_stock
        ADD CONSTRAINT uk_item_ubic_norm UNIQUE (item_id, obra_uk, bodega_uk)',
    'SELECT "uk_item_ubic_norm ya existe" AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
