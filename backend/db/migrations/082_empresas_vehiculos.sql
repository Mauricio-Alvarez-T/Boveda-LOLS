-- =============================================
-- 082 — Empresas de flota (paramétricas) para Vehículos
-- =============================================
-- Convierte la "empresa" del vehículo de un valor de texto fijo (LOLS / TRANSPORTE
-- quemados en el <select> del front) a una entidad administrable: el usuario crea,
-- edita y elimina empresas desde la UI, cada una con su color identificador.
--
-- - Tabla `empresas_vehiculos` (catálogo propio de flota; NO toca la tabla `empresas`
--   de trabajadores/obras, que tiene RUT y razón social y otra semántica).
-- - `vehiculos.empresa_id` (FK) reemplaza como fuente de verdad a `vehiculos.empresa`
--   (texto). La columna de texto se conserva (no se dropea) por seguridad/histórico.
-- - Seed LOLS y TRANSPORTE para preservar lo que ya existía (son filas editables,
--   no literales en código).
-- Idempotente: CREATE TABLE IF NOT EXISTS, ADD COLUMN IF NOT EXISTS, INSERT IGNORE,
-- FK envuelta en chequeo de existencia, backfill condicionado a empresa_id IS NULL.

-- 1. Catálogo de empresas de flota
CREATE TABLE IF NOT EXISTS empresas_vehiculos (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    nombre      VARCHAR(100) NOT NULL,
    color       VARCHAR(20)  NOT NULL DEFAULT '#64748b',  -- hex; default slate-500 (neutro)
    activo      BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_empresas_vehiculos_nombre (nombre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Seed de las empresas que ya existían como texto (editables/borrables desde la UI).
--    Colores alineados a las etiquetas históricas: LOLS verde, TRANSPORTE azul.
INSERT IGNORE INTO empresas_vehiculos (nombre, color) VALUES
    ('LOLS',       '#16a34a'),
    ('TRANSPORTE', '#2563eb');

-- 3. FK en vehiculos: empresa_id → empresas_vehiculos.id (SET NULL si se borra la empresa).
ALTER TABLE vehiculos
    ADD COLUMN IF NOT EXISTS empresa_id INT NULL AFTER empresa;

SET @fk_exists := (
    SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'vehiculos'
      AND CONSTRAINT_NAME = 'fk_vehiculos_empresa'
);
SET @sql := IF(@fk_exists = 0,
    'ALTER TABLE vehiculos ADD CONSTRAINT fk_vehiculos_empresa FOREIGN KEY (empresa_id) REFERENCES empresas_vehiculos(id) ON DELETE SET NULL',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 4. Backfill: enlazar cada vehículo con la empresa cuyo nombre coincide con el texto
--    histórico (case-insensitive). Solo toca filas aún sin empresa_id → re-ejecutable.
UPDATE vehiculos v
    JOIN empresas_vehiculos ev ON UPPER(TRIM(v.empresa)) = UPPER(ev.nombre)
    SET v.empresa_id = ev.id
    WHERE v.empresa IS NOT NULL AND TRIM(v.empresa) <> '' AND v.empresa_id IS NULL;
