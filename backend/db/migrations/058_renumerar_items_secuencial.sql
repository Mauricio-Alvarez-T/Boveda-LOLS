-- =============================================
-- Mig 058: renumerar nro_item 1..N por categoría compactando gaps
-- =============================================
-- Después de mig 027 (renumeración inicial) los soft-deletes (activo=0) y
-- las creaciones nuevas vía beforeCreate(MAX+1) introdujeron gaps en
-- nro_item. UI muestra # 1, 3, 11, 12, 17, 18 — confuso para usuario.
--
-- Esta migración renumera SOLO items ACTIVOS (activo=1) secuencialmente
-- 1..N por categoria_id, ordenando por id asc (preserva orden de creación
-- relativo). Items inactivos retienen su nro_item viejo — no se ven en UI
-- pero conservan referencia histórica.
--
-- Pre-requisito: mig 051 (uk_items_categoria_nro UNIQUE) aplicada.
-- Estrategia 2-pasos para evitar colisión con UNIQUE durante UPDATE:
--   1) Mover items activos a nro_item negativo (transitorio, fuera de
--      rango 1..N → no colisiona con nadie).
--   2) Renumerar de 1..N por categoría.
--
-- Idempotente: si se re-ejecuta, paso 1 mueve a más negativos, paso 2
-- los devuelve a 1..N. Resultado final igual.
-- =============================================

-- ─── Step 1: mover items activos a nro_item negativo transitorio ───
SET @neg_counter := 0;
UPDATE items_inventario
SET nro_item = (@neg_counter := @neg_counter - 1)
WHERE activo = 1;

-- ─── Step 2: renumerar 1..N por categoría ordenando por id asc ───
-- MariaDB/MySQL no soporta ROW_NUMBER() en UPDATE directo. Usar variables.
SET @cat_prev := 0;
SET @row_idx := 0;

UPDATE items_inventario i
JOIN (
    SELECT id,
           categoria_id,
           IF(@cat_prev = categoria_id,
              @row_idx := @row_idx + 1,
              @row_idx := 1) AS new_nro,
           @cat_prev := categoria_id AS _cat_tracker
    FROM items_inventario
    WHERE activo = 1
    ORDER BY categoria_id ASC, id ASC
) renum ON renum.id = i.id
SET i.nro_item = renum.new_nro;

-- ─── Step 3: sanity check log ───
-- Si algún item activo quedó con nro_item < 0, la lógica falló y la fila
-- queda en estado roto (UNIQUE viola al insertar item nuevo en esa cat).
-- Este SELECT no afecta data pero queda en logs del runner.
SELECT
    'Renumeración mig 058 completada' AS status,
    SUM(CASE WHEN nro_item < 0 THEN 1 ELSE 0 END) AS items_negativos_pendientes
FROM items_inventario
WHERE activo = 1;
