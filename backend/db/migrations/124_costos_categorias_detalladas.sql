-- ============================================================
-- 124 · Costos de obra: categorías de gasto detalladas y planilla de sueldos (2026-10-19)
-- ============================================================
-- Pedido de Marcos (nota de Rodrigo + desglose de gastos de obra): las categorías pasan a ser las
-- que usan en LOLS, en grupos (docs/reglas/costos.md):
--   Mano de obra y administración: sueldos_administracion, sueldos, anticipos, subcontrato
--   Gastos generales de obra:      arriendo_equipos, servicios_basicos, logistica_seguridad,
--                                  combustible, herramientas, gastos_generales
--   Materiales:                    hormigon, acero, materiales
--   Permisos y legal:              permisos, mitigaciones
--   otro
--
--  · costo_gastos.categoria pasa de ENUM a VARCHAR(40): la lista vive en el código
--    (costos.service.js · CATEGORIAS) y ajustarla con Rodrigo no exige otra migración.
--  · Las dos categorías que desaparecen se traducen: mano_obra → sueldos, maquinaria → arriendo_equipos.
--  · tipo_documento suma 'planilla' (sueldos y anticipos): no lleva IVA, cuenta el total.
--
-- Idempotente: MODIFY COLUMN con la definición completa y UPDATE que solo toca valores viejos.
-- ============================================================

ALTER TABLE costo_gastos
    MODIFY COLUMN categoria VARCHAR(40) NULL,
    MODIFY COLUMN tipo_documento ENUM('factura','boleta','guia','planilla','otro') NOT NULL DEFAULT 'factura';

UPDATE costo_gastos SET categoria = 'sueldos' WHERE categoria = 'mano_obra';
UPDATE costo_gastos SET categoria = 'arriendo_equipos' WHERE categoria = 'maquinaria';
