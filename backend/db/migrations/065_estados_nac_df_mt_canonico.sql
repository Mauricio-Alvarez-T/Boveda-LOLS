-- =============================================
-- Migración 065: canónico NAC/DF/MT + desactivar PL
-- =============================================
-- Corrige el mismatch de nomenclatura descubierto al revisar feedback RH:
--   · Mig 013 insertó códigos DF, NC (no NAC), MT.
--   · Mig 016 desactivó DF/NC/MT y creó PL como absorbente.
--   · Mig 049 intentó UPDATE WHERE codigo IN ('NAC', 'DEF', 'MAT') → no
--     afectó filas porque esos códigos nunca existieron en BD.
--   · Backend (asistencia.service.js) y Frontend (useAttendanceExport.ts)
--     consolidan ['NAC', 'DEF', 'MAT'] → nunca matchean → bugs:
--       - Excel celdas NAC/DF/MT no suman al total
--       - WhatsApp contador PL desalineado
--       - Modal "Asignar Período" no lista NAC/DF/MT (es_presente=1)
--
-- Decisión RH (confirmada): NAC, DF, MT son estados independientes que:
--   · es_presente=0 (no estuvo físicamente — son ausencias justificadas)
--   · cuenta_dia_trabajado=1 (la empresa paga el día)
--   · activo=1 (visibles en UI)
-- PL queda desactivado (legacy). Asistencias antiguas con estado_id=PL
-- siguen en BD pero no aparecen en UI nueva.
--
-- Pattern PREPARE/EXECUTE para MySQL 5.7+/8.0+. Idempotente.
-- =============================================

-- 1. Renombrar legacy NC → NAC si existe (mig 013 creó NC).
--    Evita conflicto UNIQUE: solo renombra si NAC NO existe aún.
SET @nc_exists := (SELECT COUNT(*) FROM estados_asistencia WHERE codigo = 'NC');
SET @nac_exists := (SELECT COUNT(*) FROM estados_asistencia WHERE codigo = 'NAC');
SET @sql := IF(@nc_exists > 0 AND @nac_exists = 0,
    "UPDATE estados_asistencia SET codigo = 'NAC', nombre = 'Nacimiento' WHERE codigo = 'NC'",
    'SELECT "NC ya migrado o NAC ya existe" AS msg'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2. Si NC sigue existiendo (porque NAC ya estaba), desactivar NC para
--    consolidar en NAC. Asistencias con estado_id=NC siguen en BD.
UPDATE estados_asistencia SET activo = 0 WHERE codigo = 'NC';

-- 3. Garantizar NAC, DF, MT con flags canónicos.
--    INSERT...ON DUPLICATE KEY para idempotencia (codigo es UNIQUE).
INSERT INTO estados_asistencia (nombre, codigo, color, es_presente, cuenta_dia_trabajado, activo)
VALUES
    ('Nacimiento', 'NAC', '#F1C40F', 0, 1, 1),
    ('Defunción',  'DF',  '#34495E', 0, 1, 1),
    ('Matrimonio', 'MT',  '#E67E22', 0, 1, 1)
ON DUPLICATE KEY UPDATE
    es_presente = 0,
    cuenta_dia_trabajado = 1,
    activo = 1;

-- 4. Desactivar PL legacy. NAC/DF/MT ya cubren los casos de uso.
UPDATE estados_asistencia SET activo = 0 WHERE codigo = 'PL';

-- 5. Verificación esperada (manual post-migración):
--    SELECT codigo, es_presente, cuenta_dia_trabajado, activo
--    FROM estados_asistencia WHERE codigo IN ('NAC', 'DF', 'MT', 'PL', 'NC');
--    Esperado:
--      NAC: 0, 1, 1
--      DF:  0, 1, 1
--      MT:  0, 1, 1
--      PL:  *, *, 0
--      NC:  *, *, 0  (si existe)
