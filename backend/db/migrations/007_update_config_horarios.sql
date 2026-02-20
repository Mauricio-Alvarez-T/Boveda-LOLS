-- =============================================
-- SGDL - Migración 007: Horarios Paramétricos
-- Actualización de la tabla configuracion_horarios
-- Elimina colacion_minutos y añade horarios específicos de colación.
-- =============================================

-- 1. Añadir nuevas columnas para estructurar mejor la colación
ALTER TABLE configuracion_horarios
    ADD COLUMN hora_colacion_inicio TIME NOT NULL DEFAULT '13:00:00' AFTER hora_salida,
    ADD COLUMN hora_colacion_fin TIME NOT NULL DEFAULT '14:00:00' AFTER hora_colacion_inicio;

-- 2. Eliminar la columna antigua
ALTER TABLE configuracion_horarios
    DROP COLUMN colacion_minutos;

-- 3. Limpiar horarios antiguos si existian basuras previas para reiniciar limpiamente con los por defecto
DELETE FROM configuracion_horarios;

-- 4. Sembrar los horarios por defecto solicitados para la OBRA 1 (Y para cada obra existente, pero lo haremos via aplicacion o para la inicial)
-- Lunes a Jueves: 08:00 - 18:00 (Colacion 13:00-14:00)
-- Viernes: 08:00 - 17:00 (Colacion 13:00-14:00)
-- Sábado: 08:00 - 13:00 (Sin colación, o podemos poner 13:00-13:00 para anularlo si se desea, pero dejaremos 08:00-13:00)

INSERT INTO configuracion_horarios (obra_id, dia_semana, hora_entrada, hora_salida, hora_colacion_inicio, hora_colacion_fin) 
SELECT id, 'lun', '08:00:00', '18:00:00', '13:00:00', '14:00:00' FROM obras;

INSERT INTO configuracion_horarios (obra_id, dia_semana, hora_entrada, hora_salida, hora_colacion_inicio, hora_colacion_fin) 
SELECT id, 'mar', '08:00:00', '18:00:00', '13:00:00', '14:00:00' FROM obras;

INSERT INTO configuracion_horarios (obra_id, dia_semana, hora_entrada, hora_salida, hora_colacion_inicio, hora_colacion_fin) 
SELECT id, 'mie', '08:00:00', '18:00:00', '13:00:00', '14:00:00' FROM obras;

INSERT INTO configuracion_horarios (obra_id, dia_semana, hora_entrada, hora_salida, hora_colacion_inicio, hora_colacion_fin) 
SELECT id, 'jue', '08:00:00', '18:00:00', '13:00:00', '14:00:00' FROM obras;

INSERT INTO configuracion_horarios (obra_id, dia_semana, hora_entrada, hora_salida, hora_colacion_inicio, hora_colacion_fin) 
SELECT id, 'vie', '08:00:00', '17:00:00', '13:00:00', '14:00:00' FROM obras;

INSERT INTO configuracion_horarios (obra_id, dia_semana, hora_entrada, hora_salida, hora_colacion_inicio, hora_colacion_fin) 
SELECT id, 'sab', '08:00:00', '13:00:00', '13:00:00', '13:00:00' FROM obras;
