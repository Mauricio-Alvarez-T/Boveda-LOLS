-- =============================================
-- Migración 042: Items personalizados en transferencias
-- =============================================
-- Permite que el solicitante agregue items que NO están en el catálogo
-- (items_inventario) — típicamente cosas que se necesitan comprar.
-- El aprobador los ve y puede tramitar la compra.
--
-- Items normales viven en transferencia_items (FK a items_inventario).
-- Items custom viven aquí — sin FK a catálogo, solo descripción libre.
-- Se incluyen en el mensaje WhatsApp al transportista en sección separada.

CREATE TABLE IF NOT EXISTS transferencia_items_custom (
    id INT AUTO_INCREMENT PRIMARY KEY,
    transferencia_id INT NOT NULL,
    descripcion VARCHAR(500) NOT NULL,
    cantidad INT NOT NULL,
    unidad VARCHAR(50) DEFAULT NULL,
    observacion TEXT DEFAULT NULL,
    -- fase 2 (UI no implementada todavía): aprobador marca cuando compra
    compra_realizada BOOLEAN NOT NULL DEFAULT FALSE,
    notas_compra TEXT DEFAULT NULL,
    fecha_compra DATETIME DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_trfic_transferencia FOREIGN KEY (transferencia_id)
        REFERENCES transferencias(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_trfic_transferencia ON transferencia_items_custom(transferencia_id);
