-- =============================================
-- Migración 150: errores que se vigilan solos y apartados propios (Soporte → Errores)
-- =============================================
-- Marcos 2026-11-03 (página «Errores que se vigilan solos» del lienzo «Soporte: anuncios y uso»):
--   1) «Arreglado en esta versión»: versión = cada subida a producción. La app manda con cada error la versión que
--      tenía abierta (`version_app`, «AAAAMMDD-HHMM» en UTC = cuándo se compiló; ordena sola). Al marcar un error
--      arreglado se guarda en qué versión (`arreglado_version`, `arreglado_tipo`: 'actual' = la que está arriba ahora,
--      'proxima' = la que se suba después).
--   2) Si el mismo error (misma `firma`) le vuelve a pasar a alguien con esa versión o una más nueva, entra como
--      nuevo con `reaparecio_de` = el arreglado, y a ese se le anota `arreglo_fallo_en` (el arreglo no funcionó); se
--      avisa a los programadores. Con una versión más vieja (Bóveda viejo abierto) no cuenta.
--   3) Apartados propios además de «Señal y lentitud» y «Datos mal ingresados»: `soporte_apartados`; un error va a uno
--      con `apartado_id`; y `soporte_apartado_firmas` dice a qué apartado llegan solos los próximos errores iguales.
--
-- Todo NUEVO y opcional: las filas existentes quedan sin versión, sin arreglo y sin apartado (como hasta hoy).
-- Idempotente: ADD COLUMN / ADD INDEX IF NOT EXISTS y CREATE TABLE IF NOT EXISTS (MariaDB 10.6). Sin UPDATE ni DELETE.

ALTER TABLE soporte_errores
    ADD COLUMN IF NOT EXISTS version_app VARCHAR(20) NULL
        COMMENT 'Versión de Bóveda que tenía abierta la persona (AAAAMMDD-HHMM, UTC, cuándo se compiló) (mig 150)',
    ADD COLUMN IF NOT EXISTS arreglado_version VARCHAR(20) NULL
        COMMENT 'Arreglado en esta versión: si vuelve a pasar con esa o una más nueva, se reabre (mig 150)',
    ADD COLUMN IF NOT EXISTS arreglado_tipo ENUM('actual','proxima') NULL
        COMMENT 'actual = vale desde arreglado_version; proxima = desde la versión siguiente a esa (mig 150)',
    ADD COLUMN IF NOT EXISTS arreglo_fallo_en DATETIME NULL
        COMMENT 'Cuándo volvió a pasar con la versión del arreglo: el arreglo no funcionó (mig 150)',
    ADD COLUMN IF NOT EXISTS reaparecio_de INT NULL
        COMMENT 'Error arreglado del que este es la vuelta (mig 150)',
    ADD COLUMN IF NOT EXISTS apartado_id INT NULL
        COMMENT 'Apartado propio de Soporte donde está (soporte_apartados) (mig 150)';

ALTER TABLE soporte_errores
    ADD INDEX IF NOT EXISTS idx_soporte_errores_firma_estado (firma, estado);

ALTER TABLE soporte_errores
    ADD INDEX IF NOT EXISTS idx_soporte_errores_apartado (apartado_id, estado);

CREATE TABLE IF NOT EXISTS soporte_apartados (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(60) NOT NULL,
    creado_por INT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_soporte_apartados_nombre (nombre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS soporte_apartado_firmas (
    firma CHAR(40) NOT NULL PRIMARY KEY COMMENT 'Los próximos errores con esta firma llegan solos a este apartado',
    apartado_id INT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_soporte_apartado_firmas_apartado (apartado_id),
    CONSTRAINT fk_soporte_apartado_firmas_apartado FOREIGN KEY (apartado_id) REFERENCES soporte_apartados(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
