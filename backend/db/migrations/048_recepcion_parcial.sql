-- =============================================
-- Migración 048: Recepción parcial de transferencias
-- =============================================
-- Habilita múltiples eventos de recepción por transferencia. Caso de uso:
-- una solicitud aprobada requiere varios viajes para entregar todos los
-- ítems (capacidad del camión, distancia entre obras). El receptor elige:
--   · 'parcial' → llegó algo, esperar más viajes (estado recepcion_parcial)
--   · 'total'   → último viaje, cierra la TRF (estado recibida + discrepancia
--                 para gaps acumulados)
--
-- Cambios:
-- A. ENUM transferencias.estado agrega 'recepcion_parcial' entre en_transito y recibida.
-- B. Nueva tabla `transferencia_recepciones` — audit por evento (receptor, fecha, tipo).
-- C. Nueva tabla `transferencia_recepcion_items` — items recibidos por evento.
-- D. Nueva columna `transferencia_item_origenes.cantidad_decrementada` —
--    tracking FIFO de cuánto se decrementó por split en parciales sucesivos.
--
-- Idempotente vía PREPARE/EXECUTE + information_schema (patrón 040/047).
-- MySQL 5.7+ compat.
-- =============================================

-- ─────────────────────────────────────────────
-- A. Ampliar ENUM transferencias.estado
-- ─────────────────────────────────────────────
SET @col_exists := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'transferencias'
      AND COLUMN_NAME = 'estado'
);
SET @already := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'transferencias'
      AND COLUMN_NAME = 'estado'
      AND COLUMN_TYPE LIKE '%recepcion_parcial%'
);
SET @sql := IF(@col_exists > 0 AND @already = 0,
    "ALTER TABLE transferencias MODIFY COLUMN estado ENUM('pendiente','aprobada','en_transito','recepcion_parcial','recibida','rechazada','cancelada') NOT NULL DEFAULT 'pendiente'",
    'SELECT "transferencias.estado ya incluye recepcion_parcial o tabla no existe" AS msg'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ─────────────────────────────────────────────
-- B. Tabla transferencia_recepciones — audit de eventos
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transferencia_recepciones (
    id INT AUTO_INCREMENT PRIMARY KEY,
    transferencia_id INT NOT NULL,
    receptor_id INT NOT NULL,
    fecha_recepcion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    tipo ENUM('parcial','total') NOT NULL,
    observacion TEXT NULL,
    INDEX idx_trf_recepciones_trf (transferencia_id),
    INDEX idx_trf_recepciones_receptor (receptor_id),
    CONSTRAINT fk_trf_recepciones_trf FOREIGN KEY (transferencia_id)
        REFERENCES transferencias(id) ON DELETE CASCADE,
    CONSTRAINT fk_trf_recepciones_receptor FOREIGN KEY (receptor_id)
        REFERENCES usuarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────
-- C. Tabla transferencia_recepcion_items — qué llegó en cada evento
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transferencia_recepcion_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    recepcion_id INT NOT NULL,
    transferencia_item_id INT NOT NULL,
    cantidad_recibida INT NOT NULL,
    observacion TEXT NULL,
    INDEX idx_trf_rec_items_rec (recepcion_id),
    INDEX idx_trf_rec_items_trf_item (transferencia_item_id),
    CONSTRAINT fk_trf_rec_items_rec FOREIGN KEY (recepcion_id)
        REFERENCES transferencia_recepciones(id) ON DELETE CASCADE,
    CONSTRAINT fk_trf_rec_items_trf_item FOREIGN KEY (transferencia_item_id)
        REFERENCES transferencia_items(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────
-- D. Columna transferencia_item_origenes.cantidad_decrementada
--    Tracking FIFO de stock movido por split (parciales sucesivos).
-- ─────────────────────────────────────────────
SET @col_exists := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'transferencia_item_origenes'
      AND COLUMN_NAME = 'cantidad_decrementada'
);
SET @sql := IF(@col_exists = 0,
    'ALTER TABLE transferencia_item_origenes ADD COLUMN cantidad_decrementada INT NOT NULL DEFAULT 0',
    'SELECT "transferencia_item_origenes.cantidad_decrementada ya existe" AS msg'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
