-- =============================================
-- Migración 062: prórroga de solicitudes pendientes estancadas
-- =============================================
-- Punto 55 del checklist: una solicitud pendiente se considera "estancada"
-- a los 10 días sin moverse. Al detectarla, el admin puede extenderla 10 días
-- más. Esta columna guarda la nueva fecha límite cuando se otorga la prórroga.
--
-- Lógica de estancada (pendiente):
--   limite = COALESCE(prorroga_hasta, fecha_solicitud + 10 días)
--   estancada = CURDATE() > limite
-- Extender: prorroga_hasta = CURDATE() + 10 días
--
-- Idempotente vía information_schema + PREPARE/EXECUTE (patrón 039).
-- =============================================

SET @col_exists := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'transferencias'
      AND COLUMN_NAME = 'prorroga_hasta'
);
SET @sql := IF(@col_exists = 0,
    'ALTER TABLE transferencias ADD COLUMN prorroga_hasta DATE NULL DEFAULT NULL AFTER motivo',
    'SELECT "prorroga_hasta ya existe" AS msg'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
