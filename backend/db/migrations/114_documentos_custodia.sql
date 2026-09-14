-- ============================================================================
-- 114_documentos_custodia.sql — Cadena de custodia de documentos físicos (plan Gestiones, B6)
-- Fecha: 2026-09-14
--
-- CONTEXTO: los documentos generados por Bóveda (mig 110: kit de ingreso, finiquito, amonestación) se
-- IMPRIMEN en la oficina central y viajan en papel: RRHH los imprime → un portador autorizado (encargado
-- de obra) los retira en oficina → el trabajador firma en la obra → el portador devuelve los firmados a
-- RRHH. Hoy nada de eso queda registrado; el requerimiento 9 pide saber dónde está cada documento y qué
-- volvió firmado.
--
-- DECISIONES (dueño, 2026-09-14; docs/reglas/rrhh-trabajadores.md § Cadena de custodia):
--   D-K  Se modela el LOTE, no la entrega por documento: RRHH declara qué entrega (lote pendiente_retiro),
--        el portador CONFIRMA en Bóveda que lo recibió (en_terreno) y RRHH CONFIRMA la devolución de los
--        firmados (firmado). Doble llave estricta: RRHH no puede forzar la confirmación del portador.
--   D-L  "Listo para retirar" = documento ya descargado/impreso desde Bóveda (estado `descargado`);
--        entran todos los generados. Constancia = solo el registro en Bóveda (sin firma digital ni acta);
--        la copia firmada se MARCA recibida, no se sube archivo.
--   D-M  Excepción a D-D (estado monótono, mig 110): un documento devuelto SIN firma, o que el portador
--        declara no haber recibido, vuelve a `descargado` (sigue impreso en oficina y se vuelve a llevar).
--        `entregado` (mig 110) se conserva por compatibilidad y no se usa.
--   D-E  Los permisos solo se CREAN (catálogo + Super Administrador rol 1 + bump). RRHH recibe
--        documentos.entrega.registrar a mano en Configuración → Roles; los portadores (Jhoan Vásquez,
--        Héctor Gómez) reciben documentos.entrega.portar por override de usuario (Config → Usuarios).
--
-- Idempotente: CREATE TABLE IF NOT EXISTS, ADD COLUMN IF NOT EXISTS, MODIFY COLUMN (mismo ENUM ampliado),
-- CREATE INDEX IF NOT EXISTS, INSERT IGNORE.
-- ============================================================================

-- 1) Lotes de custodia: un viaje de documentos en papel a cargo de un portador.
CREATE TABLE IF NOT EXISTS documentos_lotes (
  id INT NOT NULL AUTO_INCREMENT,
  portador_id INT NULL COMMENT 'Usuario que retira y devuelve los documentos (documentos.entrega.portar)',
  creado_por INT NULL COMMENT 'RRHH que armó el lote (documentos.entrega.registrar)',
  estado ENUM('pendiente_retiro','en_terreno','cerrado') NOT NULL DEFAULT 'pendiente_retiro'
    COMMENT 'pendiente_retiro: declarado por RRHH; en_terreno: el portador confirmó; cerrado: nada queda en terreno',
  observacion VARCHAR(500) NULL,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  retirado_en DATETIME NULL COMMENT 'Confirmación del portador',
  cerrado_en DATETIME NULL,
  PRIMARY KEY (id),
  KEY idx_doc_lotes_portador (portador_id, estado),
  KEY idx_doc_lotes_estado (estado, creado_en),
  CONSTRAINT fk_doc_lotes_portador FOREIGN KEY (portador_id) REFERENCES usuarios(id) ON DELETE SET NULL,
  CONSTRAINT fk_doc_lotes_creado_por FOREIGN KEY (creado_por) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Lotes de documentos físicos en custodia de un portador (plan Gestiones B6)';

-- 2) Ítems del lote: un documento por fila, con su desenlace.
CREATE TABLE IF NOT EXISTS documentos_lotes_items (
  id INT NOT NULL AUTO_INCREMENT,
  lote_id INT NOT NULL,
  documento_id INT NOT NULL,
  estado ENUM('pendiente','retirado','firmado','devuelto_sin_firma','no_entregado') NOT NULL DEFAULT 'pendiente'
    COMMENT 'pendiente: sin confirmar; retirado: en terreno; firmado: volvió firmado; devuelto_sin_firma: volvió sin firma; no_entregado: el portador no lo recibió',
  retirado_en DATETIME NULL,
  resuelto_en DATETIME NULL,
  resuelto_por INT NULL,
  observacion VARCHAR(300) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_doc_lotes_items_doc_lote (documento_id, lote_id),
  KEY idx_doc_lotes_items_lote (lote_id, estado),
  CONSTRAINT fk_doc_lotes_items_lote FOREIGN KEY (lote_id) REFERENCES documentos_lotes(id) ON DELETE CASCADE,
  CONSTRAINT fk_doc_lotes_items_doc FOREIGN KEY (documento_id) REFERENCES documentos(id) ON DELETE CASCADE,
  CONSTRAINT fk_doc_lotes_items_resuelto_por FOREIGN KEY (resuelto_por) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Documentos de cada lote de custodia y su desenlace (plan Gestiones B6)';

-- 3) Documentos: estados nuevos + lote vigente + fecha de firma recibida.
ALTER TABLE documentos
  MODIFY COLUMN estado ENUM('subido','generado','descargado','entregado','en_terreno','firmado') NOT NULL DEFAULT 'subido'
    COMMENT 'subido|generado → descargado → en_terreno → firmado (B6). Sin firma / no entregado vuelve a descargado. entregado: legado sin uso';

ALTER TABLE documentos
  ADD COLUMN IF NOT EXISTS lote_id INT NULL COMMENT 'Lote de custodia vigente (B6); NULL = en oficina',
  ADD COLUMN IF NOT EXISTS fecha_firmado DATETIME NULL COMMENT 'RRHH recibió la copia firmada (B6)';

CREATE INDEX IF NOT EXISTS idx_documentos_lote ON documentos (lote_id);

-- 4) Permisos: catálogo PRIMERO (FK), luego Super Administrador. Mismo texto que permisos.config.js.
--    documentos.entrega.registrar ya está pre-registrado (B1); el INSERT IGNORE lo asegura y el UPDATE le
--    quita el "(Disponible próximamente)". El permiso de portador es nuevo.
INSERT IGNORE INTO permisos_catalogo (clave, modulo, nombre, descripcion, orden) VALUES
  ('documentos.entrega.registrar', 'Documentos', 'Registrar Entrega Física (RRHH)',
   'Gestiones → Documentos físicos: armar lotes de documentos impresos para un portador, recibir los firmados que vuelven y anular lotes sin retirar. Habilita el grupo "Documentos físicos" del Inicio.', 7),
  ('documentos.entrega.portar', 'Documentos', 'Portar Documentos Físicos',
   'Confirmar en Bóveda el retiro de MIS lotes de documentos impresos (encargado de obra que los lleva a firmar). Solo ve sus propios lotes.', 8);

UPDATE permisos_catalogo
   SET nombre = 'Registrar Entrega Física (RRHH)',
       descripcion = 'Gestiones → Documentos físicos: armar lotes de documentos impresos para un portador, recibir los firmados que vuelven y anular lotes sin retirar. Habilita el grupo "Documentos físicos" del Inicio.'
 WHERE clave = 'documentos.entrega.registrar' AND descripcion LIKE '(Disponible próximamente)%';

INSERT IGNORE INTO permisos_rol_v2 (rol_id, permiso_clave) VALUES
  (1, 'documentos.entrega.registrar'),
  (1, 'documentos.entrega.portar');

-- Los permisos viajan en el JWT: bump de versión del rol 1 para forzar re-login.
UPDATE roles SET version = version + 1 WHERE id = 1;
