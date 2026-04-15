-- =============================================
-- Migración 024: Discrepancias de Transferencias
-- =============================================
-- Registra cada ítem de una transferencia donde cantidad_recibida ≠ cantidad_enviada.
-- Se genera automáticamente en el momento de recibir la transferencia.
-- Permite auditar pérdidas o mermas en tránsito.

CREATE TABLE IF NOT EXISTS transferencia_discrepancias (
    id INT AUTO_INCREMENT PRIMARY KEY,
    transferencia_id INT NOT NULL,
    item_id INT NOT NULL,
    cantidad_enviada INT NOT NULL,
    cantidad_recibida INT NOT NULL,
    diferencia INT GENERATED ALWAYS AS (cantidad_enviada - cantidad_recibida) STORED,
    observacion TEXT DEFAULT NULL,
    estado ENUM('pendiente','resuelta','descartada') NOT NULL DEFAULT 'pendiente',
    resolucion TEXT DEFAULT NULL,
    resuelto_por INT DEFAULT NULL,
    fecha_resolucion DATETIME DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_trfd_transferencia FOREIGN KEY (transferencia_id) REFERENCES transferencias(id) ON DELETE CASCADE,
    CONSTRAINT fk_trfd_item FOREIGN KEY (item_id) REFERENCES items_inventario(id) ON DELETE RESTRICT,
    CONSTRAINT fk_trfd_resuelto FOREIGN KEY (resuelto_por) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_trfd_transferencia ON transferencia_discrepancias(transferencia_id);
CREATE INDEX idx_trfd_estado ON transferencia_discrepancias(estado);
CREATE INDEX idx_trfd_fecha ON transferencia_discrepancias(created_at);
