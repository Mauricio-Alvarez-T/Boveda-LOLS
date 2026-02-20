-- =============================================
-- SGDL - Migración 008: Categorización para Reportes
-- Añade columna para agrupar trabajadores en el reporte WhatsApp
-- =============================================

ALTER TABLE trabajadores
    ADD COLUMN categoria_reporte ENUM('obra', 'operaciones', 'rotativo') DEFAULT 'obra' AFTER cargo_id;

-- Actualizar algunos datos de prueba si existen para ver el efecto
UPDATE trabajadores SET categoria_reporte = 'operaciones' LIMIT 2;
