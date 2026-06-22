-- =============================================
-- 086 — Valor (patrimonial) por vehículo
-- =============================================
-- Agrega el valor de activo de cada vehículo, para calcular el patrimonio por
-- empresa de flota (LOLS, TRANSPORTE) en el Resumen Ejecutivo del inventario.
-- El valor se ingresa por vehículo en el formulario (Maestro de vehículos).
-- Idempotente: ADD COLUMN IF NOT EXISTS (mismo patrón que mig 069/074/076).

ALTER TABLE vehiculos
    ADD COLUMN IF NOT EXISTS valor DECIMAL(12,2) NOT NULL DEFAULT 0
        COMMENT 'Valor de activo del vehículo (patrimonio). Se suma por empresa de flota.';
