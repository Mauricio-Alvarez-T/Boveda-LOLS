-- =============================================
-- Migración 020: Registro de Bombas de Hormigón
-- =============================================

CREATE TABLE IF NOT EXISTS registro_bombas_hormigon (
    id INT AUTO_INCREMENT PRIMARY KEY,
    obra_id INT NOT NULL,
    fecha DATE NOT NULL,
    tipo_bomba VARCHAR(100) NOT NULL,
    es_externa BOOLEAN NOT NULL DEFAULT FALSE,
    proveedor VARCHAR(255) DEFAULT NULL,
    costo DECIMAL(12,2) DEFAULT NULL,
    observaciones TEXT DEFAULT NULL,
    registrado_por INT NOT NULL,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_rb_obra FOREIGN KEY (obra_id) REFERENCES obras(id) ON DELETE RESTRICT,
    CONSTRAINT fk_rb_registrado FOREIGN KEY (registrado_por) REFERENCES usuarios(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_rb_obra_fecha ON registro_bombas_hormigon(obra_id, fecha);
