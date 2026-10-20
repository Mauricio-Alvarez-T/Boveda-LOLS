-- =============================================
-- 122 — Costos de obra: presupuesto por partidas, gastos con foto e historial
-- =============================================
-- Pedido de Rodrigo (número dos de LOLS, 2026-10-15), contado por Marcos el 16-10:
-- un apartado donde don Luis, Rodrigo y el arquitecto carguen por obra el presupuesto y
-- las facturas de gastos, para ver si se compró bien, pérdidas, gastos en vano y alzas.
-- Hoy lo llevan a mano o de memoria y se olvidan datos. ESQUELETO para mostrarle a
-- Rodrigo en staging; la estructura puede cambiar cuando traiga su Excel real.
--
-- Estructura (presupuesto de obra chileno, ver docs/reglas/costos.md):
--   itemizado = capítulos → partidas (unidad, cantidad, precio unitario)
--   costo directo = Σ partidas
--   + gastos generales % + imprevistos % sobre el costo directo
--   + utilidad % sobre (CD + GG + imprevistos)   = neto
--   + IVA % sobre el neto                       = total
--
-- Historial: el presupuesto NO se versiona por copia; cada cambio (crear, editar, borrar,
-- importar) deja una fila en costo_historial con quién, cuándo y antes → después. Las
-- partidas agregadas después del presupuesto original van marcadas `origen='modificacion'`
-- con su motivo (aumento de obra, obra extraordinaria, rebaja con cantidad negativa).
--
-- Gastos: la foto de la factura (lo que hoy mandan por mensaje) se guarda en
-- uploads/costos/ comprimida en el teléfono a ~300 KB para que se LEA. Se asigna a una
-- partida o a una categoría; "por completar" = sin proveedor o sin partida/categoría.
--
-- Permiso único `costos.gestionar` (ver, agregar, modificar y borrar): se asigna POR
-- USUARIO a don Luis, Rodrigo y el arquitecto. El Super Administrador lo recibe como
-- todas las claves (Marcos y Mauricio ven todo, decisión de Marcos 16-10).
--
-- Idempotente (MariaDB): CREATE TABLE IF NOT EXISTS + INSERT IGNORE.

CREATE TABLE IF NOT EXISTS costo_presupuestos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    obra_id INT NOT NULL,
    gg_pct DECIMAL(5,2) NOT NULL DEFAULT 0 COMMENT 'Gastos generales, % sobre el costo directo',
    imprevistos_pct DECIMAL(5,2) NOT NULL DEFAULT 0 COMMENT '% sobre el costo directo',
    utilidad_pct DECIMAL(5,2) NOT NULL DEFAULT 0 COMMENT '% sobre costo directo + GG + imprevistos',
    iva_pct DECIMAL(5,2) NOT NULL DEFAULT 19,
    observacion VARCHAR(500) NULL,
    creado_por INT NULL,
    actualizado_por INT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_costo_presupuesto_obra (obra_id),
    CONSTRAINT fk_costo_pres_obra FOREIGN KEY (obra_id) REFERENCES obras(id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS costo_partidas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    presupuesto_id INT NOT NULL,
    capitulo VARCHAR(150) NOT NULL DEFAULT 'General',
    codigo VARCHAR(30) NULL COMMENT 'Ítem del itemizado: 2.1.3',
    descripcion VARCHAR(300) NOT NULL,
    unidad VARCHAR(20) NULL COMMENT 'm3, m2, ml, kg, gl, un…',
    cantidad DECIMAL(14,3) NOT NULL DEFAULT 0,
    precio_unitario DECIMAL(14,2) NOT NULL DEFAULT 0 COMMENT 'Neto, sin IVA',
    origen ENUM('original','modificacion') NOT NULL DEFAULT 'original',
    motivo VARCHAR(300) NULL COMMENT 'Solo modificaciones: aumento de obra, obra extraordinaria, rebaja…',
    orden INT NOT NULL DEFAULT 0,
    creado_por INT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_costo_partida_pres (presupuesto_id, orden),
    CONSTRAINT fk_costo_partida_pres FOREIGN KEY (presupuesto_id) REFERENCES costo_presupuestos(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS costo_gastos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    obra_id INT NOT NULL,
    fecha DATE NOT NULL,
    tipo_documento ENUM('factura','boleta','guia','otro') NOT NULL DEFAULT 'factura',
    proveedor VARCHAR(200) NULL,
    folio VARCHAR(40) NULL,
    monto_neto DECIMAL(14,2) NULL,
    iva DECIMAL(14,2) NULL,
    monto_total DECIMAL(14,2) NOT NULL,
    categoria ENUM('materiales','mano_obra','maquinaria','subcontrato','combustible','gastos_generales','otro') NULL,
    partida_id INT NULL,
    estado_pago ENUM('por_pagar','pagada') NOT NULL DEFAULT 'por_pagar',
    fecha_vencimiento DATE NULL,
    fecha_pago DATE NULL,
    observacion VARCHAR(500) NULL,
    foto_nombre VARCHAR(255) NULL,
    foto_ruta VARCHAR(500) NULL COMMENT 'Relativa a backend/uploads; nunca sale al JSON',
    foto_mime VARCHAR(100) NULL,
    foto_tamano INT UNSIGNED NULL,
    creado_por INT NOT NULL,
    actualizado_por INT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_costo_gasto_obra (obra_id, fecha),
    INDEX idx_costo_gasto_partida (partida_id),
    CONSTRAINT fk_costo_gasto_obra FOREIGN KEY (obra_id) REFERENCES obras(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_costo_gasto_partida FOREIGN KEY (partida_id) REFERENCES costo_partidas(id) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT fk_costo_gasto_usuario FOREIGN KEY (creado_por) REFERENCES usuarios(id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS costo_historial (
    id INT AUTO_INCREMENT PRIMARY KEY,
    obra_id INT NOT NULL,
    entidad ENUM('presupuesto','partida','gasto') NOT NULL,
    entidad_id INT NULL,
    accion ENUM('crear','editar','borrar','importar') NOT NULL,
    resumen VARCHAR(500) NOT NULL,
    detalle TEXT NULL COMMENT 'JSON: antes → después de lo que cambió',
    usuario_id INT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_costo_hist_obra (obra_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Catálogo primero y luego el rol (FK permisos_rol_v2.permiso_clave → permisos_catalogo.clave).
INSERT IGNORE INTO permisos_catalogo (clave, modulo, nombre, descripcion, orden) VALUES
    ('costos.gestionar', 'Sistema', '$ Costos de obra',
     'Presupuestos y costos: ver, agregar, modificar y borrar el presupuesto por partidas, los gastos con foto de factura y el resumen de cada obra', 11);

INSERT IGNORE INTO permisos_rol_v2 (rol_id, permiso_clave) VALUES (1, 'costos.gestionar');
