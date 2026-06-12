-- =============================================
-- 077 — Documentos del Vehículo (respaldo de papeles)
-- =============================================
-- Permite adjuntar PDFs/imágenes a un vehículo (seguro contra terceros, primera
-- inscripción, póliza, permiso de circulación, otro) para que el conductor pueda
-- verlos desde la app en caso de no llevar los papeles físicos.
-- Idempotente: CREATE TABLE IF NOT EXISTS. Reusa los permisos vehiculos.* existentes.

CREATE TABLE IF NOT EXISTS vehiculo_documentos (
    id             INT AUTO_INCREMENT PRIMARY KEY,
    vehiculo_id    INT          NOT NULL,
    categoria      VARCHAR(40)  NOT NULL,           -- seguro_terceros | primera_inscripcion | poliza | permiso_circulacion | otro
    nombre_archivo VARCHAR(255) NOT NULL,           -- nombre original del archivo
    ruta_archivo   VARCHAR(500) NOT NULL,           -- ruta relativa a backend/uploads/
    subido_por     INT          NULL,
    fecha_subida   DATE         NOT NULL DEFAULT (CURRENT_DATE),
    activo         BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at     TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_vehdoc_vehiculo (vehiculo_id, activo),
    CONSTRAINT fk_vehdoc_vehiculo FOREIGN KEY (vehiculo_id) REFERENCES vehiculos(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
