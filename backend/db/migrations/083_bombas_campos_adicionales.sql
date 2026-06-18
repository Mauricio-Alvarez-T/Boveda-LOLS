-- =============================================
-- 083 — Campos adicionales en registros de bomba de hormigón
-- =============================================
-- Agrega al registro de uso de bomba: hora de inicio, toma de muestras (sí/no),
-- traslado de bombas (sí/no) y cantidad de vibradores. Todos opcionales.
-- Idempotente: ADD COLUMN IF NOT EXISTS.

ALTER TABLE registro_bombas_hormigon
    ADD COLUMN IF NOT EXISTS hora_inicio     TIME       NULL              AFTER tipo_bomba,
    ADD COLUMN IF NOT EXISTS toma_muestras   TINYINT(1) NOT NULL DEFAULT 0 AFTER hora_inicio,
    ADD COLUMN IF NOT EXISTS traslado_bombas TINYINT(1) NOT NULL DEFAULT 0 AFTER toma_muestras,
    ADD COLUMN IF NOT EXISTS vibradores      INT        NULL DEFAULT 0    AFTER traslado_bombas;
