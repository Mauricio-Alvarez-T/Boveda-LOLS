-- =============================================
-- Migración 049: estados_asistencia.cuenta_dia_trabajado
-- =============================================
-- Separa la semántica "trabajador estuvo físicamente presente" (es_presente)
-- de "el día cuenta como trabajado para nómina" (cuenta_dia_trabajado).
--
-- Antes: el Excel de nómina sumaba sólo es_presente=TRUE → vacaciones (V) y
-- permisos legales pagados (PL/NAC/DEF/MAT) NO sumaban al total de días
-- trabajados de la quincena, lo cual es incorrecto: el trabajador recibe
-- pago por esos días aunque no haya estado físicamente.
--
-- Después: el Excel suma por cuenta_dia_trabajado=TRUE.
--   · es_presente sigue usándose para presentismo, fiscalización y UI
--     (dashboard, alertas de faltas, formularios de ausencia).
--   · cuenta_dia_trabajado se usa SOLO en el reporte Excel de nómina.
--
-- Pattern PREPARE/EXECUTE para soportar MySQL 5.7 + 8.0+. Idempotente.
-- =============================================

-- 1. ADD COLUMN si no existe
SET @col_exists := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'estados_asistencia'
      AND COLUMN_NAME = 'cuenta_dia_trabajado'
);
SET @sql := IF(@col_exists = 0,
    'ALTER TABLE estados_asistencia ADD COLUMN cuenta_dia_trabajado BOOLEAN NOT NULL DEFAULT FALSE AFTER es_presente',
    'SELECT "estados_asistencia.cuenta_dia_trabajado ya existe" AS msg'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2. Seeds: marcar TRUE para los códigos que SÍ cuentan como día trabajado.
--    · A   (Asiste)            — presente real
--    · JI  (Jornada Incompleta)— presente parcial, día se cuenta entero
--    · TO  (Traslado de Obra)  — día de viaje, se paga
--    · V   (Vacaciones)        — vacaciones legales, pagadas
--    · PL  (Permisos Legales)  — matrimonio/nacimiento/defunción, pagadas
--    · NAC, DEF, MAT           — códigos legacy consolidados a PL, por si
--                                aún tienen activo=1 en algún env antiguo
--
-- NO suman (cuenta_dia_trabajado=FALSE, default):
--    · F   (Falta)             — injustificada, no se paga
--    · LM  (Licencia Médica)   — la paga ISAPRE/Mutual, no la empresa
--    · PSG (Permiso sin goce)  — explícitamente sin sueldo
--    · AT  (Atraso, legacy)    — absorbido por JI, ya inactivo
--    · AL  (Accidente, legacy) — inactivo
UPDATE estados_asistencia
SET cuenta_dia_trabajado = TRUE
WHERE codigo IN ('A', 'JI', 'TO', 'V', 'PL', 'NAC', 'DEF', 'MAT');
