-- =============================================
-- Migración 061: reportado_por en discrepancias de transferencia
-- =============================================
-- Auditoría (punto 52 del checklist): registrar QUIÉN reportó cada
-- discrepancia de transferencia. La discrepancia se autogenera al recibir
-- (cantidad_recibida ≠ cantidad_enviada), así que el "reportador" es el
-- receptor que la detecta. Las columnas resuelto_por / fecha_resolucion ya
-- existían (migración 024); sólo faltaba quién la reportó.
--
-- Idempotente vía information_schema + PREPARE/EXECUTE (patrón 039).
-- Tipo INT signed para matchear usuarios.id (aprendizaje 038 errno 150).
-- =============================================

-- 1. Columna reportado_por
SET @col_exists := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'transferencia_discrepancias'
      AND COLUMN_NAME = 'reportado_por'
);
SET @sql := IF(@col_exists = 0,
    'ALTER TABLE transferencia_discrepancias ADD COLUMN reportado_por INT NULL AFTER observacion',
    'SELECT "reportado_por ya existe" AS msg'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2. Foreign key a usuarios (ON DELETE SET NULL: si se borra el usuario,
--    conservamos la discrepancia sin el dato del reportador).
SET @fk_exists := (
    SELECT COUNT(*) FROM information_schema.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'transferencia_discrepancias'
      AND CONSTRAINT_NAME = 'fk_trfd_reportado'
);
SET @sql := IF(@fk_exists = 0,
    'ALTER TABLE transferencia_discrepancias ADD CONSTRAINT fk_trfd_reportado FOREIGN KEY (reportado_por) REFERENCES usuarios(id) ON DELETE SET NULL',
    'SELECT "fk_trfd_reportado ya existe" AS msg'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
