-- =============================================
-- SGDL - Migración 005: Asistencia v2
-- Nuevas tablas: estados_asistencia, configuracion_horarios
-- Alter: asistencias (estado_id FK, campos de horario)
-- =============================================

-- 1. Tabla de estados de asistencia (dinámica, no ENUM)
CREATE TABLE IF NOT EXISTS estados_asistencia (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL UNIQUE,
    codigo VARCHAR(10) NOT NULL UNIQUE,
    color VARCHAR(7) NOT NULL DEFAULT '#34C759',
    es_presente BOOLEAN NOT NULL DEFAULT FALSE,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seeds: Estados predeterminados
INSERT INTO estados_asistencia (nombre, codigo, color, es_presente) VALUES
    ('Presente',   'P',   '#34C759', TRUE),
    ('Ausente',    'A',   '#FF3B30', FALSE),
    ('Atraso',     'AT',  '#FF9F0A', TRUE),
    ('Licencia',   'LM',  '#5856D6', FALSE),
    ('1/2 Día',    '1/2', '#AF52DE', TRUE),
    ('Vacaciones', 'V',   '#007AFF', FALSE),
    ('Permiso',    'PR',  '#64D2FF', FALSE),
    ('Traslado',   'TO',  '#30D158', TRUE);

-- 2. Agregar estado_id a asistencias y migrar datos
ALTER TABLE asistencias
    ADD COLUMN estado_id INT NULL AFTER fecha,
    ADD COLUMN hora_entrada TIME NULL,
    ADD COLUMN hora_salida TIME NULL,
    ADD COLUMN hora_colacion_inicio TIME NULL,
    ADD COLUMN hora_colacion_fin TIME NULL,
    ADD COLUMN horas_extra DECIMAL(4,2) NOT NULL DEFAULT 0.00,
    ADD COLUMN es_sabado BOOLEAN NOT NULL DEFAULT FALSE;

-- Migrar datos existentes del campo estado ENUM al nuevo estado_id
UPDATE asistencias SET estado_id = (SELECT id FROM estados_asistencia WHERE codigo = 'P') WHERE estado = 'presente';
UPDATE asistencias SET estado_id = (SELECT id FROM estados_asistencia WHERE codigo = 'A') WHERE estado = 'ausente';
UPDATE asistencias SET estado_id = (SELECT id FROM estados_asistencia WHERE codigo = 'AT') WHERE estado = 'tardanza';
-- Default para cualquier otro valor
UPDATE asistencias SET estado_id = (SELECT id FROM estados_asistencia WHERE codigo = 'P') WHERE estado_id IS NULL;

-- Hacer estado_id NOT NULL y agregar FK
ALTER TABLE asistencias
    MODIFY COLUMN estado_id INT NOT NULL,
    ADD CONSTRAINT fk_asistencias_estado FOREIGN KEY (estado_id) REFERENCES estados_asistencia(id) ON DELETE RESTRICT ON UPDATE CASCADE;

-- Eliminar la columna vieja de ENUM
ALTER TABLE asistencias DROP COLUMN estado;

-- 3. Tabla de configuración de horarios por obra
CREATE TABLE IF NOT EXISTS configuracion_horarios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    obra_id INT NOT NULL,
    dia_semana ENUM('lun','mar','mie','jue','vie','sab') NOT NULL,
    hora_entrada TIME NOT NULL DEFAULT '08:00:00',
    hora_salida TIME NOT NULL DEFAULT '18:00:00',
    colacion_minutos INT NOT NULL DEFAULT 60,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_config_horarios_obra FOREIGN KEY (obra_id) REFERENCES obras(id) ON DELETE CASCADE ON UPDATE CASCADE,
    UNIQUE KEY uk_horario_obra_dia (obra_id, dia_semana)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Índices
CREATE INDEX idx_estados_asistencia_activo ON estados_asistencia(activo);
CREATE INDEX idx_asistencias_estado_id ON asistencias(estado_id);
CREATE INDEX idx_config_horarios_obra ON configuracion_horarios(obra_id);
