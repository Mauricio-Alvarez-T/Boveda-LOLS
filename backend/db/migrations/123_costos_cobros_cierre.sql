-- ============================================================
-- 123 · Costos de obra: cobros al mandante, flujo de caja, cierre de obra y m² (2026-10-19)
-- ============================================================
-- Pedido de Marcos: flujo de caja de las próximas semanas, cierre de obra y comparar obras con
-- costo por m² (docs/reglas/costos.md).
--
--  · costo_cobros: lo que se espera cobrar al mandante (estado de pago, factura de venta, anticipo,
--    devolución de retenciones). Es lo que ENTRA en el flujo de caja; los gastos por pagar son lo
--    que sale. Mínimo a propósito: los estados de pago completos se definen con Rodrigo.
--  · costo_presupuestos: superficie en m² (para el costo por m²) y el cierre: fecha, quién, foto
--    de los números finales (JSON) y lo aprendido. Una obra cerrada no admite cambios de montos.
--  · costo_historial: entidad 'cobro' y acciones 'cerrar' / 'reabrir'.
--
-- Idempotente: CREATE TABLE IF NOT EXISTS, ADD COLUMN IF NOT EXISTS (MariaDB), MODIFY COLUMN con
-- la definición completa (repetirlo deja lo mismo).
-- ============================================================

CREATE TABLE IF NOT EXISTS costo_cobros (
    id INT AUTO_INCREMENT PRIMARY KEY,
    obra_id INT NOT NULL,
    fecha DATE NOT NULL COMMENT 'Fecha esperada de cobro',
    glosa VARCHAR(200) NOT NULL COMMENT 'EP 8, anticipo, devolución de retenciones…',
    monto_neto DECIMAL(14,2) NOT NULL,
    iva DECIMAL(14,2) NOT NULL DEFAULT 0,
    retencion DECIMAL(14,2) NOT NULL DEFAULT 0 COMMENT 'Lo que el mandante retiene de este cobro',
    estado ENUM('por_cobrar','cobrado') NOT NULL DEFAULT 'por_cobrar',
    fecha_cobro DATE NULL,
    observacion VARCHAR(500) NULL,
    creado_por INT NOT NULL,
    actualizado_por INT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_costo_cobros_obra (obra_id, fecha),
    INDEX idx_costo_cobros_estado (estado, fecha),
    CONSTRAINT fk_costo_cobro_obra FOREIGN KEY (obra_id) REFERENCES obras(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_costo_cobro_usuario FOREIGN KEY (creado_por) REFERENCES usuarios(id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE costo_presupuestos
    ADD COLUMN IF NOT EXISTS superficie_m2 DECIMAL(10,2) NULL COMMENT 'Superficie construida, para el costo por m²',
    ADD COLUMN IF NOT EXISTS cerrado_at DATETIME NULL COMMENT 'Cierre de obra: con fecha, los montos quedan congelados',
    ADD COLUMN IF NOT EXISTS cerrado_por INT NULL,
    ADD COLUMN IF NOT EXISTS cierre_resumen TEXT NULL COMMENT 'JSON: números finales al cerrar',
    ADD COLUMN IF NOT EXISTS cierre_lecciones TEXT NULL COMMENT 'Qué aprendimos de la obra';

ALTER TABLE costo_historial
    MODIFY COLUMN entidad ENUM('presupuesto','partida','gasto','cobro') NOT NULL,
    MODIFY COLUMN accion ENUM('crear','editar','borrar','importar','cerrar','reabrir') NOT NULL;
