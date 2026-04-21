-- =============================================
-- Migración 032: Aprobación parcial + multi-origen de transferencias
--
-- 1) transferencias.es_faltante_de_id: cuando al aprobar parcialmente se
--    auto-crea una solicitud por la cantidad faltante, apunta a la original.
-- 2) transferencia_item_origenes: permite que un ítem se despache desde
--    múltiples ubicaciones (ej: 1 desde LOLS GENERAL + 1 desde 1 CONFERENCIA).
--    transferencia_items.cantidad_enviada queda como SUMA (denormalizado para
--    queries y backward-compat con recibir()/rechazar()).
-- 3) Índice en transferencia_items(transferencia_id, item_id) para acelerar
--    queries de agregación (ya hay PK por id, pero el compuesto ayuda a GROUP BY).
--
-- Idempotente via information_schema checks (patrón de 030/031).
-- =============================================

-- 1) Columna es_faltante_de_id en transferencias -----------------------------
SET @col_exists := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'transferencias'
      AND COLUMN_NAME = 'es_faltante_de_id'
);

SET @sql := IF(@col_exists = 0,
    'ALTER TABLE transferencias ADD COLUMN es_faltante_de_id INT NULL AFTER observaciones,
     ADD INDEX idx_transferencias_faltante_de (es_faltante_de_id)',
    'SELECT "transferencias.es_faltante_de_id ya existe" AS msg'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- 2) Tabla transferencia_item_origenes ---------------------------------------
CREATE TABLE IF NOT EXISTS transferencia_item_origenes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    transferencia_item_id INT NOT NULL,
    origen_obra_id INT NULL,
    origen_bodega_id INT NULL,
    cantidad_enviada INT NOT NULL,
    creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_trf_origenes_item FOREIGN KEY (transferencia_item_id)
        REFERENCES transferencia_items(id) ON DELETE CASCADE,
    INDEX idx_trf_origenes_item (transferencia_item_id),
    INDEX idx_trf_origenes_obra (origen_obra_id),
    INDEX idx_trf_origenes_bodega (origen_bodega_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- 3) Índice compuesto en transferencia_items ---------------------------------
SET @idx_exists := (
    SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'transferencia_items'
      AND INDEX_NAME = 'idx_trf_items_tr_item'
);

SET @sql := IF(@idx_exists = 0,
    'CREATE INDEX idx_trf_items_tr_item ON transferencia_items(transferencia_id, item_id)',
    'SELECT "idx_trf_items_tr_item ya existe" AS msg'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
