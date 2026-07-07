-- =============================================
-- 096 — Tipo de trabajo (bomba de hormigón)
-- =============================================
-- Texto libre para describir el tipo de trabajo del bombeo (ej. "Coronación
-- tapa", "Radier", "Losa piso 3"). Es lo primero que el jefe de obra especifica
-- en el mensaje diario de WhatsApp, después de obra y fecha.
-- Idempotente: ADD COLUMN IF NOT EXISTS (mismo patrón que mig 091/092/093).

ALTER TABLE registro_bombas_hormigon
    ADD COLUMN IF NOT EXISTS tipo_trabajo VARCHAR(255) NULL AFTER fecha;
