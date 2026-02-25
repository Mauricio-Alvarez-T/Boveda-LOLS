-- =============================================
-- Migración 007: Cambio de nomenclatura de estados
-- P (Presente) → A (Asiste)
-- A (Ausente)  → F (Falta)
-- =============================================

-- Paso 1: Renombrar temporalmente 'A' (Ausente) a 'F' primero
-- para evitar conflicto de UNIQUE con el nuevo 'A' (Asiste)
UPDATE estados_asistencia SET codigo = 'F', nombre = 'Falta' WHERE codigo = 'A';

-- Paso 2: Renombrar 'P' (Presente) a 'A' (Asiste)
UPDATE estados_asistencia SET codigo = 'A', nombre = 'Asiste' WHERE codigo = 'P';
