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
