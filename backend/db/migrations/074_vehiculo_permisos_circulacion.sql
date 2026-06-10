-- Permisos de Circulación de vehículos (anual, con vencimiento como seguros/revisiones).
CREATE TABLE IF NOT EXISTS vehiculo_permisos (
    id                  INT AUTO_INCREMENT PRIMARY KEY,
    vehiculo_id         INT          NOT NULL,
    numero_permiso      VARCHAR(100) NULL,
    fecha_emision       DATE         NULL,
    fecha_vencimiento   DATE         NOT NULL,
    monto               DECIMAL(12,2) NULL,
    municipalidad       VARCHAR(200) NULL,
    observaciones       TEXT         NULL,
    dias_alerta         INT          NULL DEFAULT 30
        COMMENT 'Días antes del vencimiento para enviar alerta',
    email_alerta        VARCHAR(200) NULL
        COMMENT 'Email al que se envía la alerta de vencimiento',
    tel_alerta          VARCHAR(30)  NULL,
    activo              BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (vehiculo_id) REFERENCES vehiculos(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
