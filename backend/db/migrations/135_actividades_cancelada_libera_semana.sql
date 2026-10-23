-- =============================================
-- 135 — Una lista CANCELADA libera la semana de su obra
-- =============================================
-- Dueño (2026-10-23): Héctor Herrera armó la lista de Escobar Williams para la
-- semana equivocada y la canceló; la UNIQUE (obra_id, semana) de la mig 116 no
-- distingue estado, así que la lista cancelada seguía ocupando el cupo y no se
-- podía armar la correcta. Regla nueva: si se canceló, no habrá actividad →
-- se puede armar otra lista para esa obra y semana. La cancelada se CONSERVA
-- (historial), no se borra.
--
-- Mecanismo (mismo patrón null-safe que la mig 057): columna generada
-- semana_activa = semana, o NULL si la lista está cancelada. La UNIQUE pasa a
-- (obra_id, semana_activa); los NULL no chocan entre sí → varias canceladas +
-- a lo más una activa por obra y semana. MariaDB 10.6 / MySQL 5.7+.
--
-- Orden obligatorio: ADD la UNIQUE nueva → DROP la vieja. uniq_obra_semana es
-- el único índice que empieza por obra_id y sostiene la FK fk_actsug_obra;
-- InnoDB no deja soltarlo mientras no haya otro que la sirva (precedente 116).
--
-- La UNIQUE nueva es MENOS estricta que la vieja → los datos actuales ya la
-- cumplen; no hay que deduplicar nada. Idempotente (information_schema + PREPARE).

-- ─── 1. Columna generada semana_activa ───
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'actividades_sugeridas' AND COLUMN_NAME = 'semana_activa');
SET @sql := IF(@col = 0,
    'ALTER TABLE actividades_sugeridas
        ADD COLUMN semana_activa DATE GENERATED ALWAYS AS (IF(estado = "cancelada", NULL, semana)) STORED',
    'SELECT "actividades_sugeridas.semana_activa ya existe" AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ─── 2. UNIQUE nueva (obra, semana_activa) — antes de soltar la vieja ───
SET @idx := (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'actividades_sugeridas' AND INDEX_NAME = 'uniq_obra_semana_activa');
SET @sql := IF(@idx = 0,
    'ALTER TABLE actividades_sugeridas ADD UNIQUE KEY uniq_obra_semana_activa (obra_id, semana_activa)',
    'SELECT "uniq_obra_semana_activa ya existe" AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ─── 3. DROP de la UNIQUE vieja (obra, semana) ───
SET @idx := (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'actividades_sugeridas' AND INDEX_NAME = 'uniq_obra_semana');
SET @sql := IF(@idx > 0,
    'ALTER TABLE actividades_sugeridas DROP INDEX uniq_obra_semana',
    'SELECT "uniq_obra_semana ya no existe" AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
