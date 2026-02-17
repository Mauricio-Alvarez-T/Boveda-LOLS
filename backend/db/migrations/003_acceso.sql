-- =============================================
-- SGDL - Migración 003: Control de Acceso (RBAC)
-- Tablas: roles, permisos_rol, usuarios
-- =============================================

CREATE TABLE IF NOT EXISTS roles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL UNIQUE,
    descripcion VARCHAR(255) DEFAULT NULL,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS permisos_rol (
    id INT AUTO_INCREMENT PRIMARY KEY,
    rol_id INT NOT NULL,
    modulo VARCHAR(100) NOT NULL COMMENT 'Ej: trabajadores, asistencia, documentos, obras, empresas, etc.',
    puede_ver BOOLEAN NOT NULL DEFAULT FALSE,
    puede_crear BOOLEAN NOT NULL DEFAULT FALSE,
    puede_editar BOOLEAN NOT NULL DEFAULT FALSE,
    puede_eliminar BOOLEAN NOT NULL DEFAULT FALSE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_permisos_rol FOREIGN KEY (rol_id) REFERENCES roles(id) ON DELETE CASCADE ON UPDATE CASCADE,
    UNIQUE KEY uk_rol_modulo (rol_id, modulo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS usuarios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    nombre VARCHAR(200) NOT NULL,
    rol_id INT NOT NULL,
    obra_id INT DEFAULT NULL COMMENT 'Obra asignada actualmente (NULL = oficina central)',
    email_corporativo VARCHAR(255) DEFAULT NULL COMMENT 'Email desde el cual se envían fiscalizaciones',
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_usuarios_rol FOREIGN KEY (rol_id) REFERENCES roles(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_usuarios_obra FOREIGN KEY (obra_id) REFERENCES obras(id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Índices
CREATE INDEX idx_permisos_rol ON permisos_rol(rol_id);
CREATE INDEX idx_usuarios_rol ON usuarios(rol_id);
CREATE INDEX idx_usuarios_obra ON usuarios(obra_id);

-- Agregar FK de documentos.subido_por -> usuarios.id (dependencia cruzada)
ALTER TABLE documentos
    ADD CONSTRAINT fk_documentos_subido_por FOREIGN KEY (subido_por) REFERENCES usuarios(id) ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed: Rol Super Administrador
INSERT INTO roles (nombre, descripcion) VALUES ('Super Administrador', 'Acceso completo al sistema. Puede crear roles y gestionar permisos.');
