-- =============================================
-- 090 — Tipo de hormigón y cantidad (m³) por registro de bomba
-- =============================================
-- Agrega al registro de uso de bomba de hormigón dos datos del bombeo:
--   · tipo_hormigon: texto libre (ej. "H-30", "H-25 bombeable").
--   · cantidad_m3:   volumen bombeado en metros cúbicos.
-- Idempotente: ADD COLUMN IF NOT EXISTS (mismo patrón que mig 083).

ALTER TABLE registro_bombas_hormigon
    ADD COLUMN IF NOT EXISTS tipo_hormigon VARCHAR(255)  NULL AFTER vibradores,
    ADD COLUMN IF NOT EXISTS cantidad_m3   DECIMAL(10,2) NULL AFTER tipo_hormigon;
