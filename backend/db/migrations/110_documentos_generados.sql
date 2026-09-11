-- ============================================================================
-- 110_documentos_generados.sql — Documentos laborales generados por Bóveda (plan Gestiones, B2)
-- Fecha: 2026-09-11
--
-- CONTEXTO: hasta hoy `documentos` (mig 002) solo modela archivos SUBIDOS y la Carta de Amonestación
-- se arma 100% en el navegador (sin permiso, sin persistir, sin log). Los requerimientos 2, 3, 6, 8,
-- 9, 10 y 11 de RRHH exigen que el sistema EMITA documentos (kit de ingreso, contrato, finiquito,
-- amonestación, ficha de solicitud), los guarde en la ficha del trabajador y controle quién los
-- descarga o imprime ("solo oficina").
--
-- DECISIONES (docs/reglas/rrhh-trabajadores.md § Documentos laborales generados):
--   D-A  El .doc es HTML con cabecera MS Office generado en el BACKEND (Word lo abre editable);
--        se guarda en uploads/<tid>/ y queda como fila en `documentos` con origen='generado'.
--   D-B  La restricción vive en el TIPO: `tipos_documento.codigo` (clave estable del sistema) +
--        `restringido` (descarga solo con documentos.laborales.descargar; no editable por UI).
--        Un contrato escaneado y subido a un tipo restringido queda bajo el mismo gate.
--   D-C  Tipos nuevos con nombre distintivo "(Bóveda)" + codigo en el MISMO insert con NOT EXISTS
--        (nunca UPDATE … WHERE nombre= : prod ya tiene 'Contrato de Trabajo', 'Finiquito', 'Charla ODI',
--        etc. como tipos manuales y no se tocan). obligatorio=0 → no alteran la completitud.
--   D-D  Estado monótono subido|generado → descargado → entregado (B6). `fecha_descarga` guarda la
--        PRIMERA descarga; las alertas (B7) cuentan desde `fecha_generacion`, nunca desde la descarga.
--   D-E  Los permisos solo se CREAN (catálogo + Super Administrador rol 1 + bump). La asignación a
--        RRHH/TI la hace el dueño a mano en Configuración → Roles (decisión 2026-09-11).
--   §2b  Empleador: el contrato/finiquito imprime el representante legal → `empresas.representante_*`.
--        Sin representante la emisión responde 409 (solo LOLS y MAUA emiten en v1).
--
-- Idempotente: ADD COLUMN IF NOT EXISTS, CREATE INDEX IF NOT EXISTS, INSERT … WHERE NOT EXISTS,
-- INSERT IGNORE.
-- ============================================================================

-- 1) Tipos de documento: clave estable + restricción de descarga.
ALTER TABLE tipos_documento
  ADD COLUMN IF NOT EXISTS codigo VARCHAR(40) NULL COMMENT 'Clave estable del sistema (plantilla); NULL = tipo manual',
  ADD COLUMN IF NOT EXISTS restringido TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Descarga/impresión solo con documentos.laborales.descargar; no editable por UI';

CREATE UNIQUE INDEX IF NOT EXISTS uk_tipos_documento_codigo ON tipos_documento (codigo);

-- Seed de tipos del sistema (D-C). Todos restringidos, no obligatorios, sin vencimiento.
-- INSERT IGNORE + NOT EXISTS: el primero cubre un choque con el UNIQUE de `nombre` (si alguien ya creó
-- a mano un tipo llamado igual) y el segundo la re-ejecución de la migración.
INSERT IGNORE INTO tipos_documento (nombre, codigo, restringido, dias_vigencia, obligatorio, activo)
  SELECT 'Solicitud de Ingreso (Bóveda)', 'SOLICITUD_INGRESO', 1, NULL, 0, 1 FROM DUAL
  WHERE NOT EXISTS (SELECT 1 FROM tipos_documento WHERE codigo = 'SOLICITUD_INGRESO');
INSERT IGNORE INTO tipos_documento (nombre, codigo, restringido, dias_vigencia, obligatorio, activo)
  SELECT 'Contrato de Trabajo (Bóveda)', 'CONTRATO', 1, NULL, 0, 1 FROM DUAL
  WHERE NOT EXISTS (SELECT 1 FROM tipos_documento WHERE codigo = 'CONTRATO');
INSERT IGNORE INTO tipos_documento (nombre, codigo, restringido, dias_vigencia, obligatorio, activo)
  SELECT 'Finiquito (Bóveda)', 'FINIQUITO', 1, NULL, 0, 1 FROM DUAL
  WHERE NOT EXISTS (SELECT 1 FROM tipos_documento WHERE codigo = 'FINIQUITO');
INSERT IGNORE INTO tipos_documento (nombre, codigo, restringido, dias_vigencia, obligatorio, activo)
  SELECT 'Carta de Amonestación (Bóveda)', 'AMONESTACION', 1, NULL, 0, 1 FROM DUAL
  WHERE NOT EXISTS (SELECT 1 FROM tipos_documento WHERE codigo = 'AMONESTACION');
INSERT IGNORE INTO tipos_documento (nombre, codigo, restringido, dias_vigencia, obligatorio, activo)
  SELECT 'ODI – Obligación de Informar DS 44 (Bóveda)', 'ODI_D40', 1, NULL, 0, 1 FROM DUAL
  WHERE NOT EXISTS (SELECT 1 FROM tipos_documento WHERE codigo = 'ODI_D40');
INSERT IGNORE INTO tipos_documento (nombre, codigo, restringido, dias_vigencia, obligatorio, activo)
  SELECT 'Declaración Derecho a Saber (Bóveda)', 'DAS', 1, NULL, 0, 1 FROM DUAL
  WHERE NOT EXISTS (SELECT 1 FROM tipos_documento WHERE codigo = 'DAS');
INSERT IGNORE INTO tipos_documento (nombre, codigo, restringido, dias_vigencia, obligatorio, activo)
  SELECT 'Procedimiento Trabajo Seguro en Altura (Bóveda)', 'PTS_ALTURA', 1, NULL, 0, 1 FROM DUAL
  WHERE NOT EXISTS (SELECT 1 FROM tipos_documento WHERE codigo = 'PTS_ALTURA');
INSERT IGNORE INTO tipos_documento (nombre, codigo, restringido, dias_vigencia, obligatorio, activo)
  SELECT 'Recepción de Implementos de Seguridad (Bóveda)', 'EPP_RECEPCION', 1, NULL, 0, 1 FROM DUAL
  WHERE NOT EXISTS (SELECT 1 FROM tipos_documento WHERE codigo = 'EPP_RECEPCION');
INSERT IGNORE INTO tipos_documento (nombre, codigo, restringido, dias_vigencia, obligatorio, activo)
  SELECT 'Recepción Reglamento Interno (Bóveda)', 'RI_RECEPCION', 1, NULL, 0, 1 FROM DUAL
  WHERE NOT EXISTS (SELECT 1 FROM tipos_documento WHERE codigo = 'RI_RECEPCION');

-- 2) Documentos: origen, estado y trazabilidad de la emisión.
ALTER TABLE documentos
  ADD COLUMN IF NOT EXISTS origen ENUM('subido','generado') NOT NULL DEFAULT 'subido',
  ADD COLUMN IF NOT EXISTS estado ENUM('subido','generado','descargado','entregado') NOT NULL DEFAULT 'subido' COMMENT 'Monótono; entregado lo fija B6',
  ADD COLUMN IF NOT EXISTS generado_por INT NULL,
  ADD COLUMN IF NOT EXISTS fecha_generacion DATETIME NULL,
  ADD COLUMN IF NOT EXISTS fecha_descarga DATETIME NULL COMMENT 'Primera descarga/impresión; NO reinicia alertas',
  ADD COLUMN IF NOT EXISTS plantilla_version VARCHAR(20) NULL,
  ADD COLUMN IF NOT EXISTS metadata JSON NULL COMMENT 'Snapshot de los datos usados al emitir (puede traer remuneración: NUNCA sale por documentos.ver)';

CREATE INDEX IF NOT EXISTS idx_documentos_estado ON documentos (estado, activo);

-- 3) Empresas: representante legal (se imprime en contrato y finiquito).
ALTER TABLE empresas
  ADD COLUMN IF NOT EXISTS representante_nombre VARCHAR(150) NULL COMMENT 'Representante legal que firma contratos/finiquitos',
  ADD COLUMN IF NOT EXISTS representante_rut VARCHAR(12) NULL;

-- 4) Permisos: catálogo PRIMERO (FK), luego Super Administrador. Mismo texto que permisos.config.js.
INSERT IGNORE INTO permisos_catalogo (clave, modulo, nombre, descripcion, orden) VALUES
  ('documentos.laborales.emitir',    'Documentos', 'Emitir Documentos Laborales',                 'Gestiones → ficha del trabajador: emitir contrato, kit de ingreso, finiquito y carta de amonestación generados por Bóveda.', 5),
  ('documentos.laborales.descargar', 'Documentos', '⚠️ Descargar / Imprimir Documentos Laborales', 'Descargar o imprimir contratos, finiquitos y anexos laborales — solo oficina (RRHH, TI, administración). Incluye ver la remuneración impresa en el contrato.', 6);

INSERT IGNORE INTO permisos_rol_v2 (rol_id, permiso_clave) VALUES
  (1, 'documentos.laborales.emitir'),
  (1, 'documentos.laborales.descargar');

-- Los permisos viajan en el JWT: bump de versión del rol 1 para forzar re-login.
UPDATE roles SET version = version + 1 WHERE id = 1;
