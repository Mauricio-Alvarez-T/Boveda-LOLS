-- 023: Add imagen_url column to items_inventario
ALTER TABLE items_inventario
ADD COLUMN imagen_url VARCHAR(500) NULL DEFAULT NULL AFTER unidad;
