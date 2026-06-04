-- 072 — Agrega 'periodicidad_anios' a vehiculo_revisiones
-- Guarda cada cuántos años corresponde la próxima revisión (1, 2 ó 3),
-- según si el vehículo es nuevo o usado. Permite recalcular el vencimiento.
-- Idempotente: ADD COLUMN IF NOT EXISTS.

ALTER TABLE vehiculo_revisiones
    ADD COLUMN IF NOT EXISTS periodicidad_anios TINYINT NULL
        COMMENT 'Periodicidad de la revisión en años (1, 2 ó 3) según vehículo nuevo/usado'
        AFTER fecha_vencimiento;
