-- ──────────────────────────────────────────────────────────────────
-- 081 — Hora del aviso de alerta en módulo Vehículos
-- ──────────────────────────────────────────────────────────────────
-- Permite elegir a qué HORA del día se envía el recordatorio (además de
-- los días de anticipación). Default 08:00 → mantiene el comportamiento
-- actual (cron diario a las 08:00). Para usar horas personalizadas, el
-- cron de cPanel debe correr cada hora (0 * * * *) y filtrar por hora.
-- Idempotente: ADD COLUMN IF NOT EXISTS.
-- ──────────────────────────────────────────────────────────────────

ALTER TABLE vehiculo_seguros
    ADD COLUMN IF NOT EXISTS hora_alerta TIME NULL DEFAULT '08:00:00'
        COMMENT 'Hora del día para enviar la alerta (default 08:00)';

ALTER TABLE vehiculo_revisiones
    ADD COLUMN IF NOT EXISTS hora_alerta TIME NULL DEFAULT '08:00:00'
        COMMENT 'Hora del día para enviar la alerta (default 08:00)';

ALTER TABLE vehiculo_mantenciones
    ADD COLUMN IF NOT EXISTS hora_alerta TIME NULL DEFAULT '08:00:00'
        COMMENT 'Hora del día para enviar la alerta (default 08:00)';
