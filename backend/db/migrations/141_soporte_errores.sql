-- =============================================
-- Migración 141: «Errores» de Soporte — avisos de los errores que le salen a las personas
-- =============================================
-- Marcos 2026-10-26: cuando a una persona le sale un error, que a Soporte (Marcos y Mauricio) le llegue un aviso, y si
-- es una falla real, con una foto de su pantalla (avisándole a la persona). La app clasifica por el CÓDIGO de la
-- respuesta, no por el cartel rojo (docs/reglas/seguridad-rbac.md § Errores):
--   falla     = el servidor falló (500)                       → aviso + foto
--   app       = la pantalla se rompió (ErrorBoundary)          → aviso + foto
--   permiso   = le falta un permiso (403 con `required`)       → aviso, sin foto (dice qué permiso)
--   lento     = tardó mucho, se cortó o el servidor no respondió (502/503/504) → solo se cuenta
--   sin_senal = el teléfono no tenía internet                  → solo se cuenta
--   dato      = algo mal ingresado o una regla (400/404/409/413/422) → solo se cuenta
-- Un error que se repite (misma persona, misma `firma`) en 10 minutos suma `veces` en la misma fila.
-- La foto (≤ 200 KB, comprimida en el teléfono) vive en la fila como las de Ideas (mig 121) y se borra a los 30 días
-- (`foto_borrada_en`); el servidor la pide solo para falla/app y con topes por persona, por día y en total.
-- Idempotente: CREATE TABLE IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS soporte_errores (
    id INT AUTO_INCREMENT PRIMARY KEY,
    usuario_id INT NOT NULL,
    categoria ENUM('falla','app','permiso','lento','sin_senal','dato') NOT NULL,
    firma CHAR(40) NOT NULL COMMENT 'sha1(categoria|mensaje|accion|pantalla): agrupa los repetidos',
    mensaje VARCHAR(300) NOT NULL COMMENT 'Lo que la app le mostró (o lo que pasó)',
    accion VARCHAR(255) NULL COMMENT 'Lo que la app le pidió al servidor: «POST /api/transferencias/:id/recibir»',
    codigo SMALLINT NULL COMMENT 'Código de la respuesta; NULL = no llegó respuesta o fue la pantalla',
    permisos_faltantes VARCHAR(500) NULL COMMENT 'Permiso: las claves que pidió el servidor, separadas por coma',
    detalle_tecnico TEXT NULL COMMENT 'Pantalla rota: el error y dónde (recortado)',
    pantalla VARCHAR(255) NULL COMMENT 'Ruta (path + query)',
    pantalla_nombre VARCHAR(120) NULL,
    obra_id INT NULL COMMENT 'Obra elegida en ese momento',
    dispositivo ENUM('movil','escritorio') NULL,
    navegador VARCHAR(255) NULL,
    duracion_ms INT UNSIGNED NULL COMMENT 'Cuánto esperó la respuesta',
    veces INT UNSIGNED NOT NULL DEFAULT 1,
    primera_vez DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ultima_vez DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    foto MEDIUMBLOB NULL COMMENT 'Foto de la pantalla (≤ 200 KB)',
    foto_mime VARCHAR(20) NULL,
    foto_bytes INT UNSIGNED NULL,
    foto_pedida TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1 = el servidor pidió la foto (se acepta una sola vez)',
    foto_borrada_en DATETIME NULL COMMENT 'Se borró por los 30 días o la quitó la persona',
    descripcion VARCHAR(1000) NULL COMMENT 'Lo que escribió la persona («Contar qué pasó»)',
    estado ENUM('pendiente','revisado') NOT NULL DEFAULT 'pendiente',
    nota VARCHAR(1000) NULL COMMENT 'Solo Soporte: qué se hizo',
    revisado_por INT NULL,
    revisado_en DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_soporte_errores_firma (usuario_id, firma, ultima_vez),
    INDEX idx_soporte_errores_estado (categoria, estado, ultima_vez),
    INDEX idx_soporte_errores_fecha (created_at),
    CONSTRAINT fk_soporte_errores_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_soporte_errores_revisor FOREIGN KEY (revisado_por) REFERENCES usuarios(id) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT fk_soporte_errores_obra FOREIGN KEY (obra_id) REFERENCES obras(id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
