-- =============================================
-- Migración 036: stock_reconciliado flag en transferencias
--
-- Contexto: Ola 2 Fase 1 cambia la semántica del stock: ahora se mueve al
-- RECIBIR (antes se movía al aprobar). Para transferencias vivas al deploy
-- que ya descontaron stock bajo el régimen viejo, el script
-- `backend/scripts/fix_stock_transferencias_aprobadas.js` re-incrementa el
-- stock y flipa este flag a TRUE.
--
-- Semántica del flag:
--   TRUE  → régimen NUEVO (stock no descontado aún, se descuenta al recibir).
--   FALSE → régimen LEGACY (stock ya descontado al aprobar).
--
-- Inserts nuevos heredan DEFAULT TRUE. Transferencias pre-existentes en
-- estado aprobada/en_transito quedan FALSE hasta que corra el script.
-- Los demás estados (pendiente/recibida/rechazada/cancelada) quedan TRUE
-- porque para ellos el flag no tiene efecto (no hay stock pendiente de
-- reversión ni decremento al recibir).
--
-- Idempotente vía information_schema + PREPARE/EXECUTE (patrón 030-033).
-- =============================================

-- ─────────────────────────────────────────────
-- 1. Agregar columna stock_reconciliado
-- ─────────────────────────────────────────────
SET @col_exists := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'transferencias'
      AND COLUMN_NAME = 'stock_reconciliado'
);
SET @sql := IF(@col_exists = 0,
    'ALTER TABLE transferencias ADD COLUMN stock_reconciliado BOOLEAN NOT NULL DEFAULT TRUE AFTER motivo',
    'SELECT "transferencias.stock_reconciliado ya existe" AS msg'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ─────────────────────────────────────────────
-- 2. Backfill: marcar transferencias legacy (aprobada|en_transito) como FALSE
--    Solo se ejecuta si la columna acaba de ser creada, para no re-flipar
--    filas que el script de reconciliación ya procesó.
-- ─────────────────────────────────────────────
SET @sql2 := IF(@col_exists = 0,
    "UPDATE transferencias SET stock_reconciliado = FALSE WHERE estado IN ('aprobada', 'en_transito')",
    'SELECT "stock_reconciliado: backfill skipped (columna ya existía)" AS msg'
);
PREPARE stmt FROM @sql2; EXECUTE stmt; DEALLOCATE PREPARE stmt;
