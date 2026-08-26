-- =============================================
-- 105 — Checkbox "Avisar 30 días antes" por registro
-- =============================================
-- Pedido 2026-08-27: cada registro del vehículo (documento, revisión,
-- mantención) lleva su propio check "Avisar 30 días antes". Solo los marcados
-- cuentan en el número del menú Vehículos (y panel + bandeja del Inicio).
--
-- DEFAULT 1 en los tres: todo lo ya cargado sigue avisando igual que hoy —
-- la migración no silencia nada; desmarcar es decisión explícita por registro.
--
-- Es el mismo patrón que avisar_alerta_seguro (mig 103, a nivel vehículo),
-- ahora a nivel de registro. Idempotente: ADD COLUMN IF NOT EXISTS.

ALTER TABLE vehiculo_documentos
    ADD COLUMN IF NOT EXISTS avisar_30d TINYINT(1) NOT NULL DEFAULT 1
        COMMENT 'Si 0, este documento no cuenta en el aviso de vencimientos';

ALTER TABLE vehiculo_revisiones
    ADD COLUMN IF NOT EXISTS avisar_30d TINYINT(1) NOT NULL DEFAULT 1
        COMMENT 'Si 0, esta revisión no cuenta en el aviso de vencimientos';

ALTER TABLE vehiculo_mantenciones
    ADD COLUMN IF NOT EXISTS avisar_30d TINYINT(1) NOT NULL DEFAULT 1
        COMMENT 'Si 0, esta mantención no cuenta en el aviso de vencimientos';
