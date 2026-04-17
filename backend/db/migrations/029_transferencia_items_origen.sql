-- 029: permitir que cada ítem de una transferencia tenga su propio origen
-- Antes: todas las piezas de una transferencia salían de la misma obra/bodega
-- (columnas origen_* en `transferencias`).
-- Ahora: cada fila de transferencia_items guarda su origen. Las columnas de
-- cabecera quedan como "origen principal" para compatibilidad de listados/UI.

ALTER TABLE transferencia_items
    ADD COLUMN IF NOT EXISTS origen_obra_id INT DEFAULT NULL
        COMMENT 'Origen específico de este ítem (obra). NULL hasta la aprobación.';

ALTER TABLE transferencia_items
    ADD COLUMN IF NOT EXISTS origen_bodega_id INT DEFAULT NULL
        COMMENT 'Origen específico de este ítem (bodega). NULL hasta la aprobación.';

-- Backfill: para transferencias ya aprobadas/recibidas, copiar el origen
-- de cabecera a cada ítem (sólo si el ítem no tiene origen aún).
UPDATE transferencia_items ti
JOIN transferencias t ON ti.transferencia_id = t.id
SET ti.origen_obra_id = t.origen_obra_id,
    ti.origen_bodega_id = t.origen_bodega_id
WHERE ti.origen_obra_id IS NULL
  AND ti.origen_bodega_id IS NULL
  AND (t.origen_obra_id IS NOT NULL OR t.origen_bodega_id IS NOT NULL);

-- Índices para queries de reversion por origen.
-- Nota: no agregamos FK formal para mantener la migración idempotente con
-- el runner (mysql2 sin DELIMITER). La integridad se valida desde el service.
CREATE INDEX IF NOT EXISTS idx_trfi_origen_obra ON transferencia_items(origen_obra_id);
CREATE INDEX IF NOT EXISTS idx_trfi_origen_bodega ON transferencia_items(origen_bodega_id);
