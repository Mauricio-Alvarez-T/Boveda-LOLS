-- 027_items_nro_item_autogenerado.sql
-- nro_item pasa de parametrico (elegido por el usuario) a autogenerado por el sistema.
-- Es solo una referencia visual — no tiene proposito matematico.
-- 1) Quitar UNIQUE de nro_item (causa de "registro duplicado" al crear items)
-- 2) Renumerar valores existentes secuencialmente por categoria para limpieza visual

-- Drop UNIQUE index (idempotente via information_schema)
SET @db := DATABASE();
SET @has_idx := (
    SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = @db
      AND TABLE_NAME = 'items_inventario'
      AND INDEX_NAME = 'nro_item'
);
SET @sql := IF(@has_idx > 0, 'ALTER TABLE items_inventario DROP INDEX nro_item', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Renumerar nro_item secuencialmente por categoria (1..N dentro de cada categoria)
SET @n := 0;
SET @last_cat := 0;
UPDATE items_inventario
SET nro_item = (
    @n := IF(@last_cat = categoria_id, @n + 1, 1)
),
    categoria_id = (@last_cat := categoria_id)
ORDER BY categoria_id ASC, id ASC;
