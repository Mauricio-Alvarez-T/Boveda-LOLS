-- Tabla para registrar actividad del sistema (Auditoría)
CREATE TABLE IF NOT EXISTS logs_actividad (
    id INT AUTO_INCREMENT PRIMARY KEY,
    usuario_id INT NULL,
    modulo VARCHAR(50) NOT NULL,
    accion ENUM('CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'UPLOAD', 'EMAIL') NOT NULL,
    item_id VARCHAR(50) NULL,
    detalle TEXT NULL,
    ip VARCHAR(45) NULL,
    user_agent TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
);

-- Indexar para búsquedas rápidas en auditoría
CREATE INDEX idx_logs_created_at ON logs_actividad(created_at);
CREATE INDEX idx_logs_modulo ON logs_actividad(modulo);
CREATE INDEX idx_logs_usuario ON logs_actividad(usuario_id);
