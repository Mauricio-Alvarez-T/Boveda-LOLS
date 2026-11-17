-- ============================================================================
-- 152_reingreso_periodos.sql — Reingreso de trabajadores con períodos laborales
-- Fecha: 2026-11-17 (Gestiones — plan «Reingreso y períodos laborales»)
--
-- CONTEXTO: hasta hoy un finiquitado que volvía se REACTIVABA conservando su fecha de ingreso,
-- obra, cargo y empresa del período anterior → contrato con la fecha vieja, días sumados de todos
-- los períodos, el hueco entre períodos abierto en Asistencia, no aparecía como ingreso nuevo.
--
-- DECISIÓN DEL DUEÑO (2026-11-17): el reingreso pide fecha de ingreso nueva (y obra/cargo/empresa);
-- `trabajadores.fecha_ingreso` pasa a ser el inicio del período ACTUAL. Los períodos CERRADOS ya
-- existen: cada fila de `trabajador_desvinculaciones` con `reactivado_en` = [fecha_ingreso_periodo,
-- fecha_desvinculacion]. Sin tabla nueva.
--
-- CAMBIOS (idempotentes):
--   1. +empresa_id/+obra_id/+cargo_id: foto del período al darlo de baja (el aviso del Art. 159 N°4
--      cuenta por empleador; el historial laboral de la ficha muestra empresa y cargo). Sin FK a
--      propósito: es una foto, no debe impedir borrar una obra ni seguirla.
--   2. Backfill best-effort desde `trabajadores` donde la foto está vacía. Ni reactivar ni editar
--      cambiaban esos datos al volver, así que el valor actual es el del período (salvo ediciones).
-- Sin permisos nuevos (el reingreso usa trabajadores.reactivar) → sin re-login.
-- ============================================================================

ALTER TABLE trabajador_desvinculaciones
  ADD COLUMN IF NOT EXISTS empresa_id INT NULL COMMENT 'Empresa del período al darlo de baja (mig 152)',
  ADD COLUMN IF NOT EXISTS obra_id INT NULL COMMENT 'Obra del período al darlo de baja (mig 152)',
  ADD COLUMN IF NOT EXISTS cargo_id INT NULL COMMENT 'Cargo del período al darlo de baja (mig 152)';

UPDATE trabajador_desvinculaciones d
  JOIN trabajadores t ON t.id = d.trabajador_id
   SET d.empresa_id = t.empresa_id,
       d.obra_id = t.obra_id,
       d.cargo_id = t.cargo_id
 WHERE d.empresa_id IS NULL AND d.obra_id IS NULL AND d.cargo_id IS NULL;
