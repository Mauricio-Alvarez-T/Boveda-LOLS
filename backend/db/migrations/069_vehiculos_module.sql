-- ─────────────────────────────────────────────────────────────────────
-- 069 — Módulo Vehículos
-- ─────────────────────────────────────────────────────────────────────
-- Crea las tablas del módulo de control vehicular:
--   · vehiculos          — registro base del vehículo
--   · vehiculo_seguros   — seguros (SOAP, complementario, etc.)
--   · vehiculo_revisiones — revisiones técnicas/gases/mecánica
--   · vehiculo_mantenciones — historial de mantenciones por km
--
-- También agrega los campos de licencia de conducir a la tabla
-- trabajadores (licencia_conducir, licencia_vencimiento).
--
-- Los permisos se insertan en permisos_catalogo via INSERT IGNORE.
-- Idempotente: CREATE TABLE IF NOT EXISTS, ALTER IF NOT EXISTS,
--              INSERT IGNORE.
-- ─────────────────────────────────────────────────────────────────────

-- 1. Tabla base de vehículos
CREATE TABLE IF NOT EXISTS vehiculos (
    id                  INT AUTO_INCREMENT PRIMARY KEY,
    patente             VARCHAR(20)  NOT NULL UNIQUE,
    marca               VARCHAR(100) NOT NULL,
    modelo              VARCHAR(100) NOT NULL,
    anio                INT          NOT NULL,
    tipo                ENUM('camioneta','camion','auto','furgon','bus','otro') NOT NULL DEFAULT 'camioneta',
    kilometraje_actual  INT          NOT NULL DEFAULT 0,
    color               VARCHAR(50)  NULL,
    observaciones       TEXT         NULL,
    activo              BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Seguros
CREATE TABLE IF NOT EXISTS vehiculo_seguros (
    id                  INT AUTO_INCREMENT PRIMARY KEY,
    vehiculo_id         INT          NOT NULL,
    tipo                ENUM('SOAP','complementario','otro') NOT NULL DEFAULT 'SOAP',
    compania            VARCHAR(200) NULL,
    numero_poliza       VARCHAR(100) NULL,
    fecha_inicio        DATE         NOT NULL,
    fecha_vencimiento   DATE         NOT NULL,
    monto               DECIMAL(12,2) NULL,
    observaciones       TEXT         NULL,
    activo              BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (vehiculo_id) REFERENCES vehiculos(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Revisiones técnicas
CREATE TABLE IF NOT EXISTS vehiculo_revisiones (
    id                  INT AUTO_INCREMENT PRIMARY KEY,
    vehiculo_id         INT          NOT NULL,
    tipo                ENUM('tecnica','gases','mecanica') NOT NULL,
    fecha               DATE         NOT NULL,
    fecha_vencimiento   DATE         NOT NULL,
    resultado           ENUM('aprobado','rechazado','pendiente') NOT NULL DEFAULT 'aprobado',
    planta              VARCHAR(200) NULL,
    observaciones       TEXT         NULL,
    activo              BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (vehiculo_id) REFERENCES vehiculos(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Mantenciones
CREATE TABLE IF NOT EXISTS vehiculo_mantenciones (
    id                  INT AUTO_INCREMENT PRIMARY KEY,
    vehiculo_id         INT          NOT NULL,
    fecha               DATE         NOT NULL,
    tipo                VARCHAR(200) NOT NULL,
    km_al_realizar      INT          NOT NULL,
    descripcion         TEXT         NULL,
    costo               DECIMAL(12,2) NULL,
    taller              VARCHAR(200) NULL,
    activo              BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (vehiculo_id) REFERENCES vehiculos(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Campos de licencia en trabajadores
ALTER TABLE trabajadores
    ADD COLUMN IF NOT EXISTS licencia_conducir   VARCHAR(50) NULL
        COMMENT 'Clase/tipo de licencia de conducir',
    ADD COLUMN IF NOT EXISTS licencia_vencimiento DATE NULL
        COMMENT 'Fecha de vencimiento de la licencia de conducir';

-- 6. Permisos del módulo Vehículos
INSERT IGNORE INTO permisos_catalogo (clave, modulo, nombre, descripcion, orden) VALUES
    ('vehiculos.ver',      'Vehículos', 'Ver Vehículos',       'Acceso al módulo de vehículos: listado y detalle', 1),
    ('vehiculos.crear',    'Vehículos', 'Crear Vehículo',      'Registrar nuevos vehículos, seguros, revisiones y mantenciones', 2),
    ('vehiculos.editar',   'Vehículos', 'Editar Vehículo',     'Modificar datos de vehículos, seguros, revisiones y mantenciones', 3),
    ('vehiculos.eliminar', 'Vehículos', 'Eliminar Vehículo',   'Dar de baja vehículos y sus registros asociados', 4);

-- 7. Asignar todos los permisos de Vehículos al Super Admin (rol_id=1)
INSERT IGNORE INTO permisos_rol_v2 (rol_id, permiso_clave)
SELECT 1, clave FROM permisos_catalogo WHERE modulo = 'Vehículos';
