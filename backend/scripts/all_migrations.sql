-- =============================================
-- Migración 017: Inventario Base
-- Tablas: categorias_inventario, bodegas, items_inventario, ubicaciones_stock, descuentos_obra
-- =============================================

CREATE TABLE IF NOT EXISTS categorias_inventario (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL UNIQUE,
    orden INT NOT NULL DEFAULT 0,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS bodegas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(255) NOT NULL UNIQUE,
    direccion VARCHAR(255) DEFAULT NULL,
    responsable_id INT DEFAULT NULL,
    activa BOOLEAN NOT NULL DEFAULT TRUE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_bodegas_responsable FOREIGN KEY (responsable_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_bodegas_responsable ON bodegas(responsable_id);

CREATE TABLE IF NOT EXISTS items_inventario (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nro_item INT NOT NULL UNIQUE,
    categoria_id INT NOT NULL,
    descripcion VARCHAR(255) NOT NULL,
    m2 DECIMAL(10,4) DEFAULT NULL,
    valor_compra DECIMAL(12,2) NOT NULL DEFAULT 0,
    valor_arriendo DECIMAL(12,2) NOT NULL DEFAULT 0,
    unidad VARCHAR(20) NOT NULL DEFAULT 'U',
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_items_categoria FOREIGN KEY (categoria_id) REFERENCES categorias_inventario(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_items_categoria ON items_inventario(categoria_id);

CREATE TABLE IF NOT EXISTS ubicaciones_stock (
    id INT AUTO_INCREMENT PRIMARY KEY,
    item_id INT NOT NULL,
    obra_id INT DEFAULT NULL,
    bodega_id INT DEFAULT NULL,
    cantidad INT NOT NULL DEFAULT 0,
    valor_arriendo_override DECIMAL(12,2) DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_ub_item FOREIGN KEY (item_id) REFERENCES items_inventario(id) ON DELETE CASCADE,
    CONSTRAINT fk_ub_obra FOREIGN KEY (obra_id) REFERENCES obras(id) ON DELETE CASCADE,
    CONSTRAINT fk_ub_bodega FOREIGN KEY (bodega_id) REFERENCES bodegas(id) ON DELETE CASCADE,
    UNIQUE KEY uk_item_ubicacion (item_id, obra_id, bodega_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_ub_obra ON ubicaciones_stock(obra_id);
CREATE INDEX idx_ub_bodega ON ubicaciones_stock(bodega_id);
CREATE INDEX idx_ub_item ON ubicaciones_stock(item_id);

CREATE TABLE IF NOT EXISTS descuentos_obra (
    id INT AUTO_INCREMENT PRIMARY KEY,
    obra_id INT NOT NULL UNIQUE,
    porcentaje DECIMAL(5,2) NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_desc_obra FOREIGN KEY (obra_id) REFERENCES obras(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed categorías iniciales
INSERT IGNORE INTO categorias_inventario (nombre, orden) VALUES
('ANDAMIOS', 1),
('ALZAPRIMAS', 2),
('MOLDAJES', 3),
('MAQUINARIA', 4);
-- =============================================
-- Migración 018: Transferencias de Inventario
-- =============================================

CREATE TABLE IF NOT EXISTS transferencias (
    id INT AUTO_INCREMENT PRIMARY KEY,
    codigo VARCHAR(20) NOT NULL UNIQUE,
    estado ENUM('pendiente','aprobada','en_transito','recibida','rechazada','cancelada') NOT NULL DEFAULT 'pendiente',
    origen_obra_id INT DEFAULT NULL,
    origen_bodega_id INT DEFAULT NULL,
    destino_obra_id INT DEFAULT NULL,
    destino_bodega_id INT DEFAULT NULL,
    solicitante_id INT NOT NULL,
    aprobador_id INT DEFAULT NULL,
    transportista_id INT DEFAULT NULL,
    receptor_id INT DEFAULT NULL,
    fecha_solicitud DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_aprobacion DATETIME DEFAULT NULL,
    fecha_despacho DATETIME DEFAULT NULL,
    fecha_recepcion DATETIME DEFAULT NULL,
    requiere_pionetas BOOLEAN NOT NULL DEFAULT FALSE,
    cantidad_pionetas INT DEFAULT NULL,
    observaciones TEXT DEFAULT NULL,
    observaciones_rechazo TEXT DEFAULT NULL,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_trf_origen_obra FOREIGN KEY (origen_obra_id) REFERENCES obras(id) ON DELETE SET NULL,
    CONSTRAINT fk_trf_origen_bodega FOREIGN KEY (origen_bodega_id) REFERENCES bodegas(id) ON DELETE SET NULL,
    CONSTRAINT fk_trf_destino_obra FOREIGN KEY (destino_obra_id) REFERENCES obras(id) ON DELETE SET NULL,
    CONSTRAINT fk_trf_destino_bodega FOREIGN KEY (destino_bodega_id) REFERENCES bodegas(id) ON DELETE SET NULL,
    CONSTRAINT fk_trf_solicitante FOREIGN KEY (solicitante_id) REFERENCES usuarios(id),
    CONSTRAINT fk_trf_aprobador FOREIGN KEY (aprobador_id) REFERENCES usuarios(id),
    CONSTRAINT fk_trf_transportista FOREIGN KEY (transportista_id) REFERENCES usuarios(id),
    CONSTRAINT fk_trf_receptor FOREIGN KEY (receptor_id) REFERENCES usuarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_trf_estado ON transferencias(estado);
CREATE INDEX idx_trf_solicitante ON transferencias(solicitante_id);
CREATE INDEX idx_trf_fecha ON transferencias(fecha_solicitud);

CREATE TABLE IF NOT EXISTS transferencia_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    transferencia_id INT NOT NULL,
    item_id INT NOT NULL,
    cantidad_solicitada INT NOT NULL,
    cantidad_enviada INT DEFAULT NULL,
    cantidad_recibida INT DEFAULT NULL,
    observacion TEXT DEFAULT NULL,
    CONSTRAINT fk_trfi_transferencia FOREIGN KEY (transferencia_id) REFERENCES transferencias(id) ON DELETE CASCADE,
    CONSTRAINT fk_trfi_item FOREIGN KEY (item_id) REFERENCES items_inventario(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_trfi_transferencia ON transferencia_items(transferencia_id);
-- =============================================
-- Migración 019: Facturas de Inventario
-- =============================================

CREATE TABLE IF NOT EXISTS facturas_inventario (
    id INT AUTO_INCREMENT PRIMARY KEY,
    numero_factura VARCHAR(50) NOT NULL,
    proveedor VARCHAR(255) NOT NULL,
    fecha_factura DATE NOT NULL,
    monto_neto DECIMAL(14,2) NOT NULL,
    observaciones TEXT DEFAULT NULL,
    registrado_por INT NOT NULL,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_fact_registrado FOREIGN KEY (registrado_por) REFERENCES usuarios(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_fact_fecha ON facturas_inventario(fecha_factura);

CREATE TABLE IF NOT EXISTS factura_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    factura_id INT NOT NULL,
    item_id INT NOT NULL,
    obra_id INT DEFAULT NULL,
    bodega_id INT DEFAULT NULL,
    cantidad INT NOT NULL,
    precio_unitario DECIMAL(12,2) NOT NULL,
    CONSTRAINT fk_fi_factura FOREIGN KEY (factura_id) REFERENCES facturas_inventario(id) ON DELETE CASCADE,
    CONSTRAINT fk_fi_item FOREIGN KEY (item_id) REFERENCES items_inventario(id) ON DELETE RESTRICT,
    CONSTRAINT fk_fi_obra FOREIGN KEY (obra_id) REFERENCES obras(id) ON DELETE SET NULL,
    CONSTRAINT fk_fi_bodega FOREIGN KEY (bodega_id) REFERENCES bodegas(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_fi_factura ON factura_items(factura_id);
-- =============================================
-- Migración 020: Registro de Bombas de Hormigón
-- =============================================

CREATE TABLE IF NOT EXISTS registro_bombas_hormigon (
    id INT AUTO_INCREMENT PRIMARY KEY,
    obra_id INT NOT NULL,
    fecha DATE NOT NULL,
    tipo_bomba VARCHAR(100) NOT NULL,
    es_externa BOOLEAN NOT NULL DEFAULT FALSE,
    proveedor VARCHAR(255) DEFAULT NULL,
    costo DECIMAL(12,2) DEFAULT NULL,
    observaciones TEXT DEFAULT NULL,
    registrado_por INT NOT NULL,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_rb_obra FOREIGN KEY (obra_id) REFERENCES obras(id) ON DELETE RESTRICT,
    CONSTRAINT fk_rb_registrado FOREIGN KEY (registrado_por) REFERENCES usuarios(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_rb_obra_fecha ON registro_bombas_hormigon(obra_id, fecha);
-- =============================================
-- Migración 021: Discrepancias de Inventario
-- =============================================

CREATE TABLE IF NOT EXISTS discrepancias_inventario (
    id INT AUTO_INCREMENT PRIMARY KEY,
    item_id INT NOT NULL,
    obra_id INT DEFAULT NULL,
    bodega_id INT DEFAULT NULL,
    cantidad_sistema INT NOT NULL,
    cantidad_reportada INT NOT NULL,
    diferencia INT GENERATED ALWAYS AS (cantidad_reportada - cantidad_sistema) STORED,
    reportado_por INT NOT NULL,
    estado ENUM('pendiente','resuelta','descartada') NOT NULL DEFAULT 'pendiente',
    resolucion TEXT DEFAULT NULL,
    resuelto_por INT DEFAULT NULL,
    fecha_resolucion DATETIME DEFAULT NULL,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_disc_item FOREIGN KEY (item_id) REFERENCES items_inventario(id) ON DELETE RESTRICT,
    CONSTRAINT fk_disc_obra FOREIGN KEY (obra_id) REFERENCES obras(id) ON DELETE SET NULL,
    CONSTRAINT fk_disc_bodega FOREIGN KEY (bodega_id) REFERENCES bodegas(id) ON DELETE SET NULL,
    CONSTRAINT fk_disc_reportado FOREIGN KEY (reportado_por) REFERENCES usuarios(id) ON DELETE RESTRICT,
    CONSTRAINT fk_disc_resuelto FOREIGN KEY (resuelto_por) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_disc_estado ON discrepancias_inventario(estado);
CREATE INDEX idx_disc_item ON discrepancias_inventario(item_id);
-- =============================================
-- Migración 022: Permisos de Inventario (seed)
-- Inserta permisos para el rol Super Administrador (rol_id = 1)
-- =============================================

-- Módulo inventario
INSERT IGNORE INTO permisos_rol (rol_id, modulo, puede_ver, puede_crear, puede_editar, puede_eliminar)
VALUES (1, 'inventario', TRUE, TRUE, TRUE, TRUE);

-- Sub-permisos se modelan con permisos atómicos
-- El sistema usa permisos atómicos en formato 'modulo.accion' almacenados en el JWT
-- Los permisos granulares de inventario se derivan de permisos_rol.modulo = 'inventario'
