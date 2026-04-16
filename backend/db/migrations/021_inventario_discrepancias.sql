-- =============================================
-- Migración 021: Discrepancias de Inventario
-- =============================================

CREATE TABLE IF NOT EXISTS discrepancias_inventario (
    id INT AUTO_INCREMENT PRIMARY KEY,
    item_id INT NOT NULL,
    obra_id INT DEFAULT NULL,
    bodega_id INT DEFAULT NULL,
    cantidad_sistema INT NOT NULL,
    cantidad_reportada INT NOT NULL,
    diferencia INT GENERATED ALWAYS AS (cantidad_reportada - cantidad_sistema) STORED,
    reportado_por INT NOT NULL,
    estado ENUM('pendiente','resuelta','descartada') NOT NULL DEFAULT 'pendiente',
    resolucion TEXT DEFAULT NULL,
    resuelto_por INT DEFAULT NULL,
    fecha_resolucion DATETIME DEFAULT NULL,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_disc_item FOREIGN KEY (item_id) REFERENCES items_inventario(id) ON DELETE RESTRICT,
    CONSTRAINT fk_disc_obra FOREIGN KEY (obra_id) REFERENCES obras(id) ON DELETE SET NULL,
    CONSTRAINT fk_disc_bodega FOREIGN KEY (bodega_id) REFERENCES bodegas(id) ON DELETE SET NULL,
    CONSTRAINT fk_disc_reportado FOREIGN KEY (reportado_por) REFERENCES usuarios(id) ON DELETE RESTRICT,
    CONSTRAINT fk_disc_resuelto FOREIGN KEY (resuelto_por) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_disc_estado ON discrepancias_inventario(estado);
CREATE INDEX idx_disc_item ON discrepancias_inventario(item_id);
