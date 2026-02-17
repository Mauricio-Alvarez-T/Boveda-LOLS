-- =============================================
-- SGDL - Migración 004: Asistencia y Auditoría
-- Tablas: tipos_ausencia, asistencias, log_asistencia
-- =============================================

CREATE TABLE IF NOT EXISTS tipos_ausencia (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL UNIQUE,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS asistencias (
    id INT AUTO_INCREMENT PRIMARY KEY,
    trabajador_id INT NOT NULL,
    obra_id INT NOT NULL,
    fecha DATE NOT NULL,
    estado ENUM('presente', 'ausente', 'tardanza') NOT NULL DEFAULT 'presente',
    tipo_ausencia_id INT DEFAULT NULL,
    observacion VARCHAR(500) DEFAULT NULL,
    registrado_por INT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_asistencias_trabajador FOREIGN KEY (trabajador_id) REFERENCES trabajadores(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_asistencias_obra FOREIGN KEY (obra_id) REFERENCES obras(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_asistencias_tipo_ausencia FOREIGN KEY (tipo_ausencia_id) REFERENCES tipos_ausencia(id) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT fk_asistencias_registrado_por FOREIGN KEY (registrado_por) REFERENCES usuarios(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    UNIQUE KEY uk_asistencia_diaria (trabajador_id, obra_id, fecha)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS log_asistencia (
    id INT AUTO_INCREMENT PRIMARY KEY,
    asistencia_id INT NOT NULL,
    campo_modificado VARCHAR(100) NOT NULL,
    valor_anterior VARCHAR(255) DEFAULT NULL,
    valor_nuevo VARCHAR(255) DEFAULT NULL,
    modificado_por INT NOT NULL,
    fecha_modificacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_log_asistencia FOREIGN KEY (asistencia_id) REFERENCES asistencias(id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_log_modificado_por FOREIGN KEY (modificado_por) REFERENCES usuarios(id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Índices
CREATE INDEX idx_asistencias_fecha ON asistencias(fecha);
CREATE INDEX idx_asistencias_trabajador ON asistencias(trabajador_id);
CREATE INDEX idx_asistencias_obra ON asistencias(obra_id);
CREATE INDEX idx_log_asistencia_id ON log_asistencia(asistencia_id);

-- Seeds: Tipos de ausencia predeterminados
INSERT INTO tipos_ausencia (nombre) VALUES
    ('Vacaciones'),
    ('Licencia Médica'),
    ('Permiso con Goce de Sueldo'),
    ('Permiso sin Goce de Sueldo'),
    ('Día Administrativo'),
    ('Licencia por Accidente Laboral'),
    ('Falta Injustificada');
