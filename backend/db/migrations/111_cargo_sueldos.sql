-- ============================================================================
-- 111_cargo_sueldos.sql — Parámetros de sueldo por cargo (plan Gestiones, bloque B3)
-- Fecha: 2026-09-11
--
-- PEDIDO DEL DUEÑO: "Incorporar parámetros de sueldo asociados a cargos específicos
-- (conductor, albañil, enfierrador, etc.)". Decisión 2026-09-10: los parámetros viven
-- SOLO por cargo (no hay monto propio por trabajador) y se imprimen en el contrato de
-- trabajo generado por Bóveda (B5): el contrato congela en su metadata el valor vigente
-- del cargo al momento de emitirlo.
--
-- POR QUÉ TABLA APARTE Y NO COLUMNAS EN `cargos`:
--   GET /api/cargos?activo=true lo consumen los formularios de terreno (ficha de ingreso,
--   WorkerForm) — los supervisores necesitan `cargos.ver`. Una columna de sueldo en
--   `cargos` se filtraría a obra por `SELECT *`. Con tabla propia el único camino a los
--   montos es /api/cargo-sueldos, gateado por `cargos.sueldo.ver` / `.editar`.
--
-- POR QUÉ INT UNSIGNED Y NO DECIMAL: el pool mysql2 (config/db.js) no usa decimalNumbers
-- → DECIMAL llega como string. CLP no lleva decimales; INT UNSIGNED cubre hasta
-- $4.294.967.295.
--
-- POR QUÉ FK ON DELETE RESTRICT: crud.service.js "recicla" un cargo homónimo inactivo con
-- DELETE físico antes de reinsertar; con CASCADE se borraría el historial de sueldos en
-- silencio. RESTRICT → ER_ROW_IS_REFERENCED_2 → 409 legible (errorHandler, B1).
--
-- HISTORIAL: `cargo_sueldos_historial` recibe una fila cada vez que cambia algún monto
-- (append-only, quién y cuándo). Sirve de auditoría y para justificar el monto impreso
-- en un contrato antiguo. No hay vigencia por fechas (no la pidió el dueño).
--
-- PERMISOS: `cargos.sueldo.ver` / `cargos.sueldo.editar` (módulo Cargos; marca $ solo en
-- la UI, NO entran a PERMISOS_FINANCIEROS que es exclusivo de inventario). Decisión del
-- dueño 2026-09-11: la migración SOLO crea el permiso y lo da al Super Administrador
-- (rol 1); la asignación al rol RRHH la hace él a mano en Configuración → Roles + re-login.
-- Catálogo ANTES que rol (FK permisos_rol_v2.permiso_clave → permisos_catalogo.clave).
-- Bump de roles.version del rol 1 → sus sesiones se renuevan al reiniciar el backend.
--
-- IDEMPOTENTE: CREATE TABLE IF NOT EXISTS (índices y FKs dentro), INSERT IGNORE.
-- El bump de versión se ejecuta una vez por corrida de migrate (la migración corre una
-- sola vez gracias a schema_migrations).
-- ============================================================================

CREATE TABLE IF NOT EXISTS cargo_sueldos (
  id INT NOT NULL AUTO_INCREMENT,
  cargo_id INT NOT NULL COMMENT '1:1 con cargos',
  sueldo_base INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'CLP mensual (bruto), se imprime en el contrato',
  bono_colacion INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'CLP mensual',
  bono_movilizacion INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'CLP mensual',
  observaciones VARCHAR(500) NULL,
  actualizado_por INT NULL COMMENT 'usuarios.id del último cambio',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_cargo_sueldos_cargo (cargo_id),
  CONSTRAINT fk_cargo_sueldos_cargo FOREIGN KEY (cargo_id) REFERENCES cargos(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_cargo_sueldos_usuario FOREIGN KEY (actualizado_por) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Parámetros de sueldo vigentes por cargo (plan Gestiones B3)';

CREATE TABLE IF NOT EXISTS cargo_sueldos_historial (
  id INT NOT NULL AUTO_INCREMENT,
  cargo_id INT NOT NULL,
  sueldo_base INT UNSIGNED NOT NULL DEFAULT 0,
  bono_colacion INT UNSIGNED NOT NULL DEFAULT 0,
  bono_movilizacion INT UNSIGNED NOT NULL DEFAULT 0,
  observaciones VARCHAR(500) NULL,
  cambiado_por INT NULL,
  cambiado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_cargo_sueldos_hist_cargo (cargo_id, cambiado_en),
  CONSTRAINT fk_cargo_sueldos_hist_cargo FOREIGN KEY (cargo_id) REFERENCES cargos(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_cargo_sueldos_hist_usuario FOREIGN KEY (cambiado_por) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Append-only: una fila por cada cambio de montos de un cargo';

-- Permisos: catálogo PRIMERO (FK), luego Super Administrador. Mismo texto que permisos.config.js
-- (el sync de arranque lo re-escribe igual, así que no hay drift).
INSERT IGNORE INTO permisos_catalogo (clave, modulo, nombre, descripcion, orden) VALUES
  ('cargos.sueldo.ver',    'Cargos', '$ Ver Parámetros de Sueldo',    'Configuración → Cargos: ver sueldo base, colación y movilización por cargo.', 5),
  ('cargos.sueldo.editar', 'Cargos', '$ Editar Parámetros de Sueldo', 'Configuración → Cargos: modificar los parámetros de sueldo del cargo (queda historial). Requiere también "Ver Parámetros de Sueldo".', 6);

INSERT IGNORE INTO permisos_rol_v2 (rol_id, permiso_clave) VALUES
  (1, 'cargos.sueldo.ver'),
  (1, 'cargos.sueldo.editar');

-- Los permisos viajan en el JWT: bump de versión del rol 1 para forzar re-login.
UPDATE roles SET version = version + 1 WHERE id = 1;
