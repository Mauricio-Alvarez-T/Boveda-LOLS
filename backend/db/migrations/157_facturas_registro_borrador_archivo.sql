-- =============================================
-- Migración 157: Facturas de inventario = REGISTRO de compras (pedido Daphne 2026-11-25)
-- =============================================
-- Desde ahora una factura NO mueve stock ni costo: es el archivo de lo comprado.
-- Lo que ya entró al stock por facturas anteriores SE QUEDA (decisión del dueño);
-- editar/anular tampoco lo revierte. Agrega:
--   · estado 'borrador' | 'registrada' → «Continuar después» guarda a medias.
--   · archivo (foto/PDF de la factura) → visible desde la ficha; la IA lo lee.
--   · factura_items.descripcion_factura → el texto tal cual viene en la factura;
--     item_id NULL solo en borradores (línea leída que aún no se vincula al catálogo).

ALTER TABLE facturas_inventario
    ADD COLUMN IF NOT EXISTS estado ENUM('borrador', 'registrada') NOT NULL DEFAULT 'registrada' AFTER id,
    ADD COLUMN IF NOT EXISTS archivo_path VARCHAR(500) NULL,
    ADD COLUMN IF NOT EXISTS archivo_nombre VARCHAR(255) NULL,
    ADD COLUMN IF NOT EXISTS archivo_mime VARCHAR(100) NULL;

-- Un borrador puede guardarse sin número, proveedor ni fecha.
ALTER TABLE facturas_inventario
    MODIFY COLUMN numero_factura VARCHAR(50) NULL,
    MODIFY COLUMN proveedor VARCHAR(255) NULL,
    MODIFY COLUMN fecha_factura DATE NULL,
    MODIFY COLUMN monto_neto DECIMAL(14,2) NOT NULL DEFAULT 0;

ALTER TABLE factura_items
    MODIFY COLUMN item_id INT NULL,
    ADD COLUMN IF NOT EXISTS descripcion_factura VARCHAR(255) NULL;
