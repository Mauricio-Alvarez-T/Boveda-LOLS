-- =============================================
-- Migración 018: Transferencias de Inventario
-- =============================================

CREATE TABLE IF NOT EXISTS transferencias (
    id INT AUTO_INCREMENT PRIMARY KEY,
    codigo VARCHAR(20) NOT NULL UNIQUE,
    estado ENUM('pendiente','aprobada','en_transito','recibida','rechazada','cancelada') NOT NULL DEFAULT 'pendiente',
    origen_obra_id INT DEFAULT NULL,
    origen_bodega_id INT DEFAULT NULL,
    destino_obra_id INT DEFAULT NULL,
    destino_bodega_id INT DEFAULT NULL,
    solicitante_id INT NOT NULL,
    aprobador_id INT DEFAULT NULL,
    transportista_id INT DEFAULT NULL,
    receptor_id INT DEFAULT NULL,
    fecha_solicitud DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_aprobacion DATETIME DEFAULT NULL,
    fecha_despacho DATETIME DEFAULT NULL,
    fecha_recepcion DATETIME DEFAULT NULL,
    requiere_pionetas BOOLEAN NOT NULL DEFAULT FALSE,
    cantidad_pionetas INT DEFAULT NULL,
    observaciones TEXT DEFAULT NULL,
    observaciones_rechazo TEXT DEFAULT NULL,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_trf_origen_obra FOREIGN KEY (origen_obra_id) REFERENCES obras(id) ON DELETE SET NULL,
    CONSTRAINT fk_trf_origen_bodega FOREIGN KEY (origen_bodega_id) REFERENCES bodegas(id) ON DELETE SET NULL,
    CONSTRAINT fk_trf_destino_obra FOREIGN KEY (destino_obra_id) REFERENCES obras(id) ON DELETE SET NULL,
    CONSTRAINT fk_trf_destino_bodega FOREIGN KEY (destino_bodega_id) REFERENCES bodegas(id) ON DELETE SET NULL,
    CONSTRAINT fk_trf_solicitante FOREIGN KEY (solicitante_id) REFERENCES usuarios(id),
    CONSTRAINT fk_trf_aprobador FOREIGN KEY (aprobador_id) REFERENCES usuarios(id),
    CONSTRAINT fk_trf_transportista FOREIGN KEY (transportista_id) REFERENCES usuarios(id),
    CONSTRAINT fk_trf_receptor FOREIGN KEY (receptor_id) REFERENCES usuarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_trf_estado ON transferencias(estado);
CREATE INDEX idx_trf_solicitante ON transferencias(solicitante_id);
CREATE INDEX idx_trf_fecha ON transferencias(fecha_solicitud);

CREATE TABLE IF NOT EXISTS transferencia_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    transferencia_id INT NOT NULL,
    item_id INT NOT NULL,
    cantidad_solicitada INT NOT NULL,
    cantidad_enviada INT DEFAULT NULL,
    cantidad_recibida INT DEFAULT NULL,
    observacion TEXT DEFAULT NULL,
    CONSTRAINT fk_trfi_transferencia FOREIGN KEY (transferencia_id) REFERENCES transferencias(id) ON DELETE CASCADE,
    CONSTRAINT fk_trfi_item FOREIGN KEY (item_id) REFERENCES items_inventario(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_trfi_transferencia ON transferencia_items(transferencia_id);
