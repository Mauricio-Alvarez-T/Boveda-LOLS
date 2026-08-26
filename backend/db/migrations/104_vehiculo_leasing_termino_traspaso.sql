-- =============================================
-- 104 — Término del leasing (contrato finalizado) + traspaso
-- =============================================
-- Pedido de jefatura (2026-08-27, segunda vuelta sobre el bloque leasing):
--   · checkbox "Término de leasing": marca que el contrato YA finalizó,
--     con un campo "Traspaso a:" para indicar a quién quedó el vehículo
--     (opción de compra, devolución al banco, venta, etc.).
--   · Un leasing marcado como terminado DEJA DE AVISAR en el contador de
--     vencimientos: ya fue gestionado — la alerta cumplió su ciclo.
--
-- La sección de CUOTAS se retiró del formulario en esta misma vuelta; la tabla
-- vehiculo_leasing_cuotas se conserva con sus datos (histórico, sin UI).
--
-- Idempotente: ADD COLUMN IF NOT EXISTS. Código tolerante a migración
-- pendiente (update filtra columnas existentes; el contador degrada).

ALTER TABLE vehiculos
    ADD COLUMN IF NOT EXISTS leasing_terminado TINYINT(1) NOT NULL DEFAULT 0
        COMMENT 'Contrato de leasing finalizado; en 1 deja de avisar el vencimiento',
    ADD COLUMN IF NOT EXISTS leasing_traspaso_a VARCHAR(200) NULL
        COMMENT 'A quién quedó el vehículo al terminar el leasing (compra, banco, venta...)';
