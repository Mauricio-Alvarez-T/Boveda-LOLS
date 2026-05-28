-- =============================================
-- Mig 058: renumerar nro_item 1..N por categoría compactando gaps
-- =============================================
-- Después de mig 027 (renumeración inicial) los soft-deletes (activo=0)
-- y las creaciones nuevas vía beforeCreate(MAX+1) introdujeron gaps en
-- nro_item. UI muestra # 1, 3, 11, 12, 17, 18 — confuso para usuario.
--
-- Esta migración renumera TODOS los items (activos + inactivos) 1..N por
-- categoria_id ordenando ACTIVOS PRIMERO (activo DESC), luego por id ASC.
-- Resultado:
--   - Items activos reciben 1..M consecutivos → UI muestra # sin gaps.
--   - Items inactivos reciben M+1..N → no se ven en UI pero conservan
--     referencia histórica.
--
-- Pre-requisitos:
--   - mig 051 (uk_items_categoria_nro UNIQUE) aplicada.
--   - MariaDB 10.2+ / MySQL 8.0+ (window functions en derived subqueries).
--
-- Estrategia 3-pasos para evitar colisión UNIQUE durante UPDATE:
--   1) DROP UNIQUE uk_items_categoria_nro temporalmente. InnoDB checkea
--      UNIQUE row-by-row durante UPDATE; con el constraint vigente, el
--      state intermedio puede violar UNIQUE aunque el state final sea
--      válido. Drop temporal libera el check.
--   2) UPDATE con ROW_NUMBER() — renumera todo en una sola operación.
--   3) Re-add UNIQUE uk_items_categoria_nro.
--
-- Variants probados que fallaron:
--   - Variables user-defined en subquery: MariaDB no garantiza
--     evaluation order → Step 2 silent fail.
--   - "Mover a negativo + renumerar" en 2 pasos: collision con rows que
--     ya tenían negativos de runs previos fallidos.
--
-- Idempotente: re-corre desde cualquier estado inicial. Drop/Add con
-- guards information_schema.
-- =============================================

-- ─── Step 1: DROP UNIQUE temporal ───
SET @has_uk := (
    SELECT COUNT(*) FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'items_inventario'
      AND index_name = 'uk_items_categoria_nro'
);
SET @sql := IF(@has_uk > 0,
    'ALTER TABLE items_inventario DROP INDEX uk_items_categoria_nro',
    'SELECT "uk_items_categoria_nro ya borrado o no existe" AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ─── Step 2: renumerar 1..N por categoria con ROW_NUMBER ───
-- ORDER BY activo DESC, id ASC:
--   - activo=1 ordenado primero → reciben 1..M (consecutivos en UI)
--   - activo=0 ordenado después → reciben M+1..N (no se ven en UI)
--   - dentro de cada grupo, id ASC preserva orden de creación
UPDATE items_inventario i
JOIN (
    SELECT id,
           ROW_NUMBER() OVER (
               PARTITION BY categoria_id
               ORDER BY activo DESC, id ASC
           ) AS new_nro
    FROM items_inventario
) renum ON renum.id = i.id
SET i.nro_item = renum.new_nro;

-- ─── Step 3: re-add UNIQUE ───
SET @has_uk_now := (
    SELECT COUNT(*) FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'items_inventario'
      AND index_name = 'uk_items_categoria_nro'
);
SET @sql := IF(@has_uk_now = 0,
    'ALTER TABLE items_inventario ADD CONSTRAINT uk_items_categoria_nro UNIQUE (categoria_id, nro_item)',
    'SELECT "uk_items_categoria_nro ya existe" AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ─── Step 4: sanity check log ───
SELECT
    'Renumeración mig 058 completada' AS status,
    SUM(CASE WHEN nro_item < 0 THEN 1 ELSE 0 END) AS items_negativos_restantes,
    SUM(CASE WHEN nro_item > 0 THEN 1 ELSE 0 END) AS items_renumerados,
    SUM(CASE WHEN activo = 1 THEN 1 ELSE 0 END) AS items_activos,
    SUM(CASE WHEN activo = 0 THEN 1 ELSE 0 END) AS items_inactivos
FROM items_inventario;
