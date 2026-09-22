-- ============================================================================
-- 112_desvinculaciones.sql — Desvinculación con causal + historial (plan Gestiones, bloque B4)
-- Fecha: 2026-09-11
--
-- PEDIDO DEL DUEÑO (req. 7): "Al desvincular, el sistema debe solicitar de forma obligatoria
-- el motivo de la desvinculación, para contar con ese antecedente y evitar recontratar
-- personal desvinculado previamente por problemas de asistencia, conductuales u otros".
-- Decisión 2026-09-10: la marca "no recontratar" SOLO ADVIERTE (no bloquea): al reactivar
-- o al crear una solicitud de ingreso con ese RUT se muestra la causal y la fecha.
--
-- HOY: la desvinculación es un PUT genérico {activo:0, fecha_desvinculacion} sin motivo, sin
-- transacción y sin historial; reactivar pone fecha_desvinculacion = NULL y la baja desaparece
-- (también del reporte semanal). Este bloque crea el endpoint dedicado y este esquema.
--
-- DISEÑO:
--   * `trabajador_desvinculaciones`: HISTÓRICA, una fila por cada baja (sobrevive a la
--     recontratación: `reactivado_por/en` cierran la fila). `detalle` = antecedente interno en
--     texto libre: NO se denormaliza en `trabajadores` (el CRUD hace SELECT trabajadores.*) y
--     solo lo ve quien tiene trabajadores.eliminar o .reactivar. `fecha_ingreso_periodo` guarda
--     el ingreso de ESE período (al reactivar no se toca trabajadores.fecha_ingreso: 7 validaciones
--     de asistencia dependen de ella). `finiquito_documento_id` lo enlaza B5.
--   * `trabajadores.causal_desvinculacion` (código del catálogo) y `trabajadores.no_recontratar`:
--     denormalizados para listar/avisar sin JOIN. Al reactivar, la causal se limpia; la marca se
--     CONSERVA salvo que quien reactiva pida quitarla.
--   * Catálogo de causales en código (backend/src/config/causalesDesvinculacion.js): art. 159/160/161
--     del Código del Trabajo + operativas LOLS + 'LEGADO' para las bajas anteriores a esta migración.
--   * FK trabajador ON DELETE CASCADE: "depurar" (hard-delete) se lleva el historial; la ruta
--     además rechaza depurar si hay finiquito o documentos generados (B4/B2).
--
-- BACKFILL idempotente: cada trabajador inactivo con fecha_desvinculacion recibe UNA fila
-- 'LEGADO' (NOT EXISTS) y la causal denormalizada.
--
-- PERMISOS: ninguno nuevo. Desvincular = trabajadores.eliminar ("Finiquitar Trabajador");
-- reactivar = trabajadores.reactivar — hasta hoy ambos se exigían SOLO en la UI (el backend
-- aceptaba activo:false con trabajadores.editar). Este bloque los hace reales en el backend.
--
-- IDEMPOTENTE: CREATE TABLE IF NOT EXISTS (índices y FKs dentro), ADD COLUMN IF NOT EXISTS,
-- INSERT … SELECT … WHERE NOT EXISTS, UPDATE … WHERE … IS NULL.
-- ============================================================================

CREATE TABLE IF NOT EXISTS trabajador_desvinculaciones (
  id INT NOT NULL AUTO_INCREMENT,
  trabajador_id INT NOT NULL,
  fecha_desvinculacion DATE NOT NULL,
  fecha_ingreso_periodo DATE NULL COMMENT 'fecha_ingreso vigente al momento de la baja (no se pisa al reactivar)',
  causal_codigo VARCHAR(30) NOT NULL COMMENT 'Código del catálogo causalesDesvinculacion.js (LEGADO = anterior a mig 112)',
  detalle TEXT NULL COMMENT 'Antecedente interno; solo trabajadores.eliminar/.reactivar; no se imprime ni se denormaliza',
  no_recontratar TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Marca de aviso (no bloquea) al recontratar',
  desvinculado_por INT NULL,
  desvinculado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finiquito_documento_id INT NULL COMMENT 'documentos.id del finiquito emitido (B5)',
  reactivado_por INT NULL,
  reactivado_en DATETIME NULL COMMENT 'NULL = baja vigente (fila abierta)',
  PRIMARY KEY (id),
  KEY idx_trab_desv_trabajador (trabajador_id, desvinculado_en),
  KEY idx_trab_desv_causal (causal_codigo),
  KEY idx_trab_desv_fecha (fecha_desvinculacion),
  CONSTRAINT fk_trab_desv_trabajador FOREIGN KEY (trabajador_id) REFERENCES trabajadores(id) ON DELETE CASCADE,
  CONSTRAINT fk_trab_desv_finiquito FOREIGN KEY (finiquito_documento_id) REFERENCES documentos(id) ON DELETE SET NULL,
  CONSTRAINT fk_trab_desv_desvinculado_por FOREIGN KEY (desvinculado_por) REFERENCES usuarios(id) ON DELETE SET NULL,
  CONSTRAINT fk_trab_desv_reactivado_por FOREIGN KEY (reactivado_por) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Historial de desvinculaciones/recontrataciones por trabajador (plan Gestiones B4)';

ALTER TABLE trabajadores
  ADD COLUMN IF NOT EXISTS causal_desvinculacion VARCHAR(30) NULL COMMENT 'Causal de la baja vigente (código); NULL si activo',
  ADD COLUMN IF NOT EXISTS no_recontratar TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Marca de aviso al recontratar; se conserva al reactivar salvo que se quite explícitamente';

-- Backfill: bajas anteriores a este esquema → una fila LEGADO por trabajador inactivo con fecha.
INSERT INTO trabajador_desvinculaciones (trabajador_id, fecha_desvinculacion, fecha_ingreso_periodo, causal_codigo)
SELECT t.id, t.fecha_desvinculacion, t.fecha_ingreso, 'LEGADO'
  FROM trabajadores t
 WHERE t.activo = 0
   AND t.fecha_desvinculacion IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM trabajador_desvinculaciones d WHERE d.trabajador_id = t.id);

UPDATE trabajadores
   SET causal_desvinculacion = 'LEGADO'
 WHERE activo = 0 AND fecha_desvinculacion IS NOT NULL AND causal_desvinculacion IS NULL;
