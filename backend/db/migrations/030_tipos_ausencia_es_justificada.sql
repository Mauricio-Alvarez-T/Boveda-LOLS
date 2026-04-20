-- =============================================
-- SGDL - Migración 030: tipos_ausencia.es_justificada
-- Añade la columna es_justificada a tipos_ausencia (idempotente).
-- Frontend y seeds ya la asumían, pero 004_asistencia.sql nunca la creó.
-- =============================================

DROP PROCEDURE IF EXISTS sgdl_add_es_justificada;

DELIMITER $$
CREATE PROCEDURE sgdl_add_es_justificada()
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'tipos_ausencia'
          AND COLUMN_NAME = 'es_justificada'
    ) THEN
        ALTER TABLE tipos_ausencia
            ADD COLUMN es_justificada BOOLEAN NOT NULL DEFAULT FALSE AFTER nombre;
    END IF;
END$$
DELIMITER ;

CALL sgdl_add_es_justificada();
DROP PROCEDURE sgdl_add_es_justificada;

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
