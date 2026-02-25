-- =============================================
-- Bóveda LOLS - Schema de Producción
-- Generado: 2026-02-25T17:28:05.137Z
-- =============================================

SET FOREIGN_KEY_CHECKS = 0;
SET NAMES utf8mb4;

-- Table: asistencias
DROP TABLE IF EXISTS `asistencias`;
CREATE TABLE `asistencias` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `trabajador_id` int(11) NOT NULL,
  `obra_id` int(11) NOT NULL,
  `fecha` date NOT NULL,
  `estado_id` int(11) NOT NULL,
  `tipo_ausencia_id` int(11) DEFAULT NULL,
  `observacion` varchar(500) DEFAULT NULL,
  `registrado_por` int(11) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `hora_entrada` time DEFAULT NULL,
  `hora_salida` time DEFAULT NULL,
  `hora_colacion_inicio` time DEFAULT NULL,
  `hora_colacion_fin` time DEFAULT NULL,
  `horas_extra` decimal(4,2) NOT NULL DEFAULT 0.00,
  `es_sabado` tinyint(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_asistencia_diaria` (`trabajador_id`,`obra_id`,`fecha`),
  KEY `fk_asistencias_tipo_ausencia` (`tipo_ausencia_id`),
  KEY `fk_asistencias_registrado_por` (`registrado_por`),
  KEY `idx_asistencias_fecha` (`fecha`),
  KEY `idx_asistencias_trabajador` (`trabajador_id`),
  KEY `idx_asistencias_obra` (`obra_id`),
  KEY `idx_asistencias_estado_id` (`estado_id`),
  CONSTRAINT `fk_asistencias_estado` FOREIGN KEY (`estado_id`) REFERENCES `estados_asistencia` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `fk_asistencias_obra` FOREIGN KEY (`obra_id`) REFERENCES `obras` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `fk_asistencias_registrado_por` FOREIGN KEY (`registrado_por`) REFERENCES `usuarios` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `fk_asistencias_tipo_ausencia` FOREIGN KEY (`tipo_ausencia_id`) REFERENCES `tipos_ausencia` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_asistencias_trabajador` FOREIGN KEY (`trabajador_id`) REFERENCES `trabajadores` (`id`) ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=9896 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: cargos
DROP TABLE IF EXISTS `cargos`;
CREATE TABLE `cargos` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `nombre` varchar(100) NOT NULL,
  `activo` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `nombre` (`nombre`)
) ENGINE=InnoDB AUTO_INCREMENT=17 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: configuracion_horarios
DROP TABLE IF EXISTS `configuracion_horarios`;
CREATE TABLE `configuracion_horarios` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `obra_id` int(11) NOT NULL,
  `dia_semana` enum('lun','mar','mie','jue','vie','sab') NOT NULL,
  `hora_entrada` time NOT NULL DEFAULT '08:00:00',
  `hora_salida` time NOT NULL DEFAULT '18:00:00',
  `hora_colacion_inicio` time NOT NULL DEFAULT '13:00:00',
  `hora_colacion_fin` time NOT NULL DEFAULT '14:00:00',
  `activo` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_horario_obra_dia` (`obra_id`,`dia_semana`),
  KEY `idx_config_horarios_obra` (`obra_id`),
  CONSTRAINT `fk_config_horarios_obra` FOREIGN KEY (`obra_id`) REFERENCES `obras` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=43 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: documentos
DROP TABLE IF EXISTS `documentos`;
CREATE TABLE `documentos` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `trabajador_id` int(11) NOT NULL,
  `tipo_documento_id` int(11) NOT NULL,
  `nombre_archivo` varchar(255) NOT NULL COMMENT 'Formato: RUT_trabajador-RUT_empresa-fecha.pdf',
  `ruta_archivo` varchar(500) NOT NULL,
  `rut_empresa_al_subir` varchar(12) NOT NULL COMMENT 'Snapshot del RUT empresa al momento de subir',
  `fecha_subida` date NOT NULL DEFAULT curdate(),
  `fecha_vencimiento` date DEFAULT NULL,
  `subido_por` int(11) DEFAULT NULL,
  `activo` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `deleted_at` datetime DEFAULT NULL COMMENT 'Fecha de eliminación lógica',
  PRIMARY KEY (`id`),
  KEY `idx_documentos_trabajador` (`trabajador_id`),
  KEY `idx_documentos_tipo` (`tipo_documento_id`),
  KEY `idx_documentos_vencimiento` (`fecha_vencimiento`),
  KEY `fk_documentos_subido_por` (`subido_por`),
  CONSTRAINT `fk_documentos_subido_por` FOREIGN KEY (`subido_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_documentos_tipo` FOREIGN KEY (`tipo_documento_id`) REFERENCES `tipos_documento` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `fk_documentos_trabajador` FOREIGN KEY (`trabajador_id`) REFERENCES `trabajadores` (`id`) ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=38 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: empresas
DROP TABLE IF EXISTS `empresas`;
CREATE TABLE `empresas` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `rut` varchar(12) NOT NULL,
  `razon_social` varchar(255) NOT NULL,
  `direccion` varchar(255) DEFAULT NULL,
  `telefono` varchar(20) DEFAULT NULL,
  `activo` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `rut` (`rut`),
  KEY `idx_empresas_rut` (`rut`)
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: estados_asistencia
DROP TABLE IF EXISTS `estados_asistencia`;
CREATE TABLE `estados_asistencia` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `nombre` varchar(50) NOT NULL,
  `codigo` varchar(10) NOT NULL,
  `color` varchar(7) NOT NULL DEFAULT '#34C759',
  `es_presente` tinyint(1) NOT NULL DEFAULT 0,
  `activo` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `nombre` (`nombre`),
  UNIQUE KEY `codigo` (`codigo`),
  KEY `idx_estados_asistencia_activo` (`activo`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: log_asistencia
DROP TABLE IF EXISTS `log_asistencia`;
CREATE TABLE `log_asistencia` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `asistencia_id` int(11) NOT NULL,
  `campo_modificado` varchar(100) NOT NULL,
  `valor_anterior` varchar(255) DEFAULT NULL,
  `valor_nuevo` varchar(255) DEFAULT NULL,
  `modificado_por` int(11) NOT NULL,
  `fecha_modificacion` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `fk_log_modificado_por` (`modificado_por`),
  KEY `idx_log_asistencia_id` (`asistencia_id`),
  CONSTRAINT `fk_log_asistencia` FOREIGN KEY (`asistencia_id`) REFERENCES `asistencias` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_log_modificado_por` FOREIGN KEY (`modificado_por`) REFERENCES `usuarios` (`id`) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: logs_actividad
DROP TABLE IF EXISTS `logs_actividad`;
CREATE TABLE `logs_actividad` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `usuario_id` int(11) DEFAULT NULL,
  `modulo` varchar(50) NOT NULL,
  `accion` enum('CREATE','UPDATE','DELETE','LOGIN','UPLOAD','EMAIL') NOT NULL,
  `item_id` varchar(50) DEFAULT NULL,
  `detalle` text DEFAULT NULL,
  `ip` varchar(45) DEFAULT NULL,
  `user_agent` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_logs_created_at` (`created_at`),
  KEY `idx_logs_modulo` (`modulo`),
  KEY `idx_logs_usuario` (`usuario_id`),
  CONSTRAINT `logs_actividad_ibfk_1` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=241 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Table: obras
DROP TABLE IF EXISTS `obras`;
CREATE TABLE `obras` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `nombre` varchar(255) NOT NULL,
  `direccion` varchar(255) DEFAULT NULL,
  `empresa_id` int(11) DEFAULT NULL,
  `activa` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_obras_empresa` (`empresa_id`),
  CONSTRAINT `fk_obras_empresa` FOREIGN KEY (`empresa_id`) REFERENCES `empresas` (`id`) ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: permisos_rol
DROP TABLE IF EXISTS `permisos_rol`;
CREATE TABLE `permisos_rol` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `rol_id` int(11) NOT NULL,
  `modulo` varchar(100) NOT NULL COMMENT 'Ej: trabajadores, asistencia, documentos, obras, empresas, etc.',
  `puede_ver` tinyint(1) NOT NULL DEFAULT 0,
  `puede_crear` tinyint(1) NOT NULL DEFAULT 0,
  `puede_editar` tinyint(1) NOT NULL DEFAULT 0,
  `puede_eliminar` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_rol_modulo` (`rol_id`,`modulo`),
  KEY `idx_permisos_rol` (`rol_id`),
  CONSTRAINT `fk_permisos_rol` FOREIGN KEY (`rol_id`) REFERENCES `roles` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=30 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: plantillas_correo
DROP TABLE IF EXISTS `plantillas_correo`;
CREATE TABLE `plantillas_correo` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `usuario_id` int(11) NOT NULL,
  `nombre` varchar(100) NOT NULL COMMENT 'Ej: Formal, Simple, Inspección DT',
  `asunto` varchar(255) NOT NULL,
  `cuerpo` text NOT NULL,
  `es_predeterminada` tinyint(1) NOT NULL DEFAULT 0,
  `activa` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_plantillas_usuario` (`usuario_id`),
  CONSTRAINT `fk_plantillas_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: roles
DROP TABLE IF EXISTS `roles`;
CREATE TABLE `roles` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `nombre` varchar(100) NOT NULL,
  `descripcion` varchar(255) DEFAULT NULL,
  `activo` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `nombre` (`nombre`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: tipos_ausencia
DROP TABLE IF EXISTS `tipos_ausencia`;
CREATE TABLE `tipos_ausencia` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `nombre` varchar(100) NOT NULL,
  `activo` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `nombre` (`nombre`)
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: tipos_documento
DROP TABLE IF EXISTS `tipos_documento`;
CREATE TABLE `tipos_documento` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `nombre` varchar(150) NOT NULL,
  `dias_vigencia` int(11) DEFAULT NULL COMMENT 'NULL = sin vencimiento',
  `obligatorio` tinyint(1) NOT NULL DEFAULT 0,
  `activo` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `nombre` (`nombre`)
) ENGINE=InnoDB AUTO_INCREMENT=16 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: trabajadores
DROP TABLE IF EXISTS `trabajadores`;
CREATE TABLE `trabajadores` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `rut` varchar(12) NOT NULL,
  `nombres` varchar(100) NOT NULL,
  `apellido_paterno` varchar(100) NOT NULL,
  `apellido_materno` varchar(100) DEFAULT NULL,
  `empresa_id` int(11) DEFAULT NULL,
  `obra_id` int(11) DEFAULT NULL,
  `cargo_id` int(11) DEFAULT NULL,
  `categoria_reporte` enum('obra','operaciones','rotativo') DEFAULT 'obra',
  `email` varchar(255) DEFAULT NULL,
  `telefono` varchar(20) DEFAULT NULL,
  `carnet_frente_url` varchar(500) DEFAULT NULL,
  `carnet_dorso_url` varchar(500) DEFAULT NULL,
  `fecha_ingreso` date DEFAULT NULL,
  `activo` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `rut` (`rut`),
  KEY `fk_trabajadores_cargo` (`cargo_id`),
  KEY `idx_trabajadores_rut` (`rut`),
  KEY `idx_trabajadores_empresa` (`empresa_id`),
  KEY `idx_trabajadores_obra` (`obra_id`),
  CONSTRAINT `fk_trabajadores_cargo` FOREIGN KEY (`cargo_id`) REFERENCES `cargos` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_trabajadores_empresa` FOREIGN KEY (`empresa_id`) REFERENCES `empresas` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_trabajadores_obra` FOREIGN KEY (`obra_id`) REFERENCES `obras` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=210 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: usuarios
DROP TABLE IF EXISTS `usuarios`;
CREATE TABLE `usuarios` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `email` varchar(255) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `nombre` varchar(200) NOT NULL,
  `rol_id` int(11) NOT NULL,
  `obra_id` int(11) DEFAULT NULL COMMENT 'Obra asignada actualmente (NULL = oficina central)',
  `email_corporativo` varchar(255) DEFAULT NULL COMMENT 'Email desde el cual se envían fiscalizaciones',
  `activo` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `email_password_enc` text DEFAULT NULL COMMENT 'Contraseña de correo corporativo encriptada con AES',
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`),
  KEY `idx_usuarios_rol` (`rol_id`),
  KEY `idx_usuarios_obra` (`obra_id`),
  CONSTRAINT `fk_usuarios_obra` FOREIGN KEY (`obra_id`) REFERENCES `obras` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_usuarios_rol` FOREIGN KEY (`rol_id`) REFERENCES `roles` (`id`) ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- Datos Esenciales (Seeds)
-- =============================================

-- Data: roles
INSERT INTO `roles` (`id`, `nombre`, `descripcion`, `activo`, `created_at`, `updated_at`) VALUES (1, 'Super Administrador', 'Acceso completo al sistema. Puede crear roles y gestionar permisos.', 1, '2026-02-17 19:39:53', '2026-02-17 19:39:53');
INSERT INTO `roles` (`id`, `nombre`, `descripcion`, `activo`, `created_at`, `updated_at`) VALUES (2, 'Test Apple Role', 'Testing toast appearance with Apple design.', 1, '2026-02-19 11:10:36', '2026-02-19 11:10:36');
INSERT INTO `roles` (`id`, `nombre`, `descripcion`, `activo`, `created_at`, `updated_at`) VALUES (3, 'Toast Verification', '', 1, '2026-02-19 11:11:26', '2026-02-19 11:11:26');
INSERT INTO `roles` (`id`, `nombre`, `descripcion`, `activo`, `created_at`, `updated_at`) VALUES (4, 'RRHH', 'Recursos Humanos', 1, '2026-02-24 12:53:12', '2026-02-24 12:53:12');
INSERT INTO `roles` (`id`, `nombre`, `descripcion`, `activo`, `created_at`, `updated_at`) VALUES (5, 'Prevención de Riesgos', 'Personal de area de seguridad', 1, '2026-02-24 15:58:33', '2026-02-24 15:58:33');

-- Data: permisos_rol
INSERT INTO `permisos_rol` (`id`, `rol_id`, `modulo`, `puede_ver`, `puede_crear`, `puede_editar`, `puede_eliminar`, `created_at`, `updated_at`) VALUES (1, 1, 'trabajadores', 1, 1, 1, 1, '2026-02-17 19:40:48', '2026-02-17 19:40:48');
INSERT INTO `permisos_rol` (`id`, `rol_id`, `modulo`, `puede_ver`, `puede_crear`, `puede_editar`, `puede_eliminar`, `created_at`, `updated_at`) VALUES (2, 1, 'documentos', 1, 1, 1, 1, '2026-02-17 19:40:48', '2026-02-17 19:40:48');
INSERT INTO `permisos_rol` (`id`, `rol_id`, `modulo`, `puede_ver`, `puede_crear`, `puede_editar`, `puede_eliminar`, `created_at`, `updated_at`) VALUES (3, 1, 'asistencia', 1, 1, 1, 1, '2026-02-17 19:40:48', '2026-02-17 19:40:48');
INSERT INTO `permisos_rol` (`id`, `rol_id`, `modulo`, `puede_ver`, `puede_crear`, `puede_editar`, `puede_eliminar`, `created_at`, `updated_at`) VALUES (4, 1, 'fiscalizacion', 1, 1, 1, 1, '2026-02-17 19:40:48', '2026-02-17 19:40:48');
INSERT INTO `permisos_rol` (`id`, `rol_id`, `modulo`, `puede_ver`, `puede_crear`, `puede_editar`, `puede_eliminar`, `created_at`, `updated_at`) VALUES (5, 1, 'empresas', 1, 1, 1, 1, '2026-02-17 19:40:48', '2026-02-17 19:40:48');
INSERT INTO `permisos_rol` (`id`, `rol_id`, `modulo`, `puede_ver`, `puede_crear`, `puede_editar`, `puede_eliminar`, `created_at`, `updated_at`) VALUES (6, 1, 'obras', 1, 1, 1, 1, '2026-02-17 19:40:48', '2026-02-17 19:40:48');
INSERT INTO `permisos_rol` (`id`, `rol_id`, `modulo`, `puede_ver`, `puede_crear`, `puede_editar`, `puede_eliminar`, `created_at`, `updated_at`) VALUES (7, 1, 'cargos', 1, 1, 1, 1, '2026-02-17 19:40:48', '2026-02-17 19:40:48');
INSERT INTO `permisos_rol` (`id`, `rol_id`, `modulo`, `puede_ver`, `puede_crear`, `puede_editar`, `puede_eliminar`, `created_at`, `updated_at`) VALUES (8, 1, 'usuarios', 1, 1, 1, 1, '2026-02-17 19:40:48', '2026-02-17 19:40:48');
INSERT INTO `permisos_rol` (`id`, `rol_id`, `modulo`, `puede_ver`, `puede_crear`, `puede_editar`, `puede_eliminar`, `created_at`, `updated_at`) VALUES (9, 1, 'dashboard', 1, 1, 1, 1, '2026-02-17 20:37:08', '2026-02-17 20:37:08');
INSERT INTO `permisos_rol` (`id`, `rol_id`, `modulo`, `puede_ver`, `puede_crear`, `puede_editar`, `puede_eliminar`, `created_at`, `updated_at`) VALUES (14, 4, 'trabajadores', 1, 1, 1, 1, '2026-02-24 12:53:12', '2026-02-24 12:53:12');
INSERT INTO `permisos_rol` (`id`, `rol_id`, `modulo`, `puede_ver`, `puede_crear`, `puede_editar`, `puede_eliminar`, `created_at`, `updated_at`) VALUES (15, 4, 'asistencia', 1, 1, 1, 0, '2026-02-24 12:53:12', '2026-02-24 12:53:12');
INSERT INTO `permisos_rol` (`id`, `rol_id`, `modulo`, `puede_ver`, `puede_crear`, `puede_editar`, `puede_eliminar`, `created_at`, `updated_at`) VALUES (16, 4, 'documentos', 1, 1, 1, 1, '2026-02-24 12:53:12', '2026-02-24 12:53:12');
INSERT INTO `permisos_rol` (`id`, `rol_id`, `modulo`, `puede_ver`, `puede_crear`, `puede_editar`, `puede_eliminar`, `created_at`, `updated_at`) VALUES (17, 4, 'fiscalizacion', 1, 0, 0, 0, '2026-02-24 12:53:12', '2026-02-24 12:53:12');
INSERT INTO `permisos_rol` (`id`, `rol_id`, `modulo`, `puede_ver`, `puede_crear`, `puede_editar`, `puede_eliminar`, `created_at`, `updated_at`) VALUES (18, 4, 'usuarios', 1, 0, 0, 0, '2026-02-24 12:53:12', '2026-02-24 12:53:12');
INSERT INTO `permisos_rol` (`id`, `rol_id`, `modulo`, `puede_ver`, `puede_crear`, `puede_editar`, `puede_eliminar`, `created_at`, `updated_at`) VALUES (19, 4, 'empresas', 1, 1, 1, 1, '2026-02-24 12:53:12', '2026-02-24 12:53:12');
INSERT INTO `permisos_rol` (`id`, `rol_id`, `modulo`, `puede_ver`, `puede_crear`, `puede_editar`, `puede_eliminar`, `created_at`, `updated_at`) VALUES (20, 4, 'obras', 1, 1, 1, 1, '2026-02-24 12:53:12', '2026-02-24 12:53:12');
INSERT INTO `permisos_rol` (`id`, `rol_id`, `modulo`, `puede_ver`, `puede_crear`, `puede_editar`, `puede_eliminar`, `created_at`, `updated_at`) VALUES (21, 4, 'cargos', 1, 1, 1, 1, '2026-02-24 12:53:12', '2026-02-24 12:53:12');
INSERT INTO `permisos_rol` (`id`, `rol_id`, `modulo`, `puede_ver`, `puede_crear`, `puede_editar`, `puede_eliminar`, `created_at`, `updated_at`) VALUES (22, 5, 'trabajadores', 1, 1, 1, 1, '2026-02-24 15:58:33', '2026-02-24 15:58:33');
INSERT INTO `permisos_rol` (`id`, `rol_id`, `modulo`, `puede_ver`, `puede_crear`, `puede_editar`, `puede_eliminar`, `created_at`, `updated_at`) VALUES (23, 5, 'asistencia', 1, 1, 1, 1, '2026-02-24 15:58:33', '2026-02-24 15:58:33');
INSERT INTO `permisos_rol` (`id`, `rol_id`, `modulo`, `puede_ver`, `puede_crear`, `puede_editar`, `puede_eliminar`, `created_at`, `updated_at`) VALUES (24, 5, 'documentos', 1, 1, 1, 1, '2026-02-24 15:58:33', '2026-02-24 15:58:33');
INSERT INTO `permisos_rol` (`id`, `rol_id`, `modulo`, `puede_ver`, `puede_crear`, `puede_editar`, `puede_eliminar`, `created_at`, `updated_at`) VALUES (25, 5, 'fiscalizacion', 1, 1, 1, 1, '2026-02-24 15:58:33', '2026-02-24 15:58:33');
INSERT INTO `permisos_rol` (`id`, `rol_id`, `modulo`, `puede_ver`, `puede_crear`, `puede_editar`, `puede_eliminar`, `created_at`, `updated_at`) VALUES (26, 5, 'usuarios', 1, 0, 0, 0, '2026-02-24 15:58:33', '2026-02-24 15:58:33');
INSERT INTO `permisos_rol` (`id`, `rol_id`, `modulo`, `puede_ver`, `puede_crear`, `puede_editar`, `puede_eliminar`, `created_at`, `updated_at`) VALUES (27, 5, 'empresas', 1, 0, 0, 0, '2026-02-24 15:58:33', '2026-02-24 15:58:33');
INSERT INTO `permisos_rol` (`id`, `rol_id`, `modulo`, `puede_ver`, `puede_crear`, `puede_editar`, `puede_eliminar`, `created_at`, `updated_at`) VALUES (28, 5, 'obras', 1, 0, 0, 0, '2026-02-24 15:58:33', '2026-02-24 15:58:33');
INSERT INTO `permisos_rol` (`id`, `rol_id`, `modulo`, `puede_ver`, `puede_crear`, `puede_editar`, `puede_eliminar`, `created_at`, `updated_at`) VALUES (29, 5, 'cargos', 1, 1, 1, 1, '2026-02-24 15:58:33', '2026-02-24 15:58:33');

-- Data: estados_asistencia
INSERT INTO `estados_asistencia` (`id`, `nombre`, `codigo`, `color`, `es_presente`, `activo`, `created_at`, `updated_at`) VALUES (1, 'Asiste', 'A', '#34C759', 1, 1, '2026-02-19 20:53:36', '2026-02-25 14:37:41');
INSERT INTO `estados_asistencia` (`id`, `nombre`, `codigo`, `color`, `es_presente`, `activo`, `created_at`, `updated_at`) VALUES (2, 'Falta', 'F', '#FF3B30', 0, 1, '2026-02-19 20:53:36', '2026-02-25 14:37:41');
INSERT INTO `estados_asistencia` (`id`, `nombre`, `codigo`, `color`, `es_presente`, `activo`, `created_at`, `updated_at`) VALUES (3, 'Atraso', 'AT', '#FF9F0A', 1, 1, '2026-02-19 20:53:36', '2026-02-19 20:53:36');
INSERT INTO `estados_asistencia` (`id`, `nombre`, `codigo`, `color`, `es_presente`, `activo`, `created_at`, `updated_at`) VALUES (4, 'Licencia', 'LM', '#5856D6', 0, 1, '2026-02-19 20:53:36', '2026-02-19 20:53:36');
INSERT INTO `estados_asistencia` (`id`, `nombre`, `codigo`, `color`, `es_presente`, `activo`, `created_at`, `updated_at`) VALUES (5, '1/2 Día', '1/2', '#AF52DE', 1, 1, '2026-02-19 20:53:36', '2026-02-19 20:53:36');
INSERT INTO `estados_asistencia` (`id`, `nombre`, `codigo`, `color`, `es_presente`, `activo`, `created_at`, `updated_at`) VALUES (6, 'Vacaciones', 'V', '#007AFF', 0, 1, '2026-02-19 20:53:36', '2026-02-19 20:53:36');
INSERT INTO `estados_asistencia` (`id`, `nombre`, `codigo`, `color`, `es_presente`, `activo`, `created_at`, `updated_at`) VALUES (7, 'Permiso', 'PR', '#64D2FF', 0, 0, '2026-02-19 20:53:36', '2026-02-20 13:17:09');
INSERT INTO `estados_asistencia` (`id`, `nombre`, `codigo`, `color`, `es_presente`, `activo`, `created_at`, `updated_at`) VALUES (8, 'Traslado', 'TO', '#30D158', 1, 1, '2026-02-19 20:53:36', '2026-02-19 20:53:36');

-- Data: tipos_ausencia
INSERT INTO `tipos_ausencia` (`id`, `nombre`, `activo`, `created_at`, `updated_at`) VALUES (1, 'Vacaciones', 1, '2026-02-17 19:40:27', '2026-02-17 19:40:27');
INSERT INTO `tipos_ausencia` (`id`, `nombre`, `activo`, `created_at`, `updated_at`) VALUES (2, 'Licencia Médica', 1, '2026-02-17 19:40:27', '2026-02-17 19:40:27');
INSERT INTO `tipos_ausencia` (`id`, `nombre`, `activo`, `created_at`, `updated_at`) VALUES (3, 'Permiso con Goce de Sueldo', 1, '2026-02-17 19:40:27', '2026-02-17 19:40:27');
INSERT INTO `tipos_ausencia` (`id`, `nombre`, `activo`, `created_at`, `updated_at`) VALUES (4, 'Permiso sin Goce de Sueldo', 1, '2026-02-17 19:40:27', '2026-02-17 19:40:27');
INSERT INTO `tipos_ausencia` (`id`, `nombre`, `activo`, `created_at`, `updated_at`) VALUES (5, 'Día Administrativo', 1, '2026-02-17 19:40:27', '2026-02-17 19:40:27');
INSERT INTO `tipos_ausencia` (`id`, `nombre`, `activo`, `created_at`, `updated_at`) VALUES (6, 'Licencia por Accidente Laboral', 1, '2026-02-17 19:40:27', '2026-02-17 19:40:27');
INSERT INTO `tipos_ausencia` (`id`, `nombre`, `activo`, `created_at`, `updated_at`) VALUES (7, 'Falta Injustificada', 1, '2026-02-17 19:40:27', '2026-02-17 19:40:27');

-- Data: tipos_documento
INSERT INTO `tipos_documento` (`id`, `nombre`, `dias_vigencia`, `obligatorio`, `activo`, `created_at`, `updated_at`) VALUES (1, 'Contrato de Trabajo', NULL, 1, 1, '2026-02-18 12:30:13', '2026-02-18 12:30:13');
INSERT INTO `tipos_documento` (`id`, `nombre`, `dias_vigencia`, `obligatorio`, `activo`, `created_at`, `updated_at`) VALUES (2, 'Anexo de Contrato', NULL, 0, 1, '2026-02-18 12:30:13', '2026-02-18 12:30:13');
INSERT INTO `tipos_documento` (`id`, `nombre`, `dias_vigencia`, `obligatorio`, `activo`, `created_at`, `updated_at`) VALUES (3, 'Cédula de Identidad', 3650, 1, 0, '2026-02-18 12:30:13', '2026-02-18 17:54:06');
INSERT INTO `tipos_documento` (`id`, `nombre`, `dias_vigencia`, `obligatorio`, `activo`, `created_at`, `updated_at`) VALUES (4, 'Certificado de Antecedentes', 60, 0, 1, '2026-02-18 12:30:13', '2026-02-18 18:07:30');
INSERT INTO `tipos_documento` (`id`, `nombre`, `dias_vigencia`, `obligatorio`, `activo`, `created_at`, `updated_at`) VALUES (5, 'Liquidación de Sueldo', NULL, 0, 0, '2026-02-18 12:30:13', '2026-02-18 17:53:42');
INSERT INTO `tipos_documento` (`id`, `nombre`, `dias_vigencia`, `obligatorio`, `activo`, `created_at`, `updated_at`) VALUES (6, 'Finiquito', NULL, 0, 1, '2026-02-18 12:30:13', '2026-02-18 12:30:13');
INSERT INTO `tipos_documento` (`id`, `nombre`, `dias_vigencia`, `obligatorio`, `activo`, `created_at`, `updated_at`) VALUES (7, 'Examen Preocupacional', 365, 0, 0, '2026-02-18 12:30:13', '2026-02-18 17:55:05');
INSERT INTO `tipos_documento` (`id`, `nombre`, `dias_vigencia`, `obligatorio`, `activo`, `created_at`, `updated_at`) VALUES (8, 'Charla ODI', NULL, 1, 0, '2026-02-18 12:30:13', '2026-02-18 17:53:11');
INSERT INTO `tipos_documento` (`id`, `nombre`, `dias_vigencia`, `obligatorio`, `activo`, `created_at`, `updated_at`) VALUES (9, 'Test Doc Type', 30, 0, 0, '2026-02-18 18:04:46', '2026-02-18 18:04:46');
INSERT INTO `tipos_documento` (`id`, `nombre`, `dias_vigencia`, `obligatorio`, `activo`, `created_at`, `updated_at`) VALUES (10, 'Recepción Reglamento Interno', NULL, 1, 1, '2026-02-18 18:12:48', '2026-02-18 18:12:48');
INSERT INTO `tipos_documento` (`id`, `nombre`, `dias_vigencia`, `obligatorio`, `activo`, `created_at`, `updated_at`) VALUES (11, 'Decreto Supremo N° 44: Obligación de informar los riesgos laborales', NULL, 1, 1, '2026-02-18 18:13:17', '2026-02-18 18:13:17');
INSERT INTO `tipos_documento` (`id`, `nombre`, `dias_vigencia`, `obligatorio`, `activo`, `created_at`, `updated_at`) VALUES (12, 'Declaración de recibir el derecho a saber', NULL, 1, 1, '2026-02-18 18:13:36', '2026-02-18 18:13:36');
INSERT INTO `tipos_documento` (`id`, `nombre`, `dias_vigencia`, `obligatorio`, `activo`, `created_at`, `updated_at`) VALUES (13, 'Recepción de implementos de seguridad', NULL, 1, 1, '2026-02-18 18:13:52', '2026-02-18 18:13:52');
INSERT INTO `tipos_documento` (`id`, `nombre`, `dias_vigencia`, `obligatorio`, `activo`, `created_at`, `updated_at`) VALUES (14, 'Procedimientos de trabajo seguro en altura', NULL, 1, 1, '2026-02-18 18:14:09', '2026-02-18 18:14:09');
INSERT INTO `tipos_documento` (`id`, `nombre`, `dias_vigencia`, `obligatorio`, `activo`, `created_at`, `updated_at`) VALUES (15, 'Entrega de EPP', NULL, 0, 1, '2026-02-18 18:14:47', '2026-02-18 18:14:47');

-- Admin user (password: admin)
INSERT INTO usuarios (email, password_hash, nombre, rol_id, activo) VALUES 
('admin@boveda.cl', '$2a$10$vI8tmv90T4qR8AJSvB0mreN1jG6pXW/N0Jb.o11qB6WwQG8oR5l8V', 'Administrador Sistema', 1, 1);

SET FOREIGN_KEY_CHECKS = 1;
