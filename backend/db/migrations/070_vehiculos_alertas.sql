-- ──────────────────────────────────────────────────────────────────
-- 070 — Campos de configuración de alertas en módulo Vehículos
-- ──────────────────────────────────────────────────────────────────
-- Agrega a seguros, revisiones y mantenciones los campos necesarios
-- para programar alertas automáticas (email / WhatsApp) con X días
-- de anticipación al vencimiento o fecha programada.
-- Idempotente: ADD COLUMN IF NOT EXISTS.
-- ──────────────────────────────────────────────────────────────────

ALTER TABLE vehiculo_seguros
    ADD COLUMN IF NOT EXISTS dias_alerta   INT          NULL DEFAULT 30
        COMMENT 'Días antes del vencimiento para enviar alerta',
    ADD COLUMN IF NOT EXISTS email_alerta  VARCHAR(200) NULL
        COMMENT 'Email al que se envía la alerta de vencimiento',
    ADD COLUMN IF NOT EXISTS tel_alerta    VARCHAR(30)  NULL
        COMMENT 'Teléfono WhatsApp para alerta (formato +56 9 XXXX XXXX)';

ALTER TABLE vehiculo_revisiones
    ADD COLUMN IF NOT EXISTS dias_alerta   INT          NULL DEFAULT 30
        COMMENT 'Días antes del vencimiento para enviar alerta',
    ADD COLUMN IF NOT EXISTS email_alerta  VARCHAR(200) NULL
        COMMENT 'Email al que se envía la alerta de vencimiento',
    ADD COLUMN IF NOT EXISTS tel_alerta    VARCHAR(30)  NULL
        COMMENT 'Teléfono WhatsApp para alerta';

ALTER TABLE vehiculo_mantenciones
    ADD COLUMN IF NOT EXISTS dias_alerta   INT          NULL DEFAULT 30
        COMMENT 'Días antes de la fecha programada para enviar alerta',
    ADD COLUMN IF NOT EXISTS email_alerta  VARCHAR(200) NULL
        COMMENT 'Email al que se envía la alerta',
    ADD COLUMN IF NOT EXISTS tel_alerta    VARCHAR(30)  NULL
        COMMENT 'Teléfono WhatsApp para alerta',
    ADD COLUMN IF NOT EXISTS fecha_proxima DATE         NULL
        COMMENT 'Fecha programada para la próxima mantención';
