-- =============================================
-- Migración 038: trabajo_extraordinario_sabado
--
-- Contexto: feature "Sábados Extra" del módulo Asistencia.
-- Los sábados se realizan trabajos extraordinarios que NO cuentan
-- para asistencia regular. El supervisor cita personal antes del
-- sábado y registra asistencia + horas el día.
--
-- Aislada del resto: NO toca tablas asistencias, trabajadores,
-- cargos ni configuracion_horarios. El bloqueo getDay()===6 en
-- asistencia.service.js sigue intacto.
--
-- Tablas creadas:
--   sabados_extra              - cabecera (1 por obra+fecha)
--   sabados_extra_trabajadores - detalle (N por sábado)
--
-- Idempotente vía information_schema + PREPARE/EXECUTE (patrón 037).
-- =============================================

-- ─────────────────────────────────────────────
-- 1. Tabla sabados_extra (cabecera)
-- ─────────────────────────────────────────────
SET @tbl_exists := (
    SELECT COUNT(*) FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'sabados_extra'
);
SET @sql := IF(@tbl_exists = 0,
    'CREATE TABLE sabados_extra (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT,
        obra_id INT UNSIGNED NOT NULL,
        fecha DATE NOT NULL,
        observaciones_globales TEXT NULL,
        observaciones_por_cargo JSON NULL,
        horas_default DECIMAL(4,2) NULL,
        estado ENUM("citada","realizada","cancelada") NOT NULL DEFAULT "citada",
        creado_por INT UNSIGNED NOT NULL,
        actualizado_por INT UNSIGNED NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uniq_obra_fecha (obra_id, fecha),
        INDEX idx_fecha (fecha),
        INDEX idx_estado (estado),
        CONSTRAINT fk_sabados_extra_obra FOREIGN KEY (obra_id) REFERENCES obras(id) ON DELETE RESTRICT,
        CONSTRAINT fk_sabados_extra_creado_por FOREIGN KEY (creado_por) REFERENCES usuarios(id) ON DELETE RESTRICT,
        CONSTRAINT fk_sabados_extra_actualizado_por FOREIGN KEY (actualizado_por) REFERENCES usuarios(id) ON DELETE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4',
    'SELECT "sabados_extra ya existe" AS msg'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ─────────────────────────────────────────────
-- 2. Tabla sabados_extra_trabajadores (detalle)
-- ─────────────────────────────────────────────
SET @tbl_exists := (
    SELECT COUNT(*) FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'sabados_extra_trabajadores'
);
SET @sql := IF(@tbl_exists = 0,
    'CREATE TABLE sabados_extra_trabajadores (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT,
        sabado_id INT UNSIGNED NOT NULL,
        trabajador_id INT UNSIGNED NOT NULL,
        obra_origen_id INT UNSIGNED NULL,
        citado TINYINT(1) NOT NULL DEFAULT 1,
        asistio TINYINT(1) NULL,
        horas_trabajadas DECIMAL(4,2) NULL,
        observacion VARCHAR(255) NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uniq_sabado_trabajador (sabado_id, trabajador_id),
        INDEX idx_trabajador (trabajador_id),
        INDEX idx_sabado (sabado_id),
        CONSTRAINT fk_set_sabado FOREIGN KEY (sabado_id) REFERENCES sabados_extra(id) ON DELETE CASCADE,
        CONSTRAINT fk_set_trabajador FOREIGN KEY (trabajador_id) REFERENCES trabajadores(id) ON DELETE RESTRICT,
        CONSTRAINT fk_set_obra_origen FOREIGN KEY (obra_origen_id) REFERENCES obras(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4',
    'SELECT "sabados_extra_trabajadores ya existe" AS msg'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
