-- =============================================
-- 108 — Ficha de ingreso digital: solicitudes_ingreso + datos personales del trabajador
-- =============================================
-- Hoy la "ficha de ingreso" es papel: supervisores/prevencionistas la llenan a
-- mano en obra y un administrativo la transcribe a Bóveda. Se digitaliza el
-- flujo completo (decisión del dueño 2026-09-07):
--   terreno crea una SOLICITUD desde Consultas → oficina la revisa (aprobar /
--   corregir / rechazar con motivo) → al aprobar se crea el trabajador.
--
-- Tres bloques, todos idempotentes:
--   1. Columnas opcionales de la ficha en `trabajadores` (la ficha digital
--      reemplaza el papel: los datos viven en el trabajador, editables en
--      WorkerForm). Todas NULL — solo RUT, nombres, apellidos, cargo, obra y
--      fecha de ingreso son obligatorios. `telefono` ya existía (mig 002).
--      Se formaliza de paso el drift `fecha_desvinculacion` (la columna existe
--      en prod/staging porque migrate.js la agrega en su bootstrap, pero ningún
--      archivo de migración la declaraba).
--   2. Tabla `solicitudes_ingreso`: copia de la ficha + estado + auditoría de
--      quién solicitó y quién resolvió. `empresa_id` la define la OFICINA al
--      aprobar (terreno no la llena). `trabajador_id` apunta al trabajador
--      creado al aprobar (ON DELETE SET NULL: depurar un finiquitado no debe
--      fallar por la solicitud histórica).
--   3. Permisos `trabajadores.solicitud.crear` (terreno) y
--      `trabajadores.solicitud.aprobar` (oficina). Catálogo PRIMERO y luego
--      rol: `permisos_rol_v2.permiso_clave` tiene FK a `permisos_catalogo.clave`
--      (mismo patrón que mig 098). Solo Super Admin (rol 1) los recibe acá; los
--      roles de terreno/oficina se asignan desde Configuración → re-login.
--
-- Idempotente: ADD COLUMN IF NOT EXISTS (patrón migs 081/100/102), CREATE TABLE
-- IF NOT EXISTS con FKs e índices DENTRO del CREATE (patrón mig 018/094),
-- INSERT IGNORE (permisos_catalogo.clave UNIQUE; permisos_rol_v2 PK compuesta).

-- ─── 1. Datos personales de la ficha en trabajadores ───
ALTER TABLE trabajadores
    ADD COLUMN IF NOT EXISTS fecha_nacimiento DATE NULL,
    ADD COLUMN IF NOT EXISTS estado_civil VARCHAR(30) NULL,
    ADD COLUMN IF NOT EXISTS direccion VARCHAR(255) NULL,
    ADD COLUMN IF NOT EXISTS comuna VARCHAR(100) NULL,
    ADD COLUMN IF NOT EXISTS afp VARCHAR(60) NULL,
    ADD COLUMN IF NOT EXISTS salud VARCHAR(60) NULL,
    ADD COLUMN IF NOT EXISTS nacionalidad VARCHAR(60) NULL,
    ADD COLUMN IF NOT EXISTS cargas_familiares TINYINT UNSIGNED NULL,
    ADD COLUMN IF NOT EXISTS fecha_desvinculacion DATE NULL;

-- ─── 2. Solicitudes de ingreso ───
CREATE TABLE IF NOT EXISTS solicitudes_ingreso (
    id INT AUTO_INCREMENT PRIMARY KEY,
    estado ENUM('pendiente','aprobada','rechazada') NOT NULL DEFAULT 'pendiente',

    -- Ficha (○ obligatorios / — opcionales). rut se guarda con formatRut
    -- (XX.XXX.XXX-X); NO es UNIQUE: un RUT rechazado puede volver a solicitarse.
    rut VARCHAR(12) NOT NULL,
    nombres VARCHAR(100) NOT NULL,
    apellido_paterno VARCHAR(100) NOT NULL,
    apellido_materno VARCHAR(100) NULL,
    cargo_id INT NULL,
    obra_id INT NULL,
    empresa_id INT NULL COMMENT 'La define la oficina al aprobar; terreno no la llena',
    fecha_ingreso DATE NOT NULL,
    fecha_nacimiento DATE NULL,
    estado_civil VARCHAR(30) NULL,
    direccion VARCHAR(255) NULL,
    comuna VARCHAR(100) NULL,
    afp VARCHAR(60) NULL,
    salud VARCHAR(60) NULL,
    nacionalidad VARCHAR(60) NULL,
    telefono VARCHAR(20) NULL,
    cargas_familiares TINYINT UNSIGNED NULL,
    observaciones TEXT NULL,

    -- Auditoría del flujo
    solicitante_id INT NOT NULL,
    fecha_solicitud DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resuelto_por INT NULL,
    fecha_resolucion DATETIME NULL,
    motivo_rechazo TEXT NULL COMMENT 'Obligatorio al rechazar; visible al solicitante',
    trabajador_id INT NULL COMMENT 'Trabajador creado al aprobar',

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_solicing_estado (estado),
    INDEX idx_solicing_solicitante (solicitante_id),
    INDEX idx_solicing_rut (rut),

    CONSTRAINT fk_solicing_cargo FOREIGN KEY (cargo_id) REFERENCES cargos(id) ON DELETE SET NULL,
    CONSTRAINT fk_solicing_obra FOREIGN KEY (obra_id) REFERENCES obras(id) ON DELETE SET NULL,
    CONSTRAINT fk_solicing_empresa FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE SET NULL,
    CONSTRAINT fk_solicing_solicitante FOREIGN KEY (solicitante_id) REFERENCES usuarios(id),
    CONSTRAINT fk_solicing_resuelto_por FOREIGN KEY (resuelto_por) REFERENCES usuarios(id),
    CONSTRAINT fk_solicing_trabajador FOREIGN KEY (trabajador_id) REFERENCES trabajadores(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── 3. Permisos ───
-- Mismo texto que backend/src/config/permisos.config.js (el arranque del
-- backend sincroniza nombre/descripción por clave; acá importa que la CLAVE
-- exista antes de asignarla al rol).
INSERT IGNORE INTO permisos_catalogo (clave, modulo, nombre, descripcion, orden) VALUES
    ('trabajadores.solicitud.crear',   'Trabajadores', 'Solicitar Ingreso de Trabajador',          'Consultas → botón "Nuevo ingreso": permite llenar la ficha de ingreso digital (solicitud) de un trabajador nuevo SIN necesidad de "Crear Trabajador". La solicitud queda pendiente hasta que oficina la apruebe. Pensado para supervisores / prevencionistas en terreno.', 9),
    ('trabajadores.solicitud.aprobar', 'Trabajadores', 'Aprobar / Rechazar Solicitudes de Ingreso', 'Consultas → Solicitudes: permite revisar las fichas de ingreso pendientes, corregirlas, asignar la empresa y aprobarlas (crea el trabajador) o rechazarlas con motivo. Habilita el contador de pendientes en el menú.', 10);

-- Super Admin (rol_id = 1), mismo patrón que las migraciones 043/044/046/098.
INSERT IGNORE INTO permisos_rol_v2 (rol_id, permiso_clave) VALUES
    (1, 'trabajadores.solicitud.crear'),
    (1, 'trabajadores.solicitud.aprobar');
