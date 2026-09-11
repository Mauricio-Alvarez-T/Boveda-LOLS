-- ============================================================================
-- 113_desvinculaciones_antecedente_rut.sql — El antecedente "No recontratar" sobrevive a la depuración
-- Fecha: 2026-09-11 (plan Gestiones, B4 — ajuste tras QA del dueño en staging)
--
-- HALLAZGO DE QA: al DEPURAR (hard-delete) a un trabajador marcado "No recontratar", la FK
-- ON DELETE CASCADE de la mig 112 borraba también su historial de desvinculación y el RUT
-- volvía a aparecer como "disponible" sin ningún aviso — se perdía justo el antecedente que
-- el requerimiento 7 quiere conservar.
--
-- DECISIÓN DEL DUEÑO (2026-09-11): conservar el antecedente por RUT. Depurar sigue borrando la
-- ficha, los documentos y la asistencia, pero el historial de desvinculaciones queda con
-- `trabajador_id = NULL`, `rut_normalized` y `nombre_snapshot`: ambos check-rut (Crear trabajador
-- y Nuevo ingreso) muestran "RUT disponible, pero corresponde a un trabajador depurado,
-- desvinculado el … · causal · marcado NO recontratar". Sigue siendo SOLO un aviso.
--
-- CAMBIOS (idempotentes):
--   1. +rut_normalized (sin puntos ni guion, mayúsculas — mismo formato que trabajadores.rut_normalized)
--      +nombre_snapshot (nombre al momento de la baja). ADD COLUMN IF NOT EXISTS.
--   2. trabajador_id pasa a NULL (MODIFY, idempotente).
--   3. FK fk_trab_desv_trabajador: CASCADE → SET NULL. DROP FOREIGN KEY IF EXISTS + ADD: el par es
--      idempotente (tras el DROP la constraint siempre está ausente).
--   4. Índice por rut_normalized (CREATE INDEX IF NOT EXISTS).
--   5. Backfill de las filas existentes desde trabajadores (solo donde rut_normalized IS NULL).
-- ============================================================================

ALTER TABLE trabajador_desvinculaciones
  ADD COLUMN IF NOT EXISTS rut_normalized VARCHAR(12) NULL COMMENT 'RUT sin puntos/guion, mayúsculas; sobrevive a la depuración del trabajador',
  ADD COLUMN IF NOT EXISTS nombre_snapshot VARCHAR(255) NULL COMMENT 'Nombre al momento de la baja (aviso cuando la ficha ya no existe)';

ALTER TABLE trabajador_desvinculaciones
  MODIFY trabajador_id INT NULL COMMENT 'NULL = trabajador depurado; el antecedente se conserva por rut_normalized';

CREATE INDEX IF NOT EXISTS idx_trab_desv_rut ON trabajador_desvinculaciones (rut_normalized);

ALTER TABLE trabajador_desvinculaciones DROP FOREIGN KEY IF EXISTS fk_trab_desv_trabajador;
ALTER TABLE trabajador_desvinculaciones
  ADD CONSTRAINT fk_trab_desv_trabajador FOREIGN KEY (trabajador_id) REFERENCES trabajadores(id) ON DELETE SET NULL;

UPDATE trabajador_desvinculaciones d
  JOIN trabajadores t ON t.id = d.trabajador_id
   SET d.rut_normalized = t.rut_normalized,
       d.nombre_snapshot = TRIM(CONCAT_WS(' ', t.apellido_paterno, t.apellido_materno, t.nombres))
 WHERE d.rut_normalized IS NULL;
