-- Migration 013: Mover Tipos de Ausencia a Estados de Asistencia

-- Tarea 2: Renombrar "1/2 Día" a "Jornada Incompleta (JI)"
UPDATE estados_asistencia 
SET nombre = 'Jornada Incompleta (JI)', codigo = 'JI' 
WHERE codigo = '1/2';

-- Tarea 3: Simplificar causas
-- Insertar nuevas causas como estados
-- Solo reinsertamos para asegurarnos que no choquen IDs fijos usando INSERT ... ON DUPLICATE KEY UPDATE o similar,
-- pero como esta es una tabla simple, podemos usar INSERT IGNORE basándonos en el codigo si tuviera UNIQUE.
-- Asumimos que los IDs autoincrementables no tendrán conflicto.
INSERT INTO estados_asistencia (nombre, codigo, color, es_presente, activo) VALUES 
('Accidente Laboral', 'AL', '#E74C3C', 0, 1),
('Permiso sin goce', 'PSG', '#8E44AD', 0, 1),
('Defunción', 'DF', '#34495E', 0, 1),
('Nacimiento', 'NC', '#F1C40F', 0, 1),
('Matrimonio', 'MT', '#E67E22', 0, 1);

-- También podríamos desactivar los viejos "tipos_ausencia" en la UI pero eso se hace eliminando la carga del select en react, como hicimos.
