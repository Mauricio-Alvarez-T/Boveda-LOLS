-- ─────────────────────────────────────────────────────────────────────
-- 060 — Campo texto libre para responsable de bodega
-- ─────────────────────────────────────────────────────────────────────
-- Requerimiento B.6 del documento de validación: cada bodega debe tener
-- un responsable asignado. Como por ahora NO existe un rol/usuario "jefe
-- de bodega" en el sistema, se opta por un campo de texto libre
-- (no FK) que el admin pueda editar manualmente.
--
-- La columna `responsable_id` (FK a usuarios) queda en la DB para
-- compatibilidad, pero deja de usarse — el backend ya no hace JOIN.
--
-- Idempotente: ADD COLUMN IF NOT EXISTS + UPDATE condicional.

-- 1. Agregar columna texto libre
ALTER TABLE bodegas
  ADD COLUMN IF NOT EXISTS responsable_nombre VARCHAR(255) NULL
  AFTER responsable_id;

-- 2. Backfill: si alguna bodega tenía FK asignada, copiar el nombre del
-- usuario referenciado a la nueva columna texto. Solo si la columna
-- texto sigue vacía (no pisa ediciones manuales posteriores).
UPDATE bodegas b
LEFT JOIN usuarios u ON u.id = b.responsable_id
SET b.responsable_nombre = u.nombre
WHERE b.responsable_id IS NOT NULL
  AND (b.responsable_nombre IS NULL OR b.responsable_nombre = '');
