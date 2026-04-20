-- =============================================
-- SGDL - Migración 030: tipos_ausencia.es_justificada
-- Añade la columna es_justificada a tipos_ausencia (idempotente).
-- Frontend y seeds ya la asumían, pero 004_asistencia.sql nunca la creó.
--
-- NOTA: La versión anterior usaba DELIMITER + CREATE PROCEDURE, pero el runner
-- envía el archivo completo al driver mysql2, que NO entiende DELIMITER
-- (es una directiva del cliente mysql CLI). Reescrito con PREPARE/EXECUTE
-- + check en information_schema, mismo patrón que 031.
-- =============================================

SET @col_exists := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'tipos_ausencia'
      AND COLUMN_NAME = 'es_justificada'
);

SET @sql := IF(@col_exists = 0,
    'ALTER TABLE tipos_ausencia ADD COLUMN es_justificada BOOLEAN NOT NULL DEFAULT FALSE AFTER nombre',
    'SELECT "tipos_ausencia.es_justificada ya existe" AS msg'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Marcar como justificadas los tipos que el negocio considera con goce / legítimos.
-- (Falta Injustificada queda en FALSE por definición.)
UPDATE tipos_ausencia SET es_justificada = TRUE
WHERE nombre IN (
    'Vacaciones',
    'Licencia Médica',
    'Permiso con Goce de Sueldo',
    'Día Administrativo',
    'Licencia por Accidente Laboral'
);
