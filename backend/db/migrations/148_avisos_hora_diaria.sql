-- =============================================
-- Migración 148: recordatorio de pendientes UNA vez al día, a una hora que se cambia desde Bóveda + re-login
-- =============================================
-- Marcos 2026-11-02, a pedido de Daphne: los recordatorios de pendientes (avisosPendientes.service.js) llegaban dos
-- veces al día (8 y 12, Paula 8 y 14, don Luis 12). Ahora llegan UNA vez al día a todos, a la misma hora: parte en las
-- 8:00 y el Super Administrador la cambia en Soporte → Errores → Centro de avisos (PUT /api/avisos-celular/hora).
--
-- Tabla NUEVA `avisos_celular_ajustes` (una sola fila, id = 1). Nada se calcula ni se rellena: si la tabla no está,
-- el backend usa las 8.
--
-- Re-login (Marcos 2026-11-02): con esta versión, en vez de la pantalla «Activar avisos» sale la franja «Active los
-- avisos de sus pendientes» (ActivarAvisos.tsx). Para que todos la vean al volver a entrar, roles.version + 1 de todos
-- los roles (los tokens viejos dejan de valer; corre cuando el auto-migrate reinicia el backend). Nunca el rol 1.
-- Idempotente: CREATE TABLE IF NOT EXISTS + INSERT IGNORE; repetirla solo vuelve a subir las versiones.

CREATE TABLE IF NOT EXISTS avisos_celular_ajustes (
    id TINYINT UNSIGNED NOT NULL PRIMARY KEY COMMENT 'Siempre 1',
    hora_recordatorios TINYINT UNSIGNED NOT NULL DEFAULT 8 COMMENT 'Hora de Chile (6 a 20) del recordatorio diario de pendientes',
    actualizado_por INT NULL COMMENT 'usuarios.id de quien la cambió por última vez',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO avisos_celular_ajustes (id, hora_recordatorios) VALUES (1, 8);

UPDATE roles
SET version = version + 1
WHERE id <> 1;
