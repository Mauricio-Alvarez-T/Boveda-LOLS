-- =============================================
-- Migración 068: Índices de rendimiento (auditoría II)
-- =============================================
-- Set acotado de índices compuestos de alto valor (future-proofing; a los
-- volúmenes actuales el impacto es bajo, pero pagan al crecer los datos):
--   M3: trabajadores(activo, es_prueba) — filtro de aislamiento en TODO listado operativo
--   M1: documentos(trabajador_id, activo, tipo_documento_id) — carga de ficha/completitud
--   M4: asistencias(fecha, estado_id) — ausentes del día / agregados por fecha
--
-- Idempotente: cada CREATE guarded vía information_schema (patrón mig 053).
-- Compatibilidad: MySQL 5.7+ / MariaDB 10.2+.
-- Solo agrega índices — NO altera datos.
-- =============================================

-- ─── M3. trabajadores(activo, es_prueba) ───
SET @has_idx_trab_act_prueba = (
    SELECT COUNT(*) FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'trabajadores'
      AND index_name = 'idx_trab_activo_prueba'
);
SET @sql := IF(@has_idx_trab_act_prueba = 0,
    'CREATE INDEX idx_trab_activo_prueba ON trabajadores(activo, es_prueba)',
    'SELECT "skip idx_trab_activo_prueba (ya existe)" AS info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ─── M1. documentos(trabajador_id, activo, tipo_documento_id) ───
SET @has_idx_doc_trab = (
    SELECT COUNT(*) FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'documentos'
      AND index_name = 'idx_doc_trab_activo_tipo'
);
SET @sql := IF(@has_idx_doc_trab = 0,
    'CREATE INDEX idx_doc_trab_activo_tipo ON documentos(trabajador_id, activo, tipo_documento_id)',
    'SELECT "skip idx_doc_trab_activo_tipo (ya existe)" AS info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ─── M4. asistencias(fecha, estado_id) ───
SET @has_idx_asist_fecha_estado = (
    SELECT COUNT(*) FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'asistencias'
      AND index_name = 'idx_asist_fecha_estado'
);
SET @sql := IF(@has_idx_asist_fecha_estado = 0,
    'CREATE INDEX idx_asist_fecha_estado ON asistencias(fecha, estado_id)',
    'SELECT "skip idx_asist_fecha_estado (ya existe)" AS info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
