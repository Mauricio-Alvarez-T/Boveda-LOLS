-- =============================================
-- Migración 031: Índices faltantes para asistencia (v2)
--
-- Contexto: la migración 025 ya creó:
--   - idx_asist_worker_obra_fecha ON asistencias(trabajador_id, obra_id, fecha)
--   - idx_asist_obra_fecha        ON asistencias(obra_id, fecha)
--   - idx_feriados_fecha_activo   ON feriados(fecha, activo)
--
-- Pero la query de "último log de modificación por asistencia" sigue haciendo
-- filesort porque el índice existente en log_asistencia(asistencia_id) es simple
-- y la query ordena por fecha_modificacion DESC. Añadimos un compuesto.
--
-- Idempotente vía information_schema check (compatible MySQL 5.7+).
-- =============================================

-- log_asistencia: compuesto para lookups "último cambio por asistencia"
SET @idx_exists := (
    SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'log_asistencia'
      AND INDEX_NAME = 'idx_log_asist_fecha_desc'
);

SET @sql := IF(@idx_exists = 0,
    'CREATE INDEX idx_log_asist_fecha_desc ON log_asistencia(asistencia_id, fecha_modificacion DESC)',
    'SELECT "idx_log_asist_fecha_desc ya existe" AS msg'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
