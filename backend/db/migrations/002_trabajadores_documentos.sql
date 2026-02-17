-- =============================================
-- SGDL - Migración 002: Trabajadores y Documentos
-- Tablas: trabajadores, tipos_documento, documentos
-- =============================================

CREATE TABLE IF NOT EXISTS trabajadores (
    id INT AUTO_INCREMENT PRIMARY KEY,
    rut VARCHAR(12) NOT NULL UNIQUE,
    nombres VARCHAR(100) NOT NULL,
    apellido_paterno VARCHAR(100) NOT NULL,
    apellido_materno VARCHAR(100) DEFAULT NULL,
    empresa_id INT DEFAULT NULL,
    obra_id INT DEFAULT NULL,
    cargo_id INT DEFAULT NULL,
    email VARCHAR(255) DEFAULT NULL,
    telefono VARCHAR(20) DEFAULT NULL,
    carnet_frente_url VARCHAR(500) DEFAULT NULL,
    carnet_dorso_url VARCHAR(500) DEFAULT NULL,
    fecha_ingreso DATE DEFAULT NULL,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_trabajadores_empresa FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT fk_trabajadores_obra FOREIGN KEY (obra_id) REFERENCES obras(id) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT fk_trabajadores_cargo FOREIGN KEY (cargo_id) REFERENCES cargos(id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tipos_documento (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(150) NOT NULL UNIQUE,
    dias_vigencia INT DEFAULT NULL COMMENT 'NULL = sin vencimiento',
    obligatorio BOOLEAN NOT NULL DEFAULT FALSE,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS documentos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    trabajador_id INT NOT NULL,
    tipo_documento_id INT NOT NULL,
    nombre_archivo VARCHAR(255) NOT NULL COMMENT 'Formato: RUT_trabajador-RUT_empresa-fecha.pdf',
    ruta_archivo VARCHAR(500) NOT NULL,
    rut_empresa_al_subir VARCHAR(12) NOT NULL COMMENT 'Snapshot del RUT empresa al momento de subir',
    fecha_subida DATE NOT NULL DEFAULT (CURRENT_DATE),
    fecha_vencimiento DATE DEFAULT NULL,
    subido_por INT DEFAULT NULL,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_documentos_trabajador FOREIGN KEY (trabajador_id) REFERENCES trabajadores(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_documentos_tipo FOREIGN KEY (tipo_documento_id) REFERENCES tipos_documento(id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Índices
CREATE INDEX idx_trabajadores_rut ON trabajadores(rut);
CREATE INDEX idx_trabajadores_empresa ON trabajadores(empresa_id);
CREATE INDEX idx_trabajadores_obra ON trabajadores(obra_id);
CREATE INDEX idx_documentos_trabajador ON documentos(trabajador_id);
CREATE INDEX idx_documentos_tipo ON documentos(tipo_documento_id);
CREATE INDEX idx_documentos_vencimiento ON documentos(fecha_vencimiento);
