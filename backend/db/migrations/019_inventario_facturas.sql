-- =============================================
-- Migración 019: Facturas de Inventario
-- =============================================

CREATE TABLE IF NOT EXISTS facturas_inventario (
    id INT AUTO_INCREMENT PRIMARY KEY,
    numero_factura VARCHAR(50) NOT NULL,
    proveedor VARCHAR(255) NOT NULL,
    fecha_factura DATE NOT NULL,
    monto_neto DECIMAL(14,2) NOT NULL,
    observaciones TEXT DEFAULT NULL,
    registrado_por INT NOT NULL,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_fact_registrado FOREIGN KEY (registrado_por) REFERENCES usuarios(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_fact_fecha ON facturas_inventario(fecha_factura);

CREATE TABLE IF NOT EXISTS factura_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    factura_id INT NOT NULL,
    item_id INT NOT NULL,
    obra_id INT DEFAULT NULL,
    bodega_id INT DEFAULT NULL,
    cantidad INT NOT NULL,
    precio_unitario DECIMAL(12,2) NOT NULL,
    CONSTRAINT fk_fi_factura FOREIGN KEY (factura_id) REFERENCES facturas_inventario(id) ON DELETE CASCADE,
    CONSTRAINT fk_fi_item FOREIGN KEY (item_id) REFERENCES items_inventario(id) ON DELETE RESTRICT,
    CONSTRAINT fk_fi_obra FOREIGN KEY (obra_id) REFERENCES obras(id) ON DELETE SET NULL,
    CONSTRAINT fk_fi_bodega FOREIGN KEY (bodega_id) REFERENCES bodegas(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_fi_factura ON factura_items(factura_id);
