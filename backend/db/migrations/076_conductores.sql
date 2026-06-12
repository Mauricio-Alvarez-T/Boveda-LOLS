-- =============================================
-- 076 — Catálogo de Conductores + asignación en Vehículos
-- =============================================
-- Crea el catálogo `conductores` (administrable en Configuración) y agrega a
-- `vehiculos` los campos `empresa` (LOLS / TRANSPORTE) y `conductor_id` (FK).
-- Idempotente: CREATE TABLE IF NOT EXISTS, ADD COLUMN IF NOT EXISTS, INSERT IGNORE.

-- 1. Catálogo de conductores
CREATE TABLE IF NOT EXISTS conductores (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    nombre      VARCHAR(150) NOT NULL,
    activo      BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Campos nuevos en vehiculos
ALTER TABLE vehiculos
    ADD COLUMN IF NOT EXISTS empresa      VARCHAR(20) NULL AFTER tipo,
    ADD COLUMN IF NOT EXISTS conductor_id INT         NULL AFTER empresa;

-- 3. FK conductor_id → conductores.id (SET NULL si se borra el conductor).
--    Envuelto para tolerar re-ejecución (MySQL no soporta ADD CONSTRAINT IF NOT EXISTS).
SET @fk_exists := (
    SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'vehiculos'
      AND CONSTRAINT_NAME = 'fk_vehiculos_conductor'
);
SET @sql := IF(@fk_exists = 0,
    'ALTER TABLE vehiculos ADD CONSTRAINT fk_vehiculos_conductor FOREIGN KEY (conductor_id) REFERENCES conductores(id) ON DELETE SET NULL',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 4. Permisos del catálogo (idempotente). También se sincronizan vía permisos.config.js.
INSERT IGNORE INTO permisos_catalogo (clave, modulo, nombre, descripcion, orden) VALUES
    ('conductores.ver',      'Conductores', 'Ver Conductores',  'Ver el catálogo de conductores', 1),
    ('conductores.crear',    'Conductores', 'Crear Conductor',  'Registrar nuevos conductores', 2),
    ('conductores.editar',   'Conductores', 'Editar Conductor', 'Modificar conductores', 3),
    ('conductores.eliminar', 'Conductores', 'Eliminar Conductor','Eliminar conductores', 4);

-- 5. Asignar todos los permisos del módulo al Super Admin (rol_id = 1)
INSERT IGNORE INTO permisos_rol_v2 (rol_id, permiso_clave)
SELECT 1, clave FROM permisos_catalogo WHERE modulo = 'Conductores';
