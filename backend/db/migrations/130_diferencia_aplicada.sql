-- ─────────────────────────────────────────────────────────────────────
-- 130 — ¿La diferencia de una transferencia ya está aplicada al stock?
-- ─────────────────────────────────────────────────────────────────────
-- Decisión del dueño 2026-10-21 (reemplaza el modelo de causas de la mig 129):
--   · La recepción mueve SOLO lo ENVIADO. Lo que el receptor declara de más o
--     de menos queda en transferencia_discrepancias como PENDIENTE, SIN tocar
--     el stock (diferencia_aplicada = 0, lo inserta recibir() explícito).
--   · Resolver = APROBAR lo declarado (mueve stock); Descartar = RECHAZARLO
--     (no mueve stock: queda lo enviado).
--
--   diferencia_aplicada → 0 = regla nueva (la diferencia NO está en el stock).
--                         1 = regla anterior (recibir() aplicó lo declarado al
--                             stock). Con esas:
--                             · Resolver (aprobar) la CIERRA SIN MOVER STOCK
--                               (lo declarado ya está en el stock; la respuesta
--                               trae cerrada_regla_anterior: true).
--                             · Descartar (rechazar) responde 409 REGLA_ANTIGUA
--                               hasta que un Super Admin la rehaga
--                               (POST /discrepancias/:id/rehacer).
--   Todas las filas existentes al correr esta migración son de la regla
--   anterior → se marcan 1. Las nuevas llegan con 0 explícito (nunca NULL).
--
-- Borrado (no lo hace esta migración; regla del service):
--   · DELETE de una diferencia pendiente de la regla anterior → 409
--     REGLA_ANTIGUA (primero se aprueba o se rehace); de una que movió stock
--     (al aprobarse o al rehacerse) → 409 CON_AJUSTE.
--   · DELETE de una transferencia con diferencias que movieron stock o
--     pendientes de la regla anterior → 409 (CON_AJUSTE / REGLA_ANTIGUA): el
--     ON DELETE CASCADE ya no se las lleva en silencio.
--   · Un choque con otra transacción (deadlock 1213 / lock wait 1205) al
--     resolver, rehacer o borrar → 409 REINTENTAR.
--
-- La columna `causa` (mig 129) queda sin uso (nullable); `ajuste_stock` se
-- sigue usando ({ ajustes, aviso, rehecha? }).
-- Reglas: docs/reglas/inventario-transferencias.md § Discrepancias.
--
-- Idempotente: ADD COLUMN IF NOT EXISTS (sintaxis MariaDB, mismo criterio que
-- mig 129) + UPDATE solo de las NULL (re-correrla no cambia nada).

ALTER TABLE transferencia_discrepancias
  ADD COLUMN IF NOT EXISTS diferencia_aplicada TINYINT(1) NULL;

UPDATE transferencia_discrepancias
   SET diferencia_aplicada = 1
 WHERE diferencia_aplicada IS NULL;
