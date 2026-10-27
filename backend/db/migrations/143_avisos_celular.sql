-- =============================================
-- Migración 143: avisos al celular (notificaciones del navegador)
-- =============================================
-- Marcos 2026-10-27: que a la persona le suene el celular cuando pasa algo en Bóveda, sin SMS ni WhatsApp (no cuestan
-- nada ni piden cuentas nuevas). Cada celular que activa los avisos deja su «suscripción» (la dirección que el navegador
-- da para mandarle avisos; no es el número de teléfono). Prueba piloto: solo el Super Administrador, con el aviso de
-- prueba y «Nueva falla en Soporte» (docs/reglas/seguridad-rbac.md § Avisos al celular).
--
-- avisos_celular_claves: el par de claves con que el servidor firma los avisos (estándar VAPID). Lo crea el backend
-- la primera vez si no viene en el entorno (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY); una sola fila (id = 1).
-- Idempotente: CREATE TABLE IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS avisos_celular_suscripciones (
    id INT AUTO_INCREMENT PRIMARY KEY,
    usuario_id INT NOT NULL,
    endpoint VARCHAR(1000) NOT NULL COMMENT 'Dirección del servicio de avisos del navegador (https)',
    endpoint_hash CHAR(40) NOT NULL COMMENT 'sha1(endpoint): un celular = una fila',
    p256dh VARCHAR(255) NOT NULL,
    auth VARCHAR(100) NOT NULL,
    dispositivo VARCHAR(255) NULL COMMENT 'Navegador y sistema (user-agent), para reconocerlo',
    ultimo_envio DATETIME NULL,
    ultimo_error VARCHAR(255) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_avisos_celular_endpoint (endpoint_hash),
    INDEX idx_avisos_celular_usuario (usuario_id),
    CONSTRAINT fk_avisos_celular_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS avisos_celular_claves (
    id TINYINT UNSIGNED NOT NULL PRIMARY KEY COMMENT 'Siempre 1',
    publica VARCHAR(255) NOT NULL,
    privada VARCHAR(255) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
