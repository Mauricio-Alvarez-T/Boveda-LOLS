-- =============================================
-- 084 — Avisos automáticos ("Resumen de Novedades" diario)
-- =============================================
-- Sistema de avisos por email que LEE la tabla `logs_actividad` (mig 011) y manda
-- un resumen diario de novedades. Dos tablas de configuración (administrables desde
-- la UI) + un permiso. El motor (scripts/avisos_diarios.js + avisosDiarios.service)
-- no se instala aquí, solo lee estas tablas.
-- Idempotente: CREATE TABLE IF NOT EXISTS + INSERT IGNORE.

-- 1. Reglas por categoría: qué se vigila, si está activo y el umbral para incluirlo.
CREATE TABLE IF NOT EXISTS avisos_reglas (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    categoria   VARCHAR(40)  NOT NULL,
    etiqueta    VARCHAR(100) NOT NULL,
    activo      BOOLEAN      NOT NULL DEFAULT TRUE,
    umbral      INT          NOT NULL DEFAULT 1,   -- mínimo de eventos en el día para incluir la categoría
    orden       INT          NOT NULL DEFAULT 0,
    created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_avisos_reglas_categoria (categoria)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Categorías vigiladas por el resumen diario de novedades.';

-- Seed de las 5 categorías (editables desde la UI). Umbrales default sensatos:
-- volumen (trabajadores/inventario) > 1; sensibles (roles/permisos, vehículos, obras) = 1.
INSERT IGNORE INTO avisos_reglas (categoria, etiqueta, activo, umbral, orden) VALUES
    ('trabajadores',   'Trabajadores nuevos',     TRUE, 3, 1),
    ('roles_permisos', 'Roles y permisos',        TRUE, 1, 2),
    ('inventario',     'Ítems de inventario nuevos', TRUE, 5, 3),
    ('vehiculos',      'Vehículos nuevos',        TRUE, 1, 4),
    ('obras',          'Obras nuevas',            TRUE, 1, 5);

-- 2. Destinatarios del resumen (espejo de reportes_suscriptores, mig 067).
CREATE TABLE IF NOT EXISTS avisos_suscriptores (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    email       VARCHAR(255) NOT NULL,
    nombre      VARCHAR(150) NULL,
    activo      BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_avisos_suscriptores_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Destinatarios del resumen diario de novedades.';

-- 3. Permiso de gestión (el catálogo se auto-sincroniza desde permisos.config.js;
--    aquí solo se asigna a Super Admin rol_id=1, igual que mig 067).
INSERT IGNORE INTO permisos_rol_v2 (rol_id, permiso_clave) VALUES
    (1, 'sistema.avisos.gestionar');
