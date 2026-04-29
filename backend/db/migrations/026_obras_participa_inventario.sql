-- 026_obras_participa_inventario.sql
-- Agrega flag a obras para distinguir las que participan del módulo de inventario.
-- Default TRUE: todas las obras existentes siguen apareciendo en listados de inventario
-- hasta que se marquen manualmente como "solo asistencia".

ALTER TABLE obras
    ADD COLUMN IF NOT EXISTS participa_inventario BOOLEAN NOT NULL DEFAULT TRUE
    COMMENT 'Si FALSE, la obra no aparece en selectores/listados del módulo inventario (solo asistencia, consultas, etc.)';
