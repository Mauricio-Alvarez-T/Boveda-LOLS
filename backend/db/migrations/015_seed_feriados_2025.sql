INSERT INTO feriados (fecha, nombre, tipo, irrenunciable) VALUES
('2025-01-01', 'Año Nuevo', 'nacional', 1),
('2025-04-18', 'Viernes Santo', 'nacional', 0),
('2025-04-19', 'Sábado Santo', 'nacional', 0),
('2025-05-01', 'Día del Trabajo', 'nacional', 1),
('2025-05-21', 'Día de las Glorias Navales', 'nacional', 0),
('2025-06-29', 'San Pedro y San Pablo', 'nacional', 0),
('2025-07-16', 'Día de la Virgen del Carmen', 'nacional', 0),
('2025-08-15', 'Asunción de la Virgen', 'nacional', 0),
('2025-09-18', 'Independencia Nacional', 'nacional', 1),
('2025-09-19', 'Glorias del Ejército', 'nacional', 1),
('2025-10-12', 'Encuentro de Dos Mundos', 'nacional', 0),
('2025-10-31', 'Día de las Iglesias Evangélicas y Protestantes', 'nacional', 0),
('2025-11-01', 'Día de Todos los Santos', 'nacional', 0),
('2025-12-08', 'Inmaculada Concepción', 'nacional', 0),
('2025-12-25', 'Navidad', 'nacional', 1)
ON DUPLICATE KEY UPDATE nombre = VALUES(nombre), tipo = VALUES(tipo), irrenunciable = VALUES(irrenunciable);
