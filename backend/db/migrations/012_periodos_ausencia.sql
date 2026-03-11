-- =============================================
-- SGDL - Migración 012: Períodos de Ausencia
-- Tabla: periodos_ausencia
-- =============================================

CREATE TABLE IF NOT EXISTS periodos_ausencia (
    id INT AUTO_INCREMENT PRIMARY KEY,
    trabajador_id INT NOT NULL,
    obra_id INT NOT NULL,
    estado_id INT NOT NULL,
    tipo_ausencia_id INT DEFAULT NULL,
    fecha_inicio DATE NOT NULL,
    fecha_fin DATE NOT NULL,
    observacion VARCHAR(500) DEFAULT NULL,
    creado_por INT NOT NULL,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_periodo_trabajador FOREIGN KEY (trabajador_id) REFERENCES trabajadores(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_periodo_obra FOREIGN KEY (obra_id) REFERENCES obras(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_periodo_estado FOREIGN KEY (estado_id) REFERENCES estados_asistencia(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_periodo_tipo_ausencia FOREIGN KEY (tipo_ausencia_id) REFERENCES tipos_ausencia(id) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT fk_periodo_creado_por FOREIGN KEY (creado_por) REFERENCES usuarios(id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Índices
CREATE INDEX idx_periodo_trabajador ON periodos_ausencia(trabajador_id);
CREATE INDEX idx_periodo_obra ON periodos_ausencia(obra_id);
CREATE INDEX idx_periodo_fechas ON periodos_ausencia(fecha_inicio, fecha_fin);
CREATE INDEX idx_periodo_activo ON periodos_ausencia(activo);
