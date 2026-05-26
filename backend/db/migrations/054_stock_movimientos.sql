-- =============================================
-- Migración 054: Kardex de movimientos de stock + permiso de consulta
-- =============================================
-- Requerimiento #31 (versión completa): cada cambio de stock deja una fila
-- con item, ubicación, delta exacto (antes→después), tipo, referencia, motivo,
-- usuario y timestamp. Permite reportes "movimientos del día/semana/mes".
--
-- Esta migración crea la tabla + el permiso de consulta. Los hooks que
-- escriben en la tabla se implementan en código (esta sesión: solo ajustes
-- manuales; transferencias/discrepancias/facturas en fases posteriores).
--
-- Sin FK a obras/bodegas/usuarios: el movimiento es histórico y debe
-- sobrevivir el borrado de esas entidades (igual criterio que logs_actividad).
-- =============================================

-- ─── A. Tabla stock_movimientos ───
CREATE TABLE IF NOT EXISTS stock_movimientos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    item_id INT NOT NULL,
    obra_id INT NULL,
    bodega_id INT NULL,
    tipo ENUM('ajuste_manual','transferencia_salida','transferencia_entrada',
              'discrepancia','factura','recepcion') NOT NULL,
    cantidad_anterior DECIMAL(12,4) NOT NULL,
    cantidad_nueva DECIMAL(12,4) NOT NULL,
    delta DECIMAL(12,4) GENERATED ALWAYS AS (cantidad_nueva - cantidad_anterior) STORED,
    referencia_tipo VARCHAR(30) NULL,
    referencia_id INT NULL,
    motivo VARCHAR(255) NULL,
    usuario_id INT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_mov_item (item_id),
    INDEX idx_mov_obra_fecha (obra_id, created_at),
    INDEX idx_mov_bodega_fecha (bodega_id, created_at),
    INDEX idx_mov_fecha (created_at),
    INDEX idx_mov_tipo (tipo),
    INDEX idx_mov_ref (referencia_tipo, referencia_id),
    CONSTRAINT fk_mov_item FOREIGN KEY (item_id) REFERENCES items_inventario(id) ON DELETE CASCADE,
    CONSTRAINT chk_mov_xor CHECK ((obra_id IS NULL) <> (bodega_id IS NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── B. Permiso de consulta ───
-- Política deny-by-default: solo Super Admin (rol_id=1) lo recibe automáticamente.
-- Otros roles se asignan manualmente vía PermisosRolPanel.
INSERT IGNORE INTO permisos_catalogo (clave, modulo, nombre, descripcion, orden) VALUES
    ('inventario.movimientos.ver', 'Inventario', 'Ver Movimientos de Stock',
     'Acceso al historial/kardex de movimientos de stock (ajustes, transferencias, discrepancias)', 50);

INSERT IGNORE INTO permisos_rol_v2 (rol_id, permiso_clave) VALUES
    (1, 'inventario.movimientos.ver');

-- ─── C. Bump version del Super Admin para forzar refresh de permisos ───
-- (patrón mig 043/046: invalida sesión → re-login recoge el permiso nuevo)
UPDATE roles SET version = version + 1 WHERE id = 1;
