-- ─────────────────────────────────────────────────────────────────────
-- 079 — cantidad_recibida en ítems personalizados (Fase 4.3)
-- ─────────────────────────────────────────────────────────────────────
-- Permite registrar cuánto llegó de cada ítem personalizado (fuera de catálogo)
-- al recibir una solicitud MIXTA (catálogo + personalizados). Acumulador
-- multi-viaje, igual criterio que el catálogo. Los personalizados NO mueven stock
-- (no están en inventario), así que esto es solo seguimiento de lo recibido.
-- Idempotente: ADD COLUMN IF NOT EXISTS.

ALTER TABLE transferencia_items_custom
  ADD COLUMN IF NOT EXISTS cantidad_recibida DECIMAL(12,4) NOT NULL DEFAULT 0
  AFTER cantidad_aprobada;
