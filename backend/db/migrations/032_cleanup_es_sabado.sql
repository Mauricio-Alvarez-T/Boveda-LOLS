-- =============================================
-- Migración 032: eliminar es_sabado (dead code)
--
-- Contexto: asistencia.service.bulkCreate bloquea sábados (getDay()===6),
-- así que es_sabado nunca se usa como filtro real. Se introdujo en 006 y
-- se seedeó en 007, pero el frontend y backend lo tratan como campo
-- fantasma. Lo limpiamos:
--   1. DROP COLUMN asistencias.es_sabado (idempotente)
--   2. DELETE seeds de sábado en configuracion_horarios
--
-- El ENUM('lun','mar',...,'sab','dom') en dia_semana se deja tal cual
-- por compat con instalaciones viejas — no hace daño y cambiarlo
-- requiere ALTER pesado.
-- =============================================

-- 1) DROP COLUMN idempotente
SET @col_exists := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'asistencias'
      AND COLUMN_NAME = 'es_sabado'
);

SET @sql := IF(@col_exists > 0,
    'ALTER TABLE asistencias DROP COLUMN es_sabado',
    'SELECT "asistencias.es_sabado ya no existe" AS msg'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2) limpiar horarios de sábado seedeados en 007
DELETE FROM configuracion_horarios WHERE dia_semana = 'sab';
