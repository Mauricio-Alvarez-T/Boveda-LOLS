-- ─────────────────────────────────────────────────────────────────────
-- 066 — Bandera de aislamiento "es_prueba" (obras + trabajadores)
-- ─────────────────────────────────────────────────────────────────────
-- Permite marcar obras y trabajadores como datos de PRUEBA. Cuando
-- es_prueba = TRUE, la entidad queda EXCLUIDA de toda vista operativa,
-- reporte, agregado, inventario, KPI de dashboard, listado de asistencia
-- y selector. Solo permanece visible en superficies de administración
-- (Configuración → Obras; formulario de trabajador) para poder revertir
-- el aislamiento, mostrada con un badge "PRUEBA".
--
-- Cascada (aplicada en backend, no en SQL): aislar una obra arrastra a
-- sus trabajadores; des-aislarla los revierte.
--
-- Default FALSE: los datos existentes NO se ven afectados (siguen
-- participando en todo, como antes).
--
-- Idempotente: ADD COLUMN IF NOT EXISTS (patrón migración 063 / 026).

ALTER TABLE obras
  ADD COLUMN IF NOT EXISTS es_prueba BOOLEAN NOT NULL DEFAULT FALSE
  COMMENT 'Si TRUE, la obra (y sus trabajadores) quedan aislados de reportes/inventario/dashboard/asistencia/selectores. Solo visibles en administración.';

ALTER TABLE trabajadores
  ADD COLUMN IF NOT EXISTS es_prueba BOOLEAN NOT NULL DEFAULT FALSE
  COMMENT 'Si TRUE, el trabajador queda aislado de reportes/dashboard/asistencia/consultas operativas. Solo visible en administración.';
