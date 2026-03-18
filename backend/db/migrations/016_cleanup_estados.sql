-- Migration 016: Limpieza de Estados de Asistencia (Requerimientos RRHH)
-- Fecha: 2026-03-18
-- Objetivo: Desactivar estados obsoletos y asegurar existencia de PL

-- 1. Desactivar AT (Atraso) — absorbido por JI (Jornada Incompleta)
UPDATE estados_asistencia SET activo = 0 WHERE codigo = 'AT';

-- 2. Desactivar AL (Accidente Laboral) — eliminado del sistema por RRHH
UPDATE estados_asistencia SET activo = 0 WHERE codigo = 'AL';

-- 3. Desactivar DF (Defunción), NC (Nacimiento), MT (Matrimonio) — absorbidos por PL
UPDATE estados_asistencia SET activo = 0 WHERE codigo IN ('DF', 'NC', 'MT');

-- 4. Asegurar que PL (Permisos Legales) existe y está activo
-- Si ya existe, activarlo. Si no existe, crearlo.
INSERT INTO estados_asistencia (nombre, codigo, color, es_presente, activo)
VALUES ('Permisos Legales', 'PL', '#9B59B6', 0, 1)
ON DUPLICATE KEY UPDATE activo = 1, nombre = 'Permisos Legales';

-- Verificación: Los estados activos después de esta migración deberían ser:
-- A (Asiste), F (Falta), JI (Jornada Incompleta), TO (Traslado de Obra),
-- V (Vacaciones), LM (Licencia Médica), PL (Permisos Legales), PSG (Permiso sin goce)
