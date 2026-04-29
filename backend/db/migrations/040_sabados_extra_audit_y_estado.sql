-- =============================================
-- Migración 040: sábados_extra audit + estado trabajadores + índice fecha
--
-- Sprint 1 de la auditoría de "Sábados Extra".
--
-- A. Columna `estado` en sabados_extra_trabajadores (citado/asistio/no_asistio/cancelado)
--    para soportar soft delete que preserva auditoría tras cancelar la citación
--    (UPDATE a 'cancelado' en lugar de DELETE).
-- B. Columna `actualizado_por` en sabados_extra_trabajadores + FK a usuarios.
-- C. Backfill `estado` desde columna `asistio` existente.
-- D. Backfill de permisos: roles con 'asistencia.sabados_extra.crear' obtienen
--    también 'asistencia.sabados_extra.editar' y 'asistencia.sabados_extra.cancelar'
--    para preservar el comportamiento previo (RBAC granular en Sprint 2).
--
-- Idempotente vía information_schema + PREPARE/EXECUTE (patrón 037/038/039).
-- Tipos INT signed para matchear usuarios.id (aprendizaje 038 errno 150).
-- =============================================

-- ─────────────────────────────────────────────
-- A. Columna estado en sabados_extra_trabajadores
-- ─────────────────────────────────────────────
SET @col_exists := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'sabados_extra_trabajadores'
      AND COLUMN_NAME = 'estado'
);
SET @sql := IF(@col_exists = 0,
    'ALTER TABLE sabados_extra_trabajadores ADD COLUMN estado ENUM("citado","asistio","no_asistio","cancelado") NOT NULL DEFAULT "citado" AFTER citado',
    'SELECT "sabados_extra_trabajadores.estado ya existe" AS msg'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ─────────────────────────────────────────────
-- B. Columna actualizado_por en sabados_extra_trabajadores
-- ─────────────────────────────────────────────
SET @col_exists := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'sabados_extra_trabajadores'
      AND COLUMN_NAME = 'actualizado_por'
);
SET @sql := IF(@col_exists = 0,
    'ALTER TABLE sabados_extra_trabajadores ADD COLUMN actualizado_por INT NULL',
    'SELECT "sabados_extra_trabajadores.actualizado_por ya existe" AS msg'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk_exists := (
    SELECT COUNT(*) FROM information_schema.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'sabados_extra_trabajadores'
      AND CONSTRAINT_NAME = 'fk_set_actualizado_por'
);
SET @sql := IF(@fk_exists = 0,
    'ALTER TABLE sabados_extra_trabajadores ADD CONSTRAINT fk_set_actualizado_por FOREIGN KEY (actualizado_por) REFERENCES usuarios(id) ON DELETE RESTRICT',
    'SELECT "fk_set_actualizado_por ya existe" AS msg'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ─────────────────────────────────────────────
-- C. Backfill estado desde asistio (solo registros con estado='citado' default)
-- ─────────────────────────────────────────────
UPDATE sabados_extra_trabajadores
SET estado = CASE
    WHEN asistio = 1 THEN 'asistio'
    WHEN asistio = 0 THEN 'no_asistio'
    ELSE 'citado'
END
WHERE estado = 'citado';

-- Si la cabecera está cancelada, marca trabajadores como 'cancelado'
UPDATE sabados_extra_trabajadores t
INNER JOIN sabados_extra s ON s.id = t.sabado_id
SET t.estado = 'cancelado'
WHERE s.estado = 'cancelada' AND t.estado != 'cancelado';

-- ─────────────────────────────────────────────
-- D. Backfill permisos: roles con "crear" obtienen "editar" y "cancelar"
-- ─────────────────────────────────────────────
-- Insertar permisos nuevos en catálogo (si no existen)
INSERT IGNORE INTO permisos_catalogo (clave, modulo, nombre, descripcion, orden) VALUES
    ('asistencia.sabados_extra.editar',   'Asistencia', 'Editar Citación Sábado',   'Editar citaciones de trabajo extraordinario en sábado en estado "citada"', 13),
    ('asistencia.sabados_extra.cancelar', 'Asistencia', 'Cancelar Citación Sábado', 'Cancelar citaciones de trabajo extraordinario en sábado', 14);

-- Asignar nuevos permisos a roles que tenían 'crear'
INSERT IGNORE INTO permisos_rol_v2 (rol_id, permiso_clave)
SELECT rp.rol_id, 'asistencia.sabados_extra.editar'
FROM permisos_rol_v2 rp
WHERE rp.permiso_clave = 'asistencia.sabados_extra.crear';

INSERT IGNORE INTO permisos_rol_v2 (rol_id, permiso_clave)
SELECT rp.rol_id, 'asistencia.sabados_extra.cancelar'
FROM permisos_rol_v2 rp
WHERE rp.permiso_clave = 'asistencia.sabados_extra.crear';
