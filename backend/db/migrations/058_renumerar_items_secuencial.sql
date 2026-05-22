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
-- Estrategia 2-pasos:
--   1) Mover TODOS los items a nro_item negativo. Libera el espacio
--      1..N completo de la UNIQUE constraint — evita colisiones durante
--      el renumber.
--   2) Renumerar con ROW_NUMBER() OVER (PARTITION BY categoria_id
--      ORDER BY activo DESC, id ASC).
--
-- Importante: NO usar variables user-defined en derived subqueries —
-- MariaDB no garantiza orden de evaluación, lo cual causa silent fails.
-- ROW_NUMBER() es safe y declarativo (mismo patrón que mig 051 reescrita).
--
-- Idempotente: re-corre sin daño desde CUALQUIER estado inicial (positivo,
-- negativo, mixto). El patrón "todos a negativo → renumerar" siempre
-- converge a 1..N correcto.
-- =============================================

-- ─── Step 1: mover TODOS los items a nro_item negativo ───
-- Sin WHERE — incluimos inactivos. Sus nro_item positivos podrían chocar
-- con los nuevos durante el renumber si no los movemos.
SET @neg_counter := 0;
UPDATE items_inventario
SET nro_item = (@neg_counter := @neg_counter - 1);

-- ─── Step 2: renumerar 1..N por categoria con ROW_NUMBER ───
-- ORDER BY activo DESC, id ASC:
--   - activo=1 (1 > 0 en DESC) ordenado primero → reciben 1..M
--   - activo=0 ordenado después → reciben M+1..N
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

-- ─── Step 3: sanity check log ───
-- Si algún item quedó con nro_item < 0, el renumber falló y la fila queda
-- en estado roto (UNIQUE viola al insertar item nuevo en esa cat). Este
-- SELECT no afecta data pero queda en logs del runner.
SELECT
    'Renumeración mig 058 completada' AS status,
    SUM(CASE WHEN nro_item < 0 THEN 1 ELSE 0 END) AS items_negativos_restantes,
    SUM(CASE WHEN nro_item > 0 THEN 1 ELSE 0 END) AS items_renumerados,
    SUM(CASE WHEN activo = 1 THEN 1 ELSE 0 END) AS items_activos,
    SUM(CASE WHEN activo = 0 THEN 1 ELSE 0 END) AS items_inactivos
FROM items_inventario;
