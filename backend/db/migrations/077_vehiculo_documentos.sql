-- =============================================
-- 077 — Antecedentes de Circulación: documentos del vehículo
-- =============================================
-- Reemplaza el formulario de permiso por un repositorio de documentos/imágenes
-- (permiso de circulación, seguro contra terceros, primera inscripción/padrón,
-- póliza) que el conductor puede ver en línea.
-- Idempotente: CREATE TABLE IF NOT EXISTS. Reusa los permisos vehiculos.* existentes.

CREATE TABLE IF NOT EXISTS vehiculo_documentos (
    id             INT AUTO_INCREMENT PRIMARY KEY,
    vehiculo_id    INT          NOT NULL,
    categoria      VARCHAR(40)  NOT NULL,           -- permiso_circulacion | seguro_terceros | primera_inscripcion | poliza
    nombre_archivo VARCHAR(255) NOT NULL,           -- nombre original del archivo
    ruta_archivo   VARCHAR(500) NOT NULL,           -- ruta relativa a backend/uploads/
    subido_por     INT          NULL,
    fecha_subida   DATE         NOT NULL DEFAULT (CURRENT_DATE),
    activo         BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at     TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_vehdoc_vehiculo (vehiculo_id, activo),
    CONSTRAINT fk_vehdoc_vehiculo FOREIGN KEY (vehiculo_id) REFERENCES vehiculos(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
