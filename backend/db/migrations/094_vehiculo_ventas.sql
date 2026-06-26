-- =============================================
-- 094 — Historial de venta de vehículos
-- =============================================
-- Registra la venta (baja por venta) de un vehículo y permite ver la diferencia
-- entre el precio de compra y el de venta (ganancia / pérdida). El historial se
-- muestra en "Obras Finalizadas".
-- Reusa los permisos vehiculos.* existentes (vender = vehiculos.editar;
-- ver historial = vehiculos.ver). No agrega permisos nuevos.
-- Idempotente: ADD COLUMN IF NOT EXISTS + CREATE TABLE IF NOT EXISTS
-- (mismo patrón que mig 086 / 089 / 077).

-- Precio de compra / adquisición por vehículo (separado de 'valor' patrimonial).
-- Es la base de la diferencia compra-venta al vender.
ALTER TABLE vehiculos
    ADD COLUMN IF NOT EXISTS precio_compra DECIMAL(12,2) NOT NULL DEFAULT 0
        COMMENT 'Precio de compra/adquisicion. Base de la diferencia compra-venta al vender.';

CREATE TABLE IF NOT EXISTS vehiculo_ventas (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    vehiculo_id   INT           NOT NULL,
    fecha_venta   DATE          NOT NULL,
    precio_compra DECIMAL(12,2) NOT NULL DEFAULT 0,   -- snapshot del precio de compra al vender
    precio_venta  DECIMAL(12,2) NOT NULL DEFAULT 0,
    comprador     VARCHAR(200)  NULL,
    observaciones TEXT          NULL,
    vendido_por   INT           NULL,                 -- id del usuario que registró la venta
    created_at    TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_vehventa_vehiculo (vehiculo_id),
    INDEX idx_vehventa_fecha (fecha_venta),
    CONSTRAINT fk_vehventa_vehiculo FOREIGN KEY (vehiculo_id) REFERENCES vehiculos(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
