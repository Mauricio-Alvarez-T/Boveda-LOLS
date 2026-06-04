-- =============================================
-- Migración 070: Aprobación rica de Solicitud de Materiales (items custom)
-- =============================================
-- El flujo "Solicitud de Materiales" (tipo_flujo='solicitud_materiales') usa
-- transferencia_items_custom (ítems "a comprar", fuera de catálogo). Hasta ahora
-- la aprobación era binaria. Estas columnas permiten que el aprobador ajuste
-- cantidades, quite/rechace ítems, edite descripción/unidad, agregue ítems y
-- deje una nota por ítem.
--
-- Idempotente: ADD COLUMN IF NOT EXISTS. No toca permisos ni roles.

ALTER TABLE transferencia_items_custom
  ADD COLUMN IF NOT EXISTS cantidad_aprobada DECIMAL(12,4) NULL
    COMMENT 'Cantidad que aprobó el aprobador (NULL hasta aprobar; default = cantidad solicitada).',
  ADD COLUMN IF NOT EXISTS aprobado BOOLEAN NOT NULL DEFAULT TRUE
    COMMENT 'FALSE = el aprobador quitó/rechazó el ítem (no se compra).',
  ADD COLUMN IF NOT EXISTS nota_aprobador TEXT NULL
    COMMENT 'Observación del aprobador para este ítem.',
  ADD COLUMN IF NOT EXISTS agregado_por_aprobador BOOLEAN NOT NULL DEFAULT FALSE
    COMMENT 'TRUE = ítem agregado por el aprobador durante la aprobación (no lo pidió la obra).';
