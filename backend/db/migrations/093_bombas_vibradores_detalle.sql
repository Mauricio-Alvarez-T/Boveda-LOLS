-- =============================================
-- 093 — Detalle de vibradores (bomba de hormigón)
-- =============================================
-- Texto libre para describir los vibradores del bombeo: cantidad, sonda, etc.
-- (ej. "3 vibradores con sonda de 45"). Complementa a vibradores_origen
-- (Empresa / Externa).
-- Idempotente: ADD COLUMN IF NOT EXISTS (mismo patrón que mig 091/092).

ALTER TABLE registro_bombas_hormigon
    ADD COLUMN IF NOT EXISTS vibradores_detalle VARCHAR(255) NULL AFTER vibradores_origen;
