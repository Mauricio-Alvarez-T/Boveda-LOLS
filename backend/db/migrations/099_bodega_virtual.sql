-- =============================================
-- Migración 099: Bodega Virtual
--
-- Contenedor del sistema para ítems de factura que aún no pertenecen a una
-- ubicación física real. Su visibilidad se controla POR USUARIO desde la UI
-- de Inventario con un modo cíclico: ocultar (default) / mostrar sin sumar /
-- sumar a totales.
--
-- Nota sobre el precedente 034/035 (seed de bodegas revertido): aquella
-- decisión eliminó bodegas "de empresa" hardcodeadas. `es_virtual` es un flag
-- de VISIBILIDAD de feature (no de propiedad): la fila sembrada es un
-- artefacto del módulo Facturas, renombrable vía UI, y protegida de DELETE
-- por guard en el router (destino permanente del módulo).
-- =============================================

ALTER TABLE bodegas
  ADD COLUMN IF NOT EXISTS es_virtual BOOLEAN NOT NULL DEFAULT FALSE;

-- Seed idempotente (patrón mig 065: ON DUPLICATE KEY sobre `nombre` UNIQUE).
-- Reafirma flags en cada corrida: si el usuario la desactivó por error, la
-- migración la reactiva; si la renombró, esta corrida no se re-ejecuta (el
-- runner registra por filename), así que no se duplica.
INSERT INTO bodegas (nombre, activa, participa_inventario, participa_transferencias, es_virtual)
VALUES ('Bodega Virtual', 1, 1, 1, 1)
ON DUPLICATE KEY UPDATE es_virtual = 1, activa = 1;
