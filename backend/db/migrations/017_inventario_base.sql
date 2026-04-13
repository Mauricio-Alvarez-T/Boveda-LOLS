-- =============================================
-- Migración 017: Inventario Base
-- Tablas: categorias_inventario, bodegas, items_inventario, ubicaciones_stock, descuentos_obra
-- =============================================

CREATE TABLE IF NOT EXISTS categorias_inventario (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL UNIQUE,
    orden INT NOT NULL DEFAULT 0,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS bodegas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(255) NOT NULL UNIQUE,
    direccion VARCHAR(255) DEFAULT NULL,
    responsable_id INT DEFAULT NULL,
    activa BOOLEAN NOT NULL DEFAULT TRUE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_bodegas_responsable FOREIGN KEY (responsable_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_bodegas_responsable ON bodegas(responsable_id);

CREATE TABLE IF NOT EXISTS items_inventario (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nro_item INT NOT NULL UNIQUE,
    categoria_id INT NOT NULL,
    descripcion VARCHAR(255) NOT NULL,
    m2 DECIMAL(10,4) DEFAULT NULL,
    valor_compra DECIMAL(12,2) NOT NULL DEFAULT 0,
    valor_arriendo DECIMAL(12,2) NOT NULL DEFAULT 0,
    unidad VARCHAR(20) NOT NULL DEFAULT 'U',
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_items_categoria FOREIGN KEY (categoria_id) REFERENCES categorias_inventario(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_items_categoria ON items_inventario(categoria_id);

CREATE TABLE IF NOT EXISTS ubicaciones_stock (
    id INT AUTO_INCREMENT PRIMARY KEY,
    item_id INT NOT NULL,
    obra_id INT DEFAULT NULL,
    bodega_id INT DEFAULT NULL,
    cantidad INT NOT NULL DEFAULT 0,
    valor_arriendo_override DECIMAL(12,2) DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_ub_item FOREIGN KEY (item_id) REFERENCES items_inventario(id) ON DELETE CASCADE,
    CONSTRAINT fk_ub_obra FOREIGN KEY (obra_id) REFERENCES obras(id) ON DELETE CASCADE,
    CONSTRAINT fk_ub_bodega FOREIGN KEY (bodega_id) REFERENCES bodegas(id) ON DELETE CASCADE,
    UNIQUE KEY uk_item_ubicacion (item_id, obra_id, bodega_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_ub_obra ON ubicaciones_stock(obra_id);
CREATE INDEX idx_ub_bodega ON ubicaciones_stock(bodega_id);
CREATE INDEX idx_ub_item ON ubicaciones_stock(item_id);

CREATE TABLE IF NOT EXISTS descuentos_obra (
    id INT AUTO_INCREMENT PRIMARY KEY,
    obra_id INT NOT NULL UNIQUE,
    porcentaje DECIMAL(5,2) NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_desc_obra FOREIGN KEY (obra_id) REFERENCES obras(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed categorías iniciales
INSERT IGNORE INTO categorias_inventario (nombre, orden) VALUES
('ANDAMIOS', 1),
('ALZAPRIMAS', 2),
('MOLDAJES', 3),
('MAQUINARIA', 4);
