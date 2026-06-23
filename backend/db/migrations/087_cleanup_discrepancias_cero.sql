-- ─────────────────────────────────────────────────────────────────────
-- 087 — Limpieza de discrepancias fantasma (diferencia = 0)
-- ─────────────────────────────────────────────────────────────────────
-- Una discrepancia de transferencia con diferencia 0 (enviado == recibido) es
-- semánticamente imposible. Se generaron por un bug de coerción de tipos en
-- recibir(): mysql2 devuelve DECIMAL como string, y el guard
-- `totalRecibidoFinal !== enviadaMap[item]` comparaba number vs string (siempre
-- true) → insertaba una discrepancia por cada ítem aunque las cantidades
-- cuadraran. Apareció tras la mig 052 (cantidades INT → DECIMAL).
-- La raíz se corrige en recibir() (Number(...)); acá se limpian las filas ya creadas.
--
-- Idempotente: una discrepancia legítima nunca tiene diferencia 0, así que
-- re-ejecutar no borra nada extra.

DELETE FROM transferencia_discrepancias WHERE diferencia = 0;
