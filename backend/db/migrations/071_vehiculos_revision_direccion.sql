-- 071 — Agrega campo 'direccion' a vehiculo_revisiones
-- Dirección física de la planta donde se realizará la revisión técnica.
-- Idempotente: ADD COLUMN IF NOT EXISTS.

ALTER TABLE vehiculo_revisiones
    ADD COLUMN IF NOT EXISTS direccion VARCHAR(300) NULL
        COMMENT 'Dirección de la planta / taller donde se realiza la revisión'
        AFTER planta;
