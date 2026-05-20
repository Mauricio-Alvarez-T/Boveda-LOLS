-- =============================================
-- Migración 051: UNIQUE (categoria_id, nro_item) en items_inventario
-- =============================================
-- Síntoma: UI Inventario muestra el mismo `nro_item` repetido en items
-- distintos de la misma categoría (ej: #3 = ANDAMIO SALIENTE y
-- #3 = ANDAMIOS DIAGONAL DE 1,8 mts ambos en categoría ANDAMIOS).
--
-- Causa: el hook `beforeCreate` en backend/index.js asigna
-- `nro_item = MAX(nro_item) + 1 WHERE categoria_id = ?` sin lock.
-- Bajo creación concurrente, dos requests leen el mismo MAX y ambas
-- insertan el mismo número. Migración 027 dropeó el UNIQUE global de
-- `nro_item`; nunca se reemplazó por uno per-categoría.
--
-- Esta migración:
--   1) Renumera duplicados: dentro de cada (categoria_id, nro_item)
--      con count>1, mantiene el item con MIN(id) y asigna nuevos
--      números (max_categoria + offset) a los demás.
--   2) Agrega UNIQUE (categoria_id, nro_item) — defensa real contra
--      futuras races. Si beforeCreate vuelve a colisionar, MySQL
--      retorna ER_DUP_ENTRY (1062) y el INSERT falla limpio.
--
-- Idempotente: si no hay duplicados el UPDATE es no-op; el ALTER usa
-- PREPARE/EXECUTE con check en information_schema.
-- =============================================

-- ── A. Renumerar duplicados per categoría ─────────────────────
-- MySQL 8 soporta CTE en UPDATE.
-- Estrategia:
--   * dup_rows asigna ROW_NUMBER por (categoria_id, nro_item).
--   * to_renum filtra rn>1 — esos son los duplicados a mover.
--   * max_per_cat captura el techo actual de cada categoría ANTES
--     del UPDATE (snapshot consistente — no se contamina por las
--     mismas asignaciones que está haciendo el UPDATE).
--   * El nuevo nro_item = max_categoria + offset_secuencial.
WITH dup_rows AS (
    SELECT id, categoria_id, nro_item,
           ROW_NUMBER() OVER (PARTITION BY categoria_id, nro_item ORDER BY id) AS rn
    FROM items_inventario
),
to_renum AS (
    SELECT id, categoria_id,
           ROW_NUMBER() OVER (PARTITION BY categoria_id ORDER BY id) AS offset_in_cat
    FROM dup_rows
    WHERE rn > 1
),
max_per_cat AS (
    SELECT categoria_id, COALESCE(MAX(nro_item), 0) AS max_n
    FROM items_inventario
    GROUP BY categoria_id
)
UPDATE items_inventario i
JOIN to_renum t ON t.id = i.id
JOIN max_per_cat m ON m.categoria_id = i.categoria_id
SET i.nro_item = m.max_n + t.offset_in_cat;

-- ── B. UNIQUE (categoria_id, nro_item) ────────────────────────
-- Idempotente: solo agrega si no existe.
SET @uk_exists := (
    SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'items_inventario'
      AND INDEX_NAME = 'uk_items_categoria_nro'
);
SET @sql := IF(@uk_exists = 0,
    'ALTER TABLE items_inventario ADD CONSTRAINT uk_items_categoria_nro UNIQUE (categoria_id, nro_item)',
    'SELECT "uk_items_categoria_nro ya existe" AS msg'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
