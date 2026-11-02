-- =============================================
-- Migración 149: el aviso de errores a los programadores, solo en horario hábil
-- =============================================
-- Marcos 2026-11-02: el aviso de un error por revisar a Marcos y Mauricio (celular + correo, soporteErrores.service.js)
-- sale al instante solo en días hábiles (lunes a viernes, sin feriados) de 7:30 a 18:00, hora de Chile. Lo que llega
-- fuera de ese horario queda marcado aquí y les llega en UN aviso apenas empieza el siguiente horario (lo manda el cron:
-- scripts/avisos_programados.js → soporteErrores.avisarFueraDeHorario, que lo vuelve a 0).
--
-- Columna NUEVA: `soporte_errores.aviso_pendiente` (0 = nada que avisar; todas las filas existentes quedan así).
-- Idempotente: ADD COLUMN / ADD INDEX IF NOT EXISTS (MariaDB 10.6). Sin UPDATE ni DELETE.

ALTER TABLE soporte_errores
    ADD COLUMN IF NOT EXISTS aviso_pendiente TINYINT(1) NOT NULL DEFAULT 0
        COMMENT '1 = llegó fuera del horario hábil (lun-vie sin feriados, 7:30 a 18:00): falta avisar a los programadores (mig 149)';

ALTER TABLE soporte_errores
    ADD INDEX IF NOT EXISTS idx_soporte_errores_aviso_pendiente (aviso_pendiente);
