-- =============================================
-- Migración 037: dashboard_kpi_snapshots
--
-- Contexto: Sprint 3 del roadmap Resumen Ejecutivo (Fase 2.3 + 2.4).
-- Guarda snapshots diarios de los KPIs para:
--   - Sparklines (tendencia últimos 7 días en cada KPI card).
--   - Comparativa mes anterior ("Valor obras: $4.8M (↑ 12%)").
--
-- El script `backend/scripts/snapshot_dashboard.js` corre vía cron diario
-- (00:05 server time) y hace INSERT ... ON DUPLICATE KEY UPDATE por cada
-- KPI. La PK (fecha, kpi) garantiza idempotencia si el cron corre 2 veces.
--
-- KPIs trackeados:
--   pendientes            - COUNT transferencias estado='pendiente'
--   en_transito           - COUNT transferencias estado='en_transito'
--   estancados            - COUNT en_transito con DATEDIFF(NOW, fecha_despacho) >= 7
--   discrepancias         - COUNT transferencias con discrepancia pendiente
--   valor_obras           - SUM(valor_neto) stock vigente en obras
--
-- Retención: sin TTL explícito (son pocos bytes, ~5 KPIs × 365 días = 1825
-- filas/año). Evaluar purge >3 años si crece.
--
-- Idempotente vía information_schema + PREPARE/EXECUTE (patrón 030-036).
-- =============================================

-- ─────────────────────────────────────────────
-- 1. Crear tabla dashboard_kpi_snapshots
-- ─────────────────────────────────────────────
SET @tbl_exists := (
    SELECT COUNT(*) FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'dashboard_kpi_snapshots'
);
SET @sql := IF(@tbl_exists = 0,
    'CREATE TABLE dashboard_kpi_snapshots (
        fecha DATE NOT NULL,
        kpi VARCHAR(32) NOT NULL,
        valor DECIMAL(18,2) NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (fecha, kpi),
        INDEX idx_kpi_fecha (kpi, fecha)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4',
    'SELECT "dashboard_kpi_snapshots ya existe" AS msg'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
