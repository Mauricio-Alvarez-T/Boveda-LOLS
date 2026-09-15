-- ============================================================================
-- 115_documentos_alertas.sql — Alertas configurables de documentos sin firmar (plan Gestiones, B7)
-- Fecha: 2026-09-15
--
-- CONTEXTO: con la cadena de custodia (mig 114) un documento generado por Bóveda pasa por
-- generado (sin imprimir) → descargado (impreso, por retirar) → en_terreno (con el portador) → firmado.
-- El requerimiento 11 de RRHH pide ver en el Inicio lo que lleva demasiado tiempo sin cerrar el ciclo,
-- con umbrales por tipo de documento que RRHH ajusta sin tocar código.
--
-- DECISIONES (docs/reglas/rrhh-trabajadores.md § Alertas de documentos sin firmar):
--   D-N  Umbrales por CATEGORÍA en tabla (`documentos_alertas_config`): `categoria` = tipos_documento.codigo
--        para los documentos, más dos categorías de lote (LOTE_SIN_CONFIRMAR, LOTE_EN_TERRENO). Dos
--        niveles: `dias_aviso` (ámbar) y `dias_critico` (rojo), con dias_critico >= dias_aviso (regla
--        cruzada en beforeUpdate). Categorías fijas (seed): la UI solo edita etiqueta/días/activo.
--   D-D  Los días de un documento cuentan desde `fecha_generacion` (nunca desde la descarga: re-imprimir
--        no silencia el aviso). Los de un lote, desde `creado_en` (sin confirmar) o `retirado_en` (en terreno).
--   D-O  Alertas SOLO in-app (Bandeja del Día + pestaña Documentos físicos). Sin correo en v1; un cron de
--        email sería un follow-up (patrón de avisos diarios, mig 084).
--   D-E  El permiso solo se CREA (catálogo + Super Administrador rol 1 + bump); RRHH lo recibe a mano.
--
-- Idempotente: CREATE TABLE IF NOT EXISTS, INSERT IGNORE (categoria UNIQUE), UPDATE acotado.
-- ============================================================================

CREATE TABLE IF NOT EXISTS documentos_alertas_config (
  id INT NOT NULL AUTO_INCREMENT,
  categoria VARCHAR(40) NOT NULL COMMENT 'tipos_documento.codigo, o LOTE_SIN_CONFIRMAR / LOTE_EN_TERRENO',
  etiqueta VARCHAR(100) NOT NULL,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  dias_aviso INT NOT NULL DEFAULT 3 COMMENT 'Desde este día aparece en la Bandeja (ámbar)',
  dias_critico INT NOT NULL DEFAULT 10 COMMENT 'Desde este día se marca crítico (rojo); >= dias_aviso',
  orden INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_doc_alertas_categoria (categoria)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Umbrales (días) de alerta por tipo de documento laboral sin firmar y por lote (plan Gestiones B7)';

-- Seed: documentos del kit y sueltos (categoria = codigo de la mig 110) + lotes de custodia (mig 114).
-- La ficha de solicitud no se firma en obra → arranca desactivada; RRHH la activa si quiere seguirla.
INSERT IGNORE INTO documentos_alertas_config (categoria, etiqueta, activo, dias_aviso, dias_critico, orden) VALUES
  ('CONTRATO',           'Contrato de trabajo sin firmar',            1, 3, 10, 10),
  ('ODI_D40',            'ODI (DS 44) sin firmar',                    1, 3, 10, 20),
  ('DAS',                'Derecho a Saber sin firmar',                1, 3, 10, 30),
  ('PTS_ALTURA',         'PTS trabajo en altura sin firmar',          1, 3, 10, 40),
  ('EPP_RECEPCION',      'Recepción de EPP sin firmar',               1, 3, 10, 50),
  ('RI_RECEPCION',       'Recepción de Reglamento Interno sin firmar', 1, 3, 10, 60),
  ('FINIQUITO',          'Finiquito sin firmar',                      1, 3,  7, 70),
  ('AMONESTACION',       'Carta de amonestación sin firmar',          1, 3, 10, 80),
  ('SOLICITUD_INGRESO',  'Ficha de solicitud impresa sin cerrar',     0, 5, 15, 90),
  ('LOTE_SIN_CONFIRMAR', 'Lote entregado que el portador no confirmó', 1, 1,  3, 100),
  ('LOTE_EN_TERRENO',    'Lote en terreno sin volver firmado',        1, 7, 14, 110);

-- Permiso: catálogo PRIMERO (FK), luego Super Administrador. Mismo texto que permisos.config.js.
INSERT IGNORE INTO permisos_catalogo (clave, modulo, nombre, descripcion, orden) VALUES
  ('sistema.alertas_documentos.gestionar', 'Sistema', 'Configurar Alertas de Documentos',
   'Configuración → Alertas de Documentos: días de aviso y crítico por tipo de documento laboral sin firmar y por lote de custodia (plan Gestiones B7). Solo in-app: Bandeja del Día y Documentos físicos.', 9);

UPDATE permisos_catalogo
   SET descripcion = 'Configuración → Alertas de Documentos: días de aviso y crítico por tipo de documento laboral sin firmar y por lote de custodia (plan Gestiones B7). Solo in-app: Bandeja del Día y Documentos físicos.'
 WHERE clave = 'sistema.alertas_documentos.gestionar' AND descripcion LIKE '(Disponible próximamente)%';

INSERT IGNORE INTO permisos_rol_v2 (rol_id, permiso_clave) VALUES (1, 'sistema.alertas_documentos.gestionar');

-- Los permisos viajan en el JWT: bump de versión del rol 1 para forzar re-login.
UPDATE roles SET version = version + 1 WHERE id = 1;
