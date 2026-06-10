-- =============================================
-- Migración 071: Origen por ítem en Solicitud de Materiales
-- =============================================
-- El aprobador marca, por ítem custom, cómo se obtiene el material:
--   · 'comprar' (default) — se tramita compra.
--   · 'obra'              — se trae de sobrantes de otra obra (origen_obra_id).
-- Es SOLO indicación (no mueve stock; estos ítems están fuera de catálogo).
-- La nota libre del origen reusa nota_aprobador (migración 070).
--
-- Idempotente: ADD COLUMN IF NOT EXISTS.

ALTER TABLE transferencia_items_custom
  ADD COLUMN IF NOT EXISTS fuente VARCHAR(20) NOT NULL DEFAULT 'comprar'
    COMMENT 'Cómo se obtiene el ítem: comprar | obra (traer sobrante de otra obra).',
  ADD COLUMN IF NOT EXISTS origen_obra_id INT NULL
    COMMENT 'Obra de origen del sobrante cuando fuente=obra (solo indicación, sin FK estricta).';
