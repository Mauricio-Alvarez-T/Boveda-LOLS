-- =============================================
-- Migración 053: Índices de optimización + RUT normalizado
-- =============================================
-- Resuelve hallazgos de la auditoría performance (Fase 9):
--   C1: búsqueda RUT sin índice utilizable → rut_normalized GENERATED + idx
--   A2: ORDER BY apellido_paterno/materno/nombres sin índice compuesto
--   A3: periodos_ausencia sin índice para queries de superposición
--   C3+A4: DROP índices redundantes (cubiertos por compuestos)
--
-- Idempotente: todos los pasos guarded vía information_schema.
-- Compatibilidad: MySQL 5.7+ / MariaDB 10.2+ (GENERATED columns).
-- =============================================

-- ─── A1. trabajadores.rut_normalized (GENERATED) + índice ───
-- Antes: WHERE REPLACE(REPLACE(rut, '.', ''), '-', '') LIKE ? → full table scan.
-- Después: WHERE rut_normalized LIKE ? → usa índice idx_trab_rut_norm.
-- La columna se calcula automáticamente al insertar/actualizar (STORED) y se
-- indexa para que LIKE prefijo/sufijo aproveche el índice cuando es posible.
SET @has_rut_norm = (
    SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'trabajadores'
      AND column_name = 'rut_normalized'
);
SET @sql := IF(@has_rut_norm = 0,
    "ALTER TABLE trabajadores
        ADD COLUMN rut_normalized VARCHAR(20)
        GENERATED ALWAYS AS (REPLACE(REPLACE(rut, '.', ''), '-', '')) STORED",
    'SELECT "skip rut_normalized (ya existe)" AS info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_idx_rut_norm = (
    SELECT COUNT(*) FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'trabajadores'
      AND index_name = 'idx_trab_rut_norm'
);
SET @sql := IF(@has_idx_rut_norm = 0,
    'CREATE INDEX idx_trab_rut_norm ON trabajadores(rut_normalized)',
    'SELECT "skip idx_trab_rut_norm (ya existe)" AS info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ─── A2. trabajadores índice compuesto nombre ───
-- ORDER BY apellido_paterno, apellido_materno, nombres aparece en 4+ queries
-- (asistencia, ficha, búsqueda paginada). Sin el índice → filesort.
SET @has_idx_nombre = (
    SELECT COUNT(*) FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'trabajadores'
      AND index_name = 'idx_trab_nombre_completo'
);
SET @sql := IF(@has_idx_nombre = 0,
    'CREATE INDEX idx_trab_nombre_completo ON trabajadores(apellido_paterno, apellido_materno, nombres)',
    'SELECT "skip idx_trab_nombre_completo (ya existe)" AS info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ─── A3. periodos_ausencia índice rango por trabajador ───
-- Queries típicas: WHERE trabajador_id = ? AND fecha_inicio <= ? AND fecha_fin >= ?
-- (validar overlap, período activo en fecha X, generación Excel mensual con LM).
SET @has_idx_periodo_tf = (
    SELECT COUNT(*) FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'periodos_ausencia'
      AND index_name = 'idx_periodo_trab_fechas'
);
SET @sql := IF(@has_idx_periodo_tf = 0,
    'CREATE INDEX idx_periodo_trab_fechas ON periodos_ausencia(trabajador_id, fecha_inicio, fecha_fin)',
    'SELECT "skip idx_periodo_trab_fechas (ya existe)" AS info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ─── C3. DROP idx_log_asistencia_id (redundante) ───
-- Cubierto 100% por idx_log_asist_fecha_desc(asistencia_id, fecha_modificacion DESC).
-- El motor usa el compuesto para queries WHERE asistencia_id = ? (leftmost prefix).
SET @has_redundant_1 = (
    SELECT COUNT(*) FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'log_asistencia'
      AND index_name = 'idx_log_asistencia_id'
);
SET @sql := IF(@has_redundant_1 > 0,
    'DROP INDEX idx_log_asistencia_id ON log_asistencia',
    'SELECT "skip drop idx_log_asistencia_id (no existe)" AS info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ─── A4. DROP idx_feriados_fecha (redundante) ───
-- Cubierto por idx_feriados_fecha_activo(fecha, activo).
SET @has_redundant_2 = (
    SELECT COUNT(*) FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'feriados'
      AND index_name = 'idx_feriados_fecha'
);
SET @sql := IF(@has_redundant_2 > 0,
    'DROP INDEX idx_feriados_fecha ON feriados',
    'SELECT "skip drop idx_feriados_fecha (no existe)" AS info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
