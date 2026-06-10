-- ─────────────────────────────────────────────────────────────────────
-- 074 — Obra finalizada (concluida) + fechas de obra
-- ─────────────────────────────────────────────────────────────────────
-- Permite marcar una obra como CONCLUIDA. Cuando finalizada = TRUE, la
-- obra queda EXCLUIDA de selectores, asistencia, consultas, inventario y
-- dashboard (igual que es_prueba), pero permanece visible en la sección
-- "Obras Finalizadas" con sus datos históricos (duración, fechas, total
-- de trabajadores, desglose por cargo) y puede reactivarse.
--
-- A diferencia de es_prueba, NO se cascadea a trabajadores: el trabajador
-- sigue siendo real y normalmente ya fue trasladado a otra obra. El
-- aislamiento se aplica filtrando por la obra en las queries globales.
--
-- fecha_inicio / fecha_termino: opcionales (manual al finalizar). Si faltan,
-- el reporte las deriva de MIN/MAX de asistencias de la obra.
--
-- Default FALSE / NULL: datos existentes no se ven afectados.
-- Idempotente: ADD COLUMN IF NOT EXISTS (patrón migración 066 / 063 / 026).

ALTER TABLE obras
  ADD COLUMN IF NOT EXISTS finalizada BOOLEAN NOT NULL DEFAULT FALSE
  COMMENT 'Si TRUE, la obra concluyó: aislada de asistencia/consultas/inventario/dashboard/selectores; visible solo en "Obras Finalizadas".';

ALTER TABLE obras
  ADD COLUMN IF NOT EXISTS fecha_inicio DATE NULL
  COMMENT 'Fecha de inicio de la obra (manual; fallback a primera asistencia).';

ALTER TABLE obras
  ADD COLUMN IF NOT EXISTS fecha_termino DATE NULL
  COMMENT 'Fecha de término (se setea al finalizar; fallback a última asistencia).';
