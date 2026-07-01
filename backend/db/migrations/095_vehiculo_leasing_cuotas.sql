-- =============================================
-- 095 — Cuotas de leasing por vehículo
-- =============================================
-- Cuando un vehículo está en leasing, se registran las FECHAS de sus cuotas,
-- cada una con su estado (pagada / pendiente). Una fila por cuota.
-- (Por ahora solo fecha + pagada; el monto se podría agregar más adelante.)
-- Idempotente: CREATE TABLE IF NOT EXISTS. El FK indexa vehiculo_id.

CREATE TABLE IF NOT EXISTS vehiculo_leasing_cuotas (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    vehiculo_id INT NOT NULL,
    fecha       DATE NOT NULL,
    pagada      TINYINT(1) NOT NULL DEFAULT 0,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_vlc_vehiculo FOREIGN KEY (vehiculo_id) REFERENCES vehiculos(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
