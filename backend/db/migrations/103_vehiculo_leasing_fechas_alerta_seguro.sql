-- =============================================
-- 103 — Leasing con fechas de contrato + flag de alerta de seguro
-- =============================================
-- Pedidos de jefatura (2026-08-27):
--   · fecha de inicio y de término del leasing (antes solo había cuotas sueltas),
--   · alerta 30 días antes del FIN del leasing → leasing_fecha_termino alimenta
--     el contador de vencimientos del módulo (badge del menú + panel + Inicio),
--   · checkbox "Avisar alerta de seguro" por vehículo: si se desmarca, los
--     seguros de ese vehículo no cuentan en el aviso. DEFAULT 1 = todos avisan,
--     igual que hoy (la migración no silencia nada existente).
--
-- El "Pagada" de las cuotas se retiró de la UI; la columna
-- vehiculo_leasing_cuotas.pagada se conserva (datos históricos, sin uso).
--
-- Idempotente: ADD COLUMN IF NOT EXISTS. El código es tolerante a esta
-- migración pendiente (buildUpdate filtra columnas existentes; las consultas
-- del contador degradan si la columna aún no está).

ALTER TABLE vehiculos
    ADD COLUMN IF NOT EXISTS leasing_fecha_inicio DATE NULL
        COMMENT 'Inicio del contrato de leasing (solo si es_leasing)',
    ADD COLUMN IF NOT EXISTS leasing_fecha_termino DATE NULL
        COMMENT 'Fin del contrato de leasing; entra al contador de vencimientos (30 días antes)',
    ADD COLUMN IF NOT EXISTS avisar_alerta_seguro TINYINT(1) NOT NULL DEFAULT 1
        COMMENT 'Si 0, los seguros de este vehículo no cuentan en el aviso de vencimientos';
