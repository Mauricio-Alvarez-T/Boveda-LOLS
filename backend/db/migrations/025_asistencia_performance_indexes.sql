-- =============================================
-- Migración 025: Índices de performance para asistencia
-- Resuelve full table scans en bulkCreate (N+1 queries)
-- =============================================

-- Índice compuesto principal: usado en cada lookup de bulkCreate
-- SELECT * FROM asistencias WHERE trabajador_id = ? AND obra_id = ? AND fecha = ?
CREATE INDEX idx_asist_worker_obra_fecha ON asistencias(trabajador_id, obra_id, fecha);

-- Índice para consultas por obra+fecha (carga de asistencia diaria)
CREATE INDEX idx_asist_obra_fecha ON asistencias(obra_id, fecha);

-- Índice para feriados por fecha (validación en bulkCreate)
CREATE INDEX idx_feriados_fecha_activo ON feriados(fecha, activo);
