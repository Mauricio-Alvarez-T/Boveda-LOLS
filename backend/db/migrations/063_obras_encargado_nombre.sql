-- ─────────────────────────────────────────────────────────────────────
-- 063 — Campo texto libre para encargado de obra (inventario)
-- ─────────────────────────────────────────────────────────────────────
-- Punto 57 del checklist: en las obras de inventario se debe poder registrar
-- quién es el encargado que generalmente solicita material. Igual que el
-- responsable de bodega (migración 060), se usa un campo de texto libre
-- (no FK) que el admin edita manualmente — no existe aún un rol formal
-- "encargado de obra" en el sistema.
--
-- Idempotente: ADD COLUMN IF NOT EXISTS (MariaDB), patrón migración 060.

ALTER TABLE obras
  ADD COLUMN IF NOT EXISTS encargado_nombre VARCHAR(255) NULL
  AFTER direccion;
