-- =============================================
-- Migración 144: recordatorios de pendientes al celular — registro de cada envío
-- =============================================
-- Marcos 2026-10-27 (decisión de don Luis): de lunes a viernes, sin feriados, a las horas de cada persona, un aviso
-- con lo pendiente de su cargo (solo si tiene algo). Lo manda el cron (scripts/avisos_programados.js,
-- avisosPendientes.service.js). Una fila por persona, día y hora: el cron pasa cada 5 minutos y la fila evita mandar
-- el mismo recordatorio dos veces (INSERT IGNORE antes de mandar). También sirve para ver en Soporte a quién le llegó.
-- Idempotente: CREATE TABLE IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS avisos_celular_envios (
    usuario_id INT NOT NULL,
    fecha DATE NOT NULL,
    hora TINYINT UNSIGNED NOT NULL COMMENT 'Hora de Chile de la ronda (8, 12, 14…)',
    pendientes SMALLINT UNSIGNED NULL COMMENT 'Cuántos temas tenía (0 = al día: no se le mandó nada)',
    enviados SMALLINT UNSIGNED NULL COMMENT 'A cuántos celulares salió',
    resumen VARCHAR(255) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (usuario_id, fecha, hora),
    INDEX idx_avisos_envios_fecha (fecha),
    CONSTRAINT fk_avisos_envios_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
