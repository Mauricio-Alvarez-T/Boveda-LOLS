-- =============================================
-- 162 — Anular UNA desvinculación registrada por error (trabajador id 513, Domeyko)
-- =============================================
-- Marcos 2026-11-27: «Se necesita que el sistema permita corregir una desvinculación registrada por error y
-- recuperar la fecha de ingreso original… No quiero crear ningún botón nuevo, ya que esto nunca pasa».
-- El 25-11 se le registró una renuncia con fecha 20-11-2026 y se le emitió un finiquito, que quedó impreso en un lote
-- de custodia por llevar a obra. Seguía trabajando. Corrección de una sola vez (ver docs/reglas/rrhh-trabajadores.md
-- § Desvinculación registrada por error). El nombre y el RUT no van aquí: el repositorio es público.
--
-- Deja todo como si la baja no hubiera existido:
--   1. Finiquito o carta de aviso de esa baja: se anulan como «Eliminar» de Documentos laborales (activo = FALSE).
--      Si están en un lote de custodia: por llevar → «Quedó en oficina», ya en obra → «Volvió sin firma», con la
--      observación «Anulado: desvinculación por error». El lote se cierra solo si ya no le queda nada por resolver.
--   2. Se borra la fila de la baja del historial (no es un período laboral cerrado ni cuenta en el reporte semanal).
--   3. El trabajador vuelve a activo con su fecha de ingreso ORIGINAL (04-05-2026, la baja nunca la cambió).
--   4. Queda anotado en el registro de actividad (usuario vacío = sistema).
-- La asistencia no se toca (142 días, incluidos los marcados después del 20-11).
--
-- Solo actúa si el trabajador sigue EXACTAMENTE como quedó: desvinculado el 20-11-2026, ingreso 04-05-2026, una sola
-- baja en su historial y ningún finiquito o carta firmados. Si algo cambió (lo reingresaron, se firmó el finiquito, o
-- en otro entorno ese id es otra persona) no hace nada. Idempotente: al segundo intento ya está activo y no cumple.

START TRANSACTION;

SET @ok := (SELECT COUNT(*) FROM trabajadores
             WHERE id = 513 AND activo = 0
               AND fecha_desvinculacion = '2026-11-20' AND fecha_ingreso = '2026-05-04');
SET @ok := @ok * (SELECT COUNT(*) = 1 FROM trabajador_desvinculaciones WHERE trabajador_id = 513);
SET @ok := @ok * (SELECT COUNT(*) = 1 FROM trabajador_desvinculaciones
                   WHERE trabajador_id = 513 AND fecha_desvinculacion = '2026-11-20' AND reactivado_en IS NULL);
SET @ok := @ok * (SELECT COUNT(*) = 0 FROM documentos d
                    JOIN tipos_documento td ON td.id = d.tipo_documento_id
                   WHERE d.trabajador_id = 513 AND d.activo = 1 AND td.codigo IN ('FINIQUITO', 'CARTA_AVISO')
                     AND (d.estado = 'firmado' OR d.fecha_firmado IS NOT NULL));

-- 4a. Registro de actividad de cada documento anulado (antes de anularlo, para encontrarlo).
INSERT INTO logs_actividad (usuario_id, modulo, accion, item_id, entidad_tipo, entidad_label, detalle)
SELECT NULL, 'documentos', 'DELETE', CAST(d.id AS CHAR), 'documento', LEFT(d.nombre_archivo, 160),
       CONCAT('{"evento":"documento_eliminado","tipo":"', td.codigo, '","trabajador_id":513,"estado":"', COALESCE(d.estado, ''),
              '","resumen":"Anulado: desvinculación registrada por error (mig 162)"}')
  FROM documentos d
  JOIN tipos_documento td ON td.id = d.tipo_documento_id
 WHERE @ok = 1 AND d.trabajador_id = 513 AND d.activo = 1 AND td.codigo IN ('FINIQUITO', 'CARTA_AVISO');

-- 1a. Lote de custodia: lo que aún no salía de oficina queda «Quedó en oficina».
UPDATE documentos_lotes_items i
  JOIN documentos d ON d.id = i.documento_id
  JOIN tipos_documento td ON td.id = d.tipo_documento_id
   SET i.estado = 'no_entregado', i.resuelto_en = NOW(), i.observacion = 'Anulado: desvinculación por error'
 WHERE @ok = 1 AND d.trabajador_id = 513 AND d.activo = 1 AND td.codigo IN ('FINIQUITO', 'CARTA_AVISO')
   AND i.estado = 'pendiente';

-- 1b. Lo que ya estaba en obra queda «Volvió sin firma» (el papel hay que recuperarlo y romperlo).
UPDATE documentos_lotes_items i
  JOIN documentos d ON d.id = i.documento_id
  JOIN tipos_documento td ON td.id = d.tipo_documento_id
   SET i.estado = 'devuelto_sin_firma', i.resuelto_en = NOW(), i.observacion = 'Anulado: desvinculación por error'
 WHERE @ok = 1 AND d.trabajador_id = 513 AND d.activo = 1 AND td.codigo IN ('FINIQUITO', 'CARTA_AVISO')
   AND i.estado = 'retirado';

-- 1c. Un lote que se quedó sin nada por llevar ni en obra se cierra (igual que la app).
UPDATE documentos_lotes l
   SET l.estado = 'cerrado', l.cerrado_en = NOW()
 WHERE @ok = 1 AND l.estado IN ('pendiente_retiro', 'en_terreno')
   AND l.id IN (SELECT lote_id FROM documentos WHERE trabajador_id = 513 AND lote_id IS NOT NULL)
   AND NOT EXISTS (SELECT 1 FROM documentos_lotes_items i WHERE i.lote_id = l.id AND i.estado IN ('pendiente', 'retirado'));

-- 1d. El documento se anula y sale del lote (si estaba en obra vuelve a «descargado», como al volver sin firma).
UPDATE documentos d
  JOIN tipos_documento td ON td.id = d.tipo_documento_id
   SET d.activo = FALSE, d.lote_id = NULL, d.estado = IF(d.estado = 'en_terreno', 'descargado', d.estado)
 WHERE @ok = 1 AND d.trabajador_id = 513 AND d.activo = 1 AND td.codigo IN ('FINIQUITO', 'CARTA_AVISO');

-- 2. La baja sale del historial.
DELETE FROM trabajador_desvinculaciones
 WHERE @ok = 1 AND trabajador_id = 513 AND fecha_desvinculacion = '2026-11-20' AND reactivado_en IS NULL;

-- 3. Vuelve a activo con su ingreso original (fecha_ingreso no se toca).
UPDATE trabajadores
   SET activo = 1, fecha_desvinculacion = NULL, causal_desvinculacion = NULL, no_recontratar = 0
 WHERE @ok = 1 AND id = 513 AND activo = 0 AND fecha_desvinculacion = '2026-11-20';

-- 4b. Registro de actividad del trabajador.
INSERT INTO logs_actividad (usuario_id, modulo, accion, item_id, entidad_tipo, entidad_label, detalle)
SELECT NULL, 'trabajadores', 'UPDATE', '513', 'trabajador',
       LEFT(TRIM(CONCAT_WS(' ', apellido_paterno, apellido_materno, nombres)), 160),
       '{"evento":"desvinculacion_anulada","fecha_desvinculacion":"2026-11-20","resumen":"Desvinculación del 20-11-2026 anulada: registrada por error. Vuelve a activo con su ingreso original (mig 162)"}'
  FROM trabajadores
 WHERE @ok = 1 AND id = 513 AND activo = 1;

COMMIT;
