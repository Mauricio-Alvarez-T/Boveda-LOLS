-- =============================================
-- SGDL - Migración 009: Configuración de Correo y Plantillas
-- =============================================

-- Agregar columna de contraseña encriptada a usuarios
ALTER TABLE usuarios
    ADD COLUMN IF NOT EXISTS email_password_enc TEXT DEFAULT NULL
    COMMENT 'Contraseña de correo corporativo encriptada con AES';

-- Tabla de plantillas de correo por usuario
CREATE TABLE IF NOT EXISTS plantillas_correo (
    id INT AUTO_INCREMENT PRIMARY KEY,
    usuario_id INT NOT NULL,
    nombre VARCHAR(100) NOT NULL COMMENT 'Ej: Formal, Simple, Inspección DT',
    asunto VARCHAR(255) NOT NULL,
    cuerpo TEXT NOT NULL,
    es_predeterminada BOOLEAN NOT NULL DEFAULT FALSE,
    activa BOOLEAN NOT NULL DEFAULT TRUE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_plantillas_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_plantillas_usuario ON plantillas_correo(usuario_id);
