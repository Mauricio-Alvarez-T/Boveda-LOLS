-- =============================================
-- 156 — Desde qué día pasa lista cada obra
-- =============================================
-- Marcos 2026-11-20: BASCUÑAN 991 se creó hace más de un mes para Inventario y hormigón, pero recién el lunes 16 se
-- empezó a pasar asistencia; el Inicio la mostraba en rojo desde octubre. «La fecha de creación o de inicio de una obra
-- no necesariamente va a coincidir con la fecha en que comienza a pasarse asistencia en ella». Eligió la opción 1:
-- cada obra guarda desde qué día pasa lista.
--
-- `asistencia_desde` (con `participa_asistencia = 1`):
--   NULL  → «En preparación»: la obra existe (Inventario, hormigón) pero aún no pasa lista; no avisa días sin lista.
--   fecha → «Pasa lista desde» ese día: desde ahí, un día hábil sin lista avisa (Inicio, campana, recordatorio).
-- El día que se guarda la primera lista de una obra en preparación, el servidor pone esa fecha solo
-- (asistencia.service). Se corrige a mano en Configuración → Obras (botón «Asis») o desde el Inicio.
--
-- Obras que ya existen: la fecha de su primera lista propia (sin contar las filas que escriben solas las licencias y
-- vacaciones). Las que nunca guardaron una lista quedan «En preparación».
-- Idempotente: ADD COLUMN IF NOT EXISTS; el UPDATE solo llena las que siguen vacías.

ALTER TABLE obras
  ADD COLUMN IF NOT EXISTS asistencia_desde DATE NULL DEFAULT NULL
  COMMENT 'Desde qué día pasa lista la obra. NULL = en preparación (aún no pasa lista).'
  AFTER participa_asistencia;

UPDATE obras o
SET o.asistencia_desde = (
    SELECT MIN(a.fecha)
    FROM asistencias a
    WHERE a.obra_id = o.id
      AND NOT EXISTS (
          SELECT 1 FROM periodos_ausencia p
          WHERE p.trabajador_id = a.trabajador_id AND p.activo = 1
            AND p.fecha_inicio <= a.fecha AND p.fecha_fin >= a.fecha)
)
WHERE o.asistencia_desde IS NULL;
