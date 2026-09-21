-- =============================================
-- 116 — Sábados Extra → "Lista de trabajadores en actividades sugeridas"
-- =============================================
-- Jefatura (2026-09-21): eliminar toda referencia a que los trabajos
-- extraordinarios sean "trabajos de los días sábados". El módulo pasa a
-- llamarse actividades_sugeridas y deja de fijar un DÍA: cada lista se asigna
-- a una SEMANA (lunes a viernes), guardada por su lunes en la columna `semana`.
--
-- Bloques, todos idempotentes (guardas information_schema + PREPARE; MariaDB
-- en prod no soporta RENAME TABLE ... IF EXISTS):
--   1. RENAME de las dos tablas (038): sabados_extra → actividades_sugeridas,
--      sabados_extra_trabajadores → actividades_sugeridas_trabajadores.
--   2. Columnas: fecha → semana (DATE, lunes de la semana);
--      sabado_id → actividad_id (se suelta antes la FK fk_set_sabado).
--   3. Datos: cada sábado histórico pasa al lunes de su semana
--      (DATE_SUB(semana, INTERVAL WEEKDAY(semana) DAY); WEEKDAY: lun=0).
--      Dos sábados de una misma obra nunca comparten semana lun–vie →
--      la UNIQUE (obra, semana) no colisiona.
--   4. Índices y FKs con nombres nuevos (ADD nuevo → DROP viejo; InnoDB no
--      deja soltar un índice que una FK todavía necesita).
--   5. Permisos: asistencia.sabados_extra.* → asistencia.actividades_sugeridas.*
--      Orden obligatorio por la FK de permisos_rol_v2/permisos_usuario_override
--      → permisos_catalogo(clave) ON DELETE CASCADE: INSERT nuevas → UPDATE
--      hijos → DELETE viejas (precedente trabajadores.purgar → depurar).
--   6. roles.version + 1 en TODOS los roles: las claves viajan en el JWT →
--      re-login general (el auto-migrate reinicia Passenger y versionService
--      relee las versiones).
-- Las columnas muertas horas_default / horas_trabajadas se conservan.

-- ─────────────────────────────────────────────
-- 1. RENAME TABLE (cabecera y detalle)
-- ─────────────────────────────────────────────
SET @old_tbl := (SELECT COUNT(*) FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sabados_extra');
SET @new_tbl := (SELECT COUNT(*) FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'actividades_sugeridas');
SET @sql := IF(@old_tbl = 1 AND @new_tbl = 0,
    'RENAME TABLE sabados_extra TO actividades_sugeridas',
    'SELECT "actividades_sugeridas: rename cabecera ya aplicado" AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @old_tbl := (SELECT COUNT(*) FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sabados_extra_trabajadores');
SET @new_tbl := (SELECT COUNT(*) FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'actividades_sugeridas_trabajadores');
SET @sql := IF(@old_tbl = 1 AND @new_tbl = 0,
    'RENAME TABLE sabados_extra_trabajadores TO actividades_sugeridas_trabajadores',
    'SELECT "actividades_sugeridas_trabajadores: rename detalle ya aplicado" AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ─────────────────────────────────────────────
-- 2. Columnas: fecha → semana ; sabado_id → actividad_id
-- ─────────────────────────────────────────────
SET @col_old := (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'actividades_sugeridas' AND COLUMN_NAME = 'fecha');
SET @col_new := (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'actividades_sugeridas' AND COLUMN_NAME = 'semana');
SET @sql := IF(@col_old = 1 AND @col_new = 0,
    'ALTER TABLE actividades_sugeridas CHANGE COLUMN fecha semana DATE NOT NULL',
    'SELECT "actividades_sugeridas.semana ya existe" AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- FK vieja del detalle hacia la cabecera: se suelta antes de renombrar la columna.
SET @fk_exists := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'actividades_sugeridas_trabajadores'
      AND CONSTRAINT_NAME = 'fk_set_sabado' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@fk_exists = 1,
    'ALTER TABLE actividades_sugeridas_trabajadores DROP FOREIGN KEY fk_set_sabado',
    'SELECT "fk_set_sabado ya no existe" AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_old := (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'actividades_sugeridas_trabajadores' AND COLUMN_NAME = 'sabado_id');
SET @col_new := (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'actividades_sugeridas_trabajadores' AND COLUMN_NAME = 'actividad_id');
SET @sql := IF(@col_old = 1 AND @col_new = 0,
    'ALTER TABLE actividades_sugeridas_trabajadores CHANGE COLUMN sabado_id actividad_id INT NOT NULL',
    'SELECT "actividades_sugeridas_trabajadores.actividad_id ya existe" AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ─────────────────────────────────────────────
-- 3. Datos: sábado histórico → lunes de su semana (idempotente)
-- ─────────────────────────────────────────────
UPDATE actividades_sugeridas
SET semana = DATE_SUB(semana, INTERVAL WEEKDAY(semana) DAY)
WHERE WEEKDAY(semana) <> 0;

-- ─────────────────────────────────────────────
-- 4. Índices y FKs con nombres nuevos (ADD nuevo → DROP viejo)
-- ─────────────────────────────────────────────
-- Cabecera: UNIQUE (obra, semana)
SET @idx := (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'actividades_sugeridas' AND INDEX_NAME = 'uniq_obra_semana');
SET @sql := IF(@idx = 0,
    'ALTER TABLE actividades_sugeridas ADD UNIQUE KEY uniq_obra_semana (obra_id, semana)',
    'SELECT "uniq_obra_semana ya existe" AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx := (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'actividades_sugeridas' AND INDEX_NAME = 'uniq_obra_fecha');
SET @sql := IF(@idx > 0,
    'ALTER TABLE actividades_sugeridas DROP INDEX uniq_obra_fecha',
    'SELECT "uniq_obra_fecha ya no existe" AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Cabecera: índice por semana
SET @idx := (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'actividades_sugeridas' AND INDEX_NAME = 'idx_semana');
SET @sql := IF(@idx = 0,
    'ALTER TABLE actividades_sugeridas ADD INDEX idx_semana (semana)',
    'SELECT "idx_semana ya existe" AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx := (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'actividades_sugeridas' AND INDEX_NAME = 'idx_fecha');
SET @sql := IF(@idx > 0,
    'ALTER TABLE actividades_sugeridas DROP INDEX idx_fecha',
    'SELECT "idx_fecha ya no existe" AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Detalle: UNIQUE (actividad, trabajador) e índice por actividad
SET @idx := (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'actividades_sugeridas_trabajadores' AND INDEX_NAME = 'uniq_actividad_trabajador');
SET @sql := IF(@idx = 0,
    'ALTER TABLE actividades_sugeridas_trabajadores ADD UNIQUE KEY uniq_actividad_trabajador (actividad_id, trabajador_id)',
    'SELECT "uniq_actividad_trabajador ya existe" AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx := (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'actividades_sugeridas_trabajadores' AND INDEX_NAME = 'uniq_sabado_trabajador');
SET @sql := IF(@idx > 0,
    'ALTER TABLE actividades_sugeridas_trabajadores DROP INDEX uniq_sabado_trabajador',
    'SELECT "uniq_sabado_trabajador ya no existe" AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx := (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'actividades_sugeridas_trabajadores' AND INDEX_NAME = 'idx_actividad');
SET @sql := IF(@idx = 0,
    'ALTER TABLE actividades_sugeridas_trabajadores ADD INDEX idx_actividad (actividad_id)',
    'SELECT "idx_actividad ya existe" AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx := (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'actividades_sugeridas_trabajadores' AND INDEX_NAME = 'idx_sabado');
SET @sql := IF(@idx > 0,
    'ALTER TABLE actividades_sugeridas_trabajadores DROP INDEX idx_sabado',
    'SELECT "idx_sabado ya no existe" AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Detalle → cabecera: FK nueva (la vieja fk_set_sabado se soltó en el bloque 2)
SET @fk_exists := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'actividades_sugeridas_trabajadores'
      AND CONSTRAINT_NAME = 'fk_ast_actividad' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@fk_exists = 0,
    'ALTER TABLE actividades_sugeridas_trabajadores ADD CONSTRAINT fk_ast_actividad FOREIGN KEY (actividad_id) REFERENCES actividades_sugeridas(id) ON DELETE CASCADE',
    'SELECT "fk_ast_actividad ya existe" AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Cabecera: fk_sabados_extra_* → fk_actsug_*
SET @fk_exists := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'actividades_sugeridas'
      AND CONSTRAINT_NAME = 'fk_actsug_obra' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@fk_exists = 0,
    'ALTER TABLE actividades_sugeridas ADD CONSTRAINT fk_actsug_obra FOREIGN KEY (obra_id) REFERENCES obras(id) ON DELETE RESTRICT',
    'SELECT "fk_actsug_obra ya existe" AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @fk_exists := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'actividades_sugeridas'
      AND CONSTRAINT_NAME = 'fk_sabados_extra_obra' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@fk_exists = 1,
    'ALTER TABLE actividades_sugeridas DROP FOREIGN KEY fk_sabados_extra_obra',
    'SELECT "fk_sabados_extra_obra ya no existe" AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk_exists := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'actividades_sugeridas'
      AND CONSTRAINT_NAME = 'fk_actsug_creado_por' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@fk_exists = 0,
    'ALTER TABLE actividades_sugeridas ADD CONSTRAINT fk_actsug_creado_por FOREIGN KEY (creado_por) REFERENCES usuarios(id) ON DELETE RESTRICT',
    'SELECT "fk_actsug_creado_por ya existe" AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @fk_exists := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'actividades_sugeridas'
      AND CONSTRAINT_NAME = 'fk_sabados_extra_creado_por' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@fk_exists = 1,
    'ALTER TABLE actividades_sugeridas DROP FOREIGN KEY fk_sabados_extra_creado_por',
    'SELECT "fk_sabados_extra_creado_por ya no existe" AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk_exists := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'actividades_sugeridas'
      AND CONSTRAINT_NAME = 'fk_actsug_actualizado_por' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@fk_exists = 0,
    'ALTER TABLE actividades_sugeridas ADD CONSTRAINT fk_actsug_actualizado_por FOREIGN KEY (actualizado_por) REFERENCES usuarios(id) ON DELETE RESTRICT',
    'SELECT "fk_actsug_actualizado_por ya existe" AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @fk_exists := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'actividades_sugeridas'
      AND CONSTRAINT_NAME = 'fk_sabados_extra_actualizado_por' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@fk_exists = 1,
    'ALTER TABLE actividades_sugeridas DROP FOREIGN KEY fk_sabados_extra_actualizado_por',
    'SELECT "fk_sabados_extra_actualizado_por ya no existe" AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Detalle: fk_set_* → fk_ast_*
SET @fk_exists := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'actividades_sugeridas_trabajadores'
      AND CONSTRAINT_NAME = 'fk_ast_trabajador' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@fk_exists = 0,
    'ALTER TABLE actividades_sugeridas_trabajadores ADD CONSTRAINT fk_ast_trabajador FOREIGN KEY (trabajador_id) REFERENCES trabajadores(id) ON DELETE RESTRICT',
    'SELECT "fk_ast_trabajador ya existe" AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @fk_exists := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'actividades_sugeridas_trabajadores'
      AND CONSTRAINT_NAME = 'fk_set_trabajador' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@fk_exists = 1,
    'ALTER TABLE actividades_sugeridas_trabajadores DROP FOREIGN KEY fk_set_trabajador',
    'SELECT "fk_set_trabajador ya no existe" AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk_exists := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'actividades_sugeridas_trabajadores'
      AND CONSTRAINT_NAME = 'fk_ast_obra_origen' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@fk_exists = 0,
    'ALTER TABLE actividades_sugeridas_trabajadores ADD CONSTRAINT fk_ast_obra_origen FOREIGN KEY (obra_origen_id) REFERENCES obras(id) ON DELETE SET NULL',
    'SELECT "fk_ast_obra_origen ya existe" AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @fk_exists := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'actividades_sugeridas_trabajadores'
      AND CONSTRAINT_NAME = 'fk_set_obra_origen' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@fk_exists = 1,
    'ALTER TABLE actividades_sugeridas_trabajadores DROP FOREIGN KEY fk_set_obra_origen',
    'SELECT "fk_set_obra_origen ya no existe" AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk_exists := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'actividades_sugeridas_trabajadores'
      AND CONSTRAINT_NAME = 'fk_ast_actualizado_por' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@fk_exists = 0,
    'ALTER TABLE actividades_sugeridas_trabajadores ADD CONSTRAINT fk_ast_actualizado_por FOREIGN KEY (actualizado_por) REFERENCES usuarios(id) ON DELETE RESTRICT',
    'SELECT "fk_ast_actualizado_por ya existe" AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @fk_exists := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'actividades_sugeridas_trabajadores'
      AND CONSTRAINT_NAME = 'fk_set_actualizado_por' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@fk_exists = 1,
    'ALTER TABLE actividades_sugeridas_trabajadores DROP FOREIGN KEY fk_set_actualizado_por',
    'SELECT "fk_set_actualizado_por ya no existe" AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ─────────────────────────────────────────────
-- 5. Permisos: claves nuevas → repuntar roles/overrides → borrar claves viejas
-- ─────────────────────────────────────────────
INSERT IGNORE INTO permisos_catalogo (clave, modulo, nombre, descripcion, orden) VALUES
    ('asistencia.actividades_sugeridas.ver',             'Asistencia', 'Ver actividades sugeridas',                     'Ver las listas de trabajadores en actividades sugeridas', 12),
    ('asistencia.actividades_sugeridas.crear',           'Asistencia', 'Crear lista de actividades sugeridas',          'Crear listas de trabajadores en actividades sugeridas (por obra y semana)', 13),
    ('asistencia.actividades_sugeridas.editar',          'Asistencia', 'Editar lista de actividades sugeridas',         'Editar listas en estado "citada"', 14),
    ('asistencia.actividades_sugeridas.cancelar',        'Asistencia', 'Cancelar lista de actividades sugeridas',       'Cancelar listas de trabajadores en actividades sugeridas', 15),
    ('asistencia.actividades_sugeridas.registrar',       'Asistencia', 'Registrar asistencia a actividades sugeridas', 'Marcar quién asistió a las actividades sugeridas', 16),
    ('asistencia.actividades_sugeridas.enviar_whatsapp', 'Asistencia', 'Enviar lista por WhatsApp',                     'Compartir la lista o su asistencia por WhatsApp', 17);

UPDATE IGNORE permisos_rol_v2 SET permiso_clave = 'asistencia.actividades_sugeridas.ver'             WHERE permiso_clave = 'asistencia.sabados_extra.ver';
UPDATE IGNORE permisos_rol_v2 SET permiso_clave = 'asistencia.actividades_sugeridas.crear'           WHERE permiso_clave = 'asistencia.sabados_extra.crear';
UPDATE IGNORE permisos_rol_v2 SET permiso_clave = 'asistencia.actividades_sugeridas.editar'          WHERE permiso_clave = 'asistencia.sabados_extra.editar';
UPDATE IGNORE permisos_rol_v2 SET permiso_clave = 'asistencia.actividades_sugeridas.cancelar'        WHERE permiso_clave = 'asistencia.sabados_extra.cancelar';
UPDATE IGNORE permisos_rol_v2 SET permiso_clave = 'asistencia.actividades_sugeridas.registrar'       WHERE permiso_clave = 'asistencia.sabados_extra.registrar';
UPDATE IGNORE permisos_rol_v2 SET permiso_clave = 'asistencia.actividades_sugeridas.enviar_whatsapp' WHERE permiso_clave = 'asistencia.sabados_extra.enviar_whatsapp';

UPDATE IGNORE permisos_usuario_override SET permiso_clave = 'asistencia.actividades_sugeridas.ver'             WHERE permiso_clave = 'asistencia.sabados_extra.ver';
UPDATE IGNORE permisos_usuario_override SET permiso_clave = 'asistencia.actividades_sugeridas.crear'           WHERE permiso_clave = 'asistencia.sabados_extra.crear';
UPDATE IGNORE permisos_usuario_override SET permiso_clave = 'asistencia.actividades_sugeridas.editar'          WHERE permiso_clave = 'asistencia.sabados_extra.editar';
UPDATE IGNORE permisos_usuario_override SET permiso_clave = 'asistencia.actividades_sugeridas.cancelar'        WHERE permiso_clave = 'asistencia.sabados_extra.cancelar';
UPDATE IGNORE permisos_usuario_override SET permiso_clave = 'asistencia.actividades_sugeridas.registrar'       WHERE permiso_clave = 'asistencia.sabados_extra.registrar';
UPDATE IGNORE permisos_usuario_override SET permiso_clave = 'asistencia.actividades_sugeridas.enviar_whatsapp' WHERE permiso_clave = 'asistencia.sabados_extra.enviar_whatsapp';

-- Lo que quede colgando de las claves viejas (un rol que ya tenía la nueva → UPDATE IGNORE
-- lo dejó) cae por el ON DELETE CASCADE de la FK.
DELETE FROM permisos_catalogo WHERE clave LIKE 'asistencia.sabados_extra.%';

-- ─────────────────────────────────────────────
-- 6. Re-login general: las claves de permiso viajan en el JWT
-- ─────────────────────────────────────────────
UPDATE roles SET version = version + 1;
