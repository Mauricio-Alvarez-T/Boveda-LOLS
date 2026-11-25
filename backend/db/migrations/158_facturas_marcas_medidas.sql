-- ============================================================================
-- 158_facturas_marcas_medidas.sql — Facturas: marcas de color, medidas por línea
-- Fecha: 2026-11-25 (pedido del dueño a partir de la planilla «COMPRAS 2025»)
--
-- 1. Marca de color COMPARTIDA por factura (la ve todo el equipo), paleta fija de 5 colores.
--    NULL = sin marca. Sirve para destacar y para el filtro «solo marcadas».
-- 2. Nombre de cada color (`facturas_colores`): «naranjo = Maquinaria nueva». Lo edita quien
--    gestiona facturas (inventario.facturas.gestionar). Sin permisos nuevos → sin re-login.
-- 3. `factura_items.medidas`: texto opcional por línea («15 x 60»), columna MEDIDAS del Excel.
-- Idempotente: ADD COLUMN / CREATE TABLE / CREATE INDEX IF NOT EXISTS, INSERT IGNORE.
-- ============================================================================

ALTER TABLE facturas_inventario
  ADD COLUMN IF NOT EXISTS color_marca ENUM('naranjo', 'azul', 'verde', 'amarillo', 'morado') NULL
    COMMENT 'Marca compartida de la factura (mig 158); NULL = sin marca';

CREATE INDEX IF NOT EXISTS idx_fact_color_marca ON facturas_inventario (color_marca);

ALTER TABLE factura_items
  ADD COLUMN IF NOT EXISTS medidas VARCHAR(60) NULL
    COMMENT 'Medidas de la línea tal como las anota RRHH/compras, ej. «15 x 60» (mig 158)';

CREATE TABLE IF NOT EXISTS facturas_colores (
  color ENUM('naranjo', 'azul', 'verde', 'amarillo', 'morado') NOT NULL PRIMARY KEY,
  nombre VARCHAR(60) NULL COMMENT 'Significado del color para el equipo; NULL = sin nombre',
  updated_by INT NULL,
  updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_fact_colores_usuario FOREIGN KEY (updated_by) REFERENCES usuarios(id) ON DELETE SET NULL
);

INSERT IGNORE INTO facturas_colores (color) VALUES ('naranjo'), ('azul'), ('verde'), ('amarillo'), ('morado');
