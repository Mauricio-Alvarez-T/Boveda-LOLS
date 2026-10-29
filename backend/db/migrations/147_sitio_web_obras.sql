-- =============================================
-- 147 — Sitio web: las obras de lols.cl se editan en la Bóveda y se publican desde aquí
-- =============================================
-- Decisión del dueño (28-10-2026, plan docs/plans/2026-10-28-sitio-web-obras.md): las obras del portafolio de
-- lols.cl (en construcción, en proyecto y terminadas) dejan de escribirse en el código del sitio. Se cargan en
-- la Bóveda y «Publicar» hace UN commit en el repo PÚBLICO del sitio con un JSON por obra
-- (src/content/obras/<slug>.json) y su portada (public/proyectos/<slug>/portada.<hash8>-<800|1600>.webp).
-- El contrato del JSON lo manda lols.cl (src/content.config.ts, docs/contenido-obras.md): por eso aquí NO hay
-- rol, plazo, cifra ni video (el sitio no los acepta) y sí `direccion` (se publica, D3) y `referencia`.
--
--   sitio_obras          la obra tal como sale al sitio + incluir/orden + lo último publicado (publicado_*).
--                        `obra_id` (vínculo opcional a obras) NUNCA sale al JSON; el mandante solo sale con su
--                        autorización registrada. `updated_at` lleva milisegundos: es la versión que compara la
--                        edición (409 si otra persona guardó antes).
--   sitio_obra_fotos     la portada con sus dos llaves atadas a los BYTES: «no se reconoce a nadie» (confirmado_*)
--                        y aprobación del mismo hash (aprobada_hash). Rechazar = bloqueo de emergencia.
--                        `heredada_src` = el 1.jpg que ya estaba publicado (importación desde el sitio).
--   sitio_publicaciones  cada publicación (o simulación, o importación) con su manifiesto {ruta: blobSha}.
--   sitio_web_historial  quién hizo qué, con antes → después.
--
-- Valores cambiantes (estado, rol, modo, acción) en VARCHAR validados en el código (como la mig 124): la lista
-- vive en src/config/sitioWeb.config.js. Permisos: sitio_web.ver / .editar / .publicar; aquí solo el rol 1
-- (Super Administrador). El resto se asigna con los niveles por pantalla de Configuración › Roles y `publicar`
-- como acción aparte (ningún nivel la da sola).
--
-- Idempotente (MariaDB): CREATE TABLE IF NOT EXISTS + INSERT IGNORE.

CREATE TABLE IF NOT EXISTS sitio_obras (
    id INT AUTO_INCREMENT PRIMARY KEY,
    obra_id INT NULL COMMENT 'Vínculo opcional a obras, NUNCA sale al JSON',
    slug VARCHAR(80) NOT NULL COMMENT 'Nombre del archivo y URL en el sitio, se congela tras la primera publicación',
    nombre VARCHAR(160) NOT NULL,
    titular VARCHAR(240) NULL,
    tipo VARCHAR(40) NULL COMMENT '= tiposObra de lols.cl (sitioWeb.config.js TIPOS)',
    mandante VARCHAR(160) NULL COMMENT 'Sale al sitio solo con mandante_autoriza = 1',
    mandante_autoriza BOOLEAN NOT NULL DEFAULT 0,
    mandante_autoriza_por INT NULL,
    mandante_autoriza_at DATETIME NULL,
    comuna VARCHAR(80) NULL COMMENT 'Obligatoria para publicar',
    direccion VARCHAR(200) NULL COMMENT 'Se publica (decisión del dueño 28-10, D3)',
    superficie_m2 INT NULL COMMENT 'Entero >= 1 (el sitio la muestra como «6.220 m²»)',
    estado VARCHAR(20) NOT NULL DEFAULT 'en_construccion' COMMENT 'en_construccion|contratado|terminado',
    anio SMALLINT NULL COMMENT 'Año de término: solo sale en obras terminadas',
    inicio VARCHAR(40) NULL,
    servicios VARCHAR(200) NOT NULL DEFAULT '' COMMENT 'CSV de slugs de servicios del sitio',
    desafio TEXT NULL,
    solucion TEXT NULL,
    resultado TEXT NULL,
    referencia VARCHAR(80) NULL COMMENT 'Imagen referencial del sitio (importada), null al aprobarse una portada propia',
    orden INT NOT NULL DEFAULT 0 COMMENT 'Orden dentro de su estado: 10, 20, 30…',
    incluir BOOLEAN NOT NULL DEFAULT 0 COMMENT '1 = va en la próxima publicación',
    publicado_hash CHAR(64) NULL COMMENT 'sha256 del JSON que entró al último commit OK',
    publicado_json MEDIUMTEXT NULL COMMENT 'Último JSON publicado OK (se reusa si la obra queda con faltantes)',
    publicado_at DATETIME NULL,
    creado_por INT NULL,
    actualizado_por INT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    UNIQUE KEY uk_sitio_obras_slug (slug),
    UNIQUE KEY uk_sitio_obras_obra (obra_id),
    INDEX idx_sitio_obras_incluir (incluir, estado, orden),
    CONSTRAINT fk_sitio_obras_obra FOREIGN KEY (obra_id) REFERENCES obras(id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sitio_obra_fotos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sitio_obra_id INT NOT NULL,
    rol VARCHAR(10) NOT NULL DEFAULT 'portada' COMMENT 'portada|galeria (galería en Fase 2)',
    orden INT NOT NULL DEFAULT 0,
    alt VARCHAR(200) NULL,
    ruta VARCHAR(255) NOT NULL COMMENT 'Prefijo relativo a uploads (sitio-web/<obra>/<hash>), nunca sale al JSON',
    heredada_src VARCHAR(255) NULL COMMENT 'Importada del sitio: /proyectos/<slug>/1.jpg tal como está publicada',
    hash CHAR(64) NOT NULL COMMENT 'sha256 de la maestra sin metadatos, nombra los archivos publicados',
    ancho INT NOT NULL COMMENT 'De la imagen publicada (src)',
    alto INT NOT NULL,
    tamano_bytes INT NOT NULL,
    subido_por INT NULL,
    sin_personas_confirmado BOOLEAN NOT NULL DEFAULT 0,
    confirmado_por INT NULL,
    confirmado_at DATETIME NULL,
    aprobada_por INT NULL,
    aprobada_at DATETIME NULL,
    aprobada_hash CHAR(64) NULL COMMENT 'Bytes aprobados',
    rechazada_por INT NULL,
    rechazada_at DATETIME NULL COMMENT 'Bloqueo de emergencia',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_sitio_fotos_obra (sitio_obra_id, rol, orden),
    CONSTRAINT fk_sitio_fotos_obra FOREIGN KEY (sitio_obra_id) REFERENCES sitio_obras(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sitio_publicaciones (
    id INT AUTO_INCREMENT PRIMARY KEY,
    usuario_id INT NOT NULL,
    modo VARCHAR(12) NOT NULL COMMENT 'publicar|simulacion|importacion',
    repo VARCHAR(120) NOT NULL,
    rama VARCHAR(100) NOT NULL,
    estado VARCHAR(20) NOT NULL DEFAULT 'en_curso' COMMENT 'en_curso|ok|sin_cambios|simulada|error|interrumpida',
    commit_sha CHAR(40) NULL COMMENT 'Se guarda ANTES del PATCH',
    parent_sha CHAR(40) NULL,
    manifiesto_previsto MEDIUMTEXT NULL,
    manifiesto MEDIUMTEXT NULL COMMENT '{ruta: blobSha} confirmado',
    obras_json MEDIUMTEXT NULL COMMENT '{sitio_obra_id: sha256} de lo enviado',
    obras_incluidas INT NOT NULL DEFAULT 0,
    resumen VARCHAR(500) NULL,
    error_codigo VARCHAR(60) NULL,
    error_mensaje VARCHAR(500) NULL COMMENT 'Seguro: sin token ni headers',
    build_estado VARCHAR(20) NULL COMMENT 'en_cola|compilando|ok|fallo|reemplazada',
    build_url VARCHAR(255) NULL,
    en_linea_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    finalizado_at DATETIME NULL,
    INDEX idx_sitio_pub_estado (estado, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sitio_web_historial (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sitio_obra_id INT NULL COMMENT 'Sin FK: el historial queda aunque la obra se borre',
    entidad VARCHAR(20) NOT NULL COMMENT 'obra|foto|publicacion',
    entidad_id INT NULL,
    accion VARCHAR(24) NOT NULL,
    resumen VARCHAR(500) NOT NULL,
    detalle TEXT NULL COMMENT 'JSON: antes → después de lo que cambió',
    usuario_id INT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_sitio_hist_obra (sitio_obra_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Catálogo primero y luego el rol (FK permisos_rol_v2.permiso_clave → permisos_catalogo.clave).
-- Mismos textos que backend/src/config/permisos.config.js.
INSERT IGNORE INTO permisos_catalogo (clave, modulo, nombre, descripcion, orden) VALUES
    ('sitio_web.ver', 'Sitio web', 'Ver sitio web',
     'Sitio web: ver las obras de lols.cl, sus fotos, la vista previa y el estado de cada publicación', 1),
    ('sitio_web.editar', 'Sitio web', 'Editar obras del sitio web',
     'Sitio web: crear y editar las obras (borradores), ordenarlas, incluirlas o quitarlas del sitio y subir sus fotos confirmando que no se reconoce a nadie', 2),
    ('sitio_web.publicar', 'Sitio web', '⚠️ Publicar en lols.cl',
     'Sitio web: aprobar y rechazar fotos y publicar en el sitio público lols.cl (lo publicado queda en el historial público del sitio)', 3);

INSERT IGNORE INTO permisos_rol_v2 (rol_id, permiso_clave) VALUES
    (1, 'sitio_web.ver'), (1, 'sitio_web.editar'), (1, 'sitio_web.publicar');
