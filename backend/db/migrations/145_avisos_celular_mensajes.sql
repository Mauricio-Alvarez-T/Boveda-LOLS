-- =============================================
-- Migración 145: centro de avisos — cada aviso mandado y su acuse (llegó / lo abrió / lo descartó)
-- =============================================
-- Marcos 2026-10-27: que Soporte (Marcos y Mauricio) vea si a cada persona le llegaron los avisos y si los abrió,
-- para que nadie diga «no me avisaron» si el aviso le llegó. Una fila por aviso y por equipo (celular o computador).
-- El archivo del navegador (`public/sw-avisos.js`) confirma solo, sin sesión, con el id y una clave de un solo uso
-- (`token`) que van dentro del aviso:
--   mostrado_en   = el aviso apareció en el equipo de la persona (le llegó);
--   abierto_en    = lo tocó y abrió Bóveda;
--   descartado_en = lo deslizó sin abrirlo;
--   en_pantalla_en = (recordatorios en el computador) tenía Bóveda abierto y a la vista: no se le mostró, ya estaba ahí.
--                    Al celular los recordatorios llegan SIEMPRE.
-- No se sabe si la persona «lo leyó» con los ojos: lo más cercano es que apareció en su equipo y si lo abrió.
-- Idempotente: CREATE TABLE IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS avisos_celular_mensajes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    usuario_id INT NOT NULL,
    suscripcion_id INT NULL COMMENT 'El equipo (avisos_celular_suscripciones.id); queda aunque el equipo se borre',
    equipo ENUM('celular','computador') NULL,
    tipo VARCHAR(40) NOT NULL COMMENT 'pendientes-8, pendientes-12, prueba, soporte-errores…',
    titulo VARCHAR(80) NOT NULL,
    cuerpo VARCHAR(180) NULL,
    url VARCHAR(255) NULL,
    token CHAR(32) NOT NULL COMMENT 'Clave del acuse (va en el aviso)',
    estado_envio ENUM('enviando','entregado','fallo') NOT NULL DEFAULT 'enviando' COMMENT 'entregado = el servicio de avisos lo aceptó',
    error VARCHAR(255) NULL,
    enviado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    mostrado_en DATETIME NULL,
    abierto_en DATETIME NULL,
    descartado_en DATETIME NULL,
    en_pantalla_en DATETIME NULL,
    INDEX idx_avisos_mensajes_fecha (enviado_en),
    INDEX idx_avisos_mensajes_usuario (usuario_id, enviado_en),
    CONSTRAINT fk_avisos_mensajes_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
