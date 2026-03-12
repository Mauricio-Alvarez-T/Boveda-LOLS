-- Tabla para almacenar feriados (nacionales y manuales)
CREATE TABLE IF NOT EXISTS feriados (
    id INT AUTO_INCREMENT PRIMARY KEY,
    fecha DATE NOT NULL UNIQUE,
    nombre VARCHAR(255) NOT NULL,
    tipo ENUM('nacional', 'obra', 'patronal', 'otro') DEFAULT 'nacional',
    irrenunciable BOOLEAN DEFAULT FALSE,
    activo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Indexar por fecha para búsquedas rápidas en reportes
CREATE INDEX idx_feriados_fecha ON feriados(fecha);
