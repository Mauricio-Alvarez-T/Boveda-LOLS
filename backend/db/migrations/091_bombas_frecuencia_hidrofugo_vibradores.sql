-- =============================================
-- 091 — Frecuencia, hidrófugo y origen de vibradores (bomba de hormigón)
-- =============================================
-- Agrega al registro de uso de bomba de hormigón:
--   · frecuencia:        texto libre.
--   · hidrofugo:         SÍ/NO (aditivo impermeabilizante).
--   · vibradores_origen: de dónde salen los vibradores ("Arriendo" / "De la casa").
--     (Reemplaza en la UI al antiguo conteo `vibradores`, que se conserva en BD.)
-- Idempotente: ADD COLUMN IF NOT EXISTS (mismo patrón que mig 083/090).

ALTER TABLE registro_bombas_hormigon
    ADD COLUMN IF NOT EXISTS frecuencia        VARCHAR(255) NULL              AFTER cantidad_m3,
    ADD COLUMN IF NOT EXISTS hidrofugo         TINYINT(1)   NOT NULL DEFAULT 0 AFTER frecuencia,
    ADD COLUMN IF NOT EXISTS vibradores_origen VARCHAR(30)  NULL              AFTER hidrofugo;
