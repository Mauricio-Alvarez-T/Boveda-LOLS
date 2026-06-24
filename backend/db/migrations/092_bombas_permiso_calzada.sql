-- =============================================
-- 092 — Permiso de la calzada (bomba de hormigón)
-- =============================================
-- Agrega al registro de uso de bomba de hormigón el flag SÍ/NO de si se contaba
-- con permiso para ocupar la calzada (vía pública) durante el bombeo.
-- Idempotente: ADD COLUMN IF NOT EXISTS (mismo patrón que mig 083/090/091).

ALTER TABLE registro_bombas_hormigon
    ADD COLUMN IF NOT EXISTS permiso_calzada TINYINT(1) NOT NULL DEFAULT 0 AFTER vibradores_origen;
