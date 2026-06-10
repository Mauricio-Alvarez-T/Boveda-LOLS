-- ─────────────────────────────────────────────────────────────────────
-- 075 — Participación por apartado (obras y bodegas)
-- ─────────────────────────────────────────────────────────────────────
-- Flags por ubicación para habilitar/deshabilitar su visibilidad y uso en
-- módulos específicos, controlados con botones toggle en Configuración.
-- Mirror del patrón obras.participa_inventario (mig 026): el flag FILTRA los
-- selectores/listas del módulo (oculta de la vista + no seleccionable para uso
-- nuevo); NO cascadea ni borra registros existentes.
--
-- Default TRUE / NOT NULL: ninguna obra/bodega existente cambia de comportamiento.
-- Idempotente: ADD COLUMN IF NOT EXISTS (mismo patrón que mig 074 / 066 / 026).

ALTER TABLE obras
  ADD COLUMN IF NOT EXISTS participa_asistencia BOOLEAN NOT NULL DEFAULT TRUE
  COMMENT 'Si FALSE, la obra no aparece en el selector propio del módulo Asistencia.';

ALTER TABLE obras
  ADD COLUMN IF NOT EXISTS participa_transferencias BOOLEAN NOT NULL DEFAULT TRUE
  COMMENT 'Si FALSE, la obra no aparece como origen/destino en Transferencias.';

ALTER TABLE obras
  ADD COLUMN IF NOT EXISTS participa_bombas BOOLEAN NOT NULL DEFAULT TRUE
  COMMENT 'Si FALSE, la obra no aparece en selectores/filtros de Bombas de Hormigón.';

ALTER TABLE bodegas
  ADD COLUMN IF NOT EXISTS participa_inventario BOOLEAN NOT NULL DEFAULT TRUE
  COMMENT 'Si FALSE, la bodega no aparece en listados/selectores del módulo Inventario.';

ALTER TABLE bodegas
  ADD COLUMN IF NOT EXISTS participa_transferencias BOOLEAN NOT NULL DEFAULT TRUE
  COMMENT 'Si FALSE, la bodega no aparece como origen/destino en Transferencias.';
