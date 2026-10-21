-- ─────────────────────────────────────────────────────────────────────
-- 129 — Causa al resolver una diferencia de transferencia (+ ajuste de stock)
-- ─────────────────────────────────────────────────────────────────────
-- Decisión del dueño 2026-10-21: al RESOLVER una discrepancia se elige la
-- CAUSA y el sistema ajusta el stock según ella (kardex tipo 'discrepancia',
-- referencia 'transferencia'). DESCARTAR no mueve stock.
--
--   causa        → código del catálogo cerrado backend/src/config/causasDiscrepancia.js
--                  (origen_envio_de_mas | error_conteo_recepcion | perdida_en_transito |
--                   nunca_salio | llego_despues). NULL si se descartó o si se resolvió
--                  antes de esta migración.
--   ajuste_stock → JSON { ajustes: [{ obra_id, bodega_id, ubicacion_nombre, cantidad }],
--                  aviso } con lo que el sistema movió al resolver (NULL si se descartó).
--
-- Sin estas columnas, PUT /discrepancias/:id/resolver responde 409 MIGRACION_PENDIENTE.
-- Reglas: docs/reglas/inventario-transferencias.md § Discrepancias.
--
-- Idempotente: ADD COLUMN IF NOT EXISTS (sintaxis MariaDB, mismo criterio que mig 060/078).

ALTER TABLE transferencia_discrepancias
  ADD COLUMN IF NOT EXISTS causa VARCHAR(40) NULL;

ALTER TABLE transferencia_discrepancias
  ADD COLUMN IF NOT EXISTS ajuste_stock TEXT NULL;
