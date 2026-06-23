-- =============================================
-- 089 — Leasing por vehículo
-- =============================================
-- Marca si un vehículo está en leasing (arriendo financiero: la entidad
-- financiera sigue siendo la dueña legal hasta el final del contrato, no es
-- un activo propio de la empresa). Se ingresa con un checkbox en el formulario
-- de vehículos (Maestro) y se muestra como distintivo en el listado.
-- Idempotente: ADD COLUMN IF NOT EXISTS (mismo patrón que mig 066/086).

ALTER TABLE vehiculos
    ADD COLUMN IF NOT EXISTS es_leasing BOOLEAN NOT NULL DEFAULT FALSE
        COMMENT 'TRUE si el vehiculo esta en leasing (arriendo financiero, no es propio).';
