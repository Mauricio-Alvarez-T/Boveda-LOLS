-- ─────────────────────────────────────────────────────────────────────
-- 078 — Foto OPCIONAL en recepción y discrepancia de transferencias (Fase 3)
-- ─────────────────────────────────────────────────────────────────────
-- Permite adjuntar una foto al registrar una recepción o al documentar una
-- discrepancia. La URL es relativa y se sirve por /api/uploads/transferencias.
-- La foto es SIEMPRE opcional: el flujo de recepción nunca se bloquea por su
-- ausencia (decisión del dueño). Patrón POST-then-attach (se sube aparte).
--
-- Idempotente: ADD COLUMN IF NOT EXISTS (mismo criterio que mig 060).

ALTER TABLE transferencia_recepciones
  ADD COLUMN IF NOT EXISTS foto_url VARCHAR(255) NULL
  AFTER observacion;

ALTER TABLE transferencia_discrepancias
  ADD COLUMN IF NOT EXISTS foto_url VARCHAR(255) NULL;
