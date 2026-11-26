-- =============================================
-- 160 — Cartas de aviso de término de contrato (solo Matías)
-- =============================================
-- Marcos 2026-11-26: «necesidades de la empresa, vencimiento de plazo y no concurrencia a sus labores, esas tres
-- cartas necesito que puedas crear para dejar lista y que solo Matías pueda imprimir». Plantilla CARTA_AVISO
-- (backend/src/plantillas/documentos/cartaAviso.plantilla.js), emitida desde la baja vigente como el finiquito.
--
--   1. Permiso propio `documentos.cartas_aviso` (mismo texto que permisos.config.js): emitir, descargar e imprimir
--      la carta. No va en ningún rol: se da a la persona. El Super Administrador lo tiene por ser rol 1.
--   2. Tipo de documento del sistema CARTA_AVISO (restringido, como contratos y finiquitos: nunca en ZIP ni por
--      correo). INSERT IGNORE + NOT EXISTS, igual que la mig 110.
--   3. Se le da a Matías Millanao (RR.HH.), buscándolo por su correo: si no existe (otro entorno), no se agrega nada.
--      Se le cierra la sesión (`permisos_cambiados_en`, mig 146) para que el permiso entre a su token.
-- Idempotente: no duplica el permiso ni el tipo; repetirla solo vuelve a pedirle a Matías iniciar sesión.

INSERT IGNORE INTO permisos_catalogo (clave, modulo, nombre, descripcion, orden) VALUES
    ('documentos.cartas_aviso', 'Documentos', 'Cartas de aviso de término',
     'Emitir, descargar e imprimir las cartas de aviso de término de contrato (necesidades de la empresa, vencimiento del plazo, no concurrencia). Sin este permiso no se abren, aunque se tenga el de documentos laborales', 8);

INSERT IGNORE INTO tipos_documento (nombre, codigo, restringido, dias_vigencia, obligatorio, activo)
  SELECT 'Carta de Aviso de Término (Bóveda)', 'CARTA_AVISO', 1, NULL, 0, 1 FROM DUAL
  WHERE NOT EXISTS (SELECT 1 FROM tipos_documento WHERE codigo = 'CARTA_AVISO');

INSERT INTO permisos_usuario_override (usuario_id, permiso_clave, tipo)
SELECT u.id, 'documentos.cartas_aviso', 'grant'
FROM usuarios u
WHERE u.email = 'matiasmillanao@lols.cl'
  AND NOT EXISTS (
      SELECT 1 FROM permisos_usuario_override o WHERE o.usuario_id = u.id AND o.permiso_clave = 'documentos.cartas_aviso'
  );

UPDATE usuarios
SET permisos_cambiados_en = UTC_TIMESTAMP()
WHERE email = 'matiasmillanao@lols.cl';
