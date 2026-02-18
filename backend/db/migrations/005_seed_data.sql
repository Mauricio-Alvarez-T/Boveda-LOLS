-- =============================================
-- SGDL - Migración 005: Datos de Prueba (Seed)
-- =============================================

-- 1. Permisos para el Rol 1 (Super Administrador)
INSERT INTO permisos_rol (rol_id, modulo, puede_ver, puede_crear, puede_editar, puede_eliminar) VALUES 
(1, 'trabajadores', 1, 1, 1, 1),
(1, 'documentos', 1, 1, 1, 1),
(1, 'asistencia', 1, 1, 1, 1),
(1, 'fiscalizacion', 1, 1, 1, 1),
(1, 'empresas', 1, 1, 1, 1),
(1, 'obras', 1, 1, 1, 1),
(1, 'cargos', 1, 1, 1, 1),
(1, 'usuarios', 1, 1, 1, 1);

-- 2. Una Empresa de prueba
INSERT INTO empresas (rut, razon_social, direccion, contacto_nombre, contacto_email) VALUES 
('76.123.456-7', 'Constructora Bóveda SpA', 'Alameda 123, Santiago', 'Mauricio Alvarez', 'malvarez@boveda.cl');

-- 3. Una Obra de prueba
INSERT INTO obras (empresa_id, nombre, direccion, activa) VALUES 
(1, 'Edificio Los Olmos', 'Av. Providencia 456, Providencia', 1);

-- 4. Un Cargo de prueba
INSERT INTO cargos (nombre, descripcion) VALUES 
('Jornal', 'Trabajador general de obra'),
('Capataz', 'Supervisor de cuadrilla'),
('Prevencionista', 'Seguridad y Salud Ocupacional');

-- 5. Usuario Administrador de prueba
-- Credenciales:
-- Email: admin@boveda.cl
-- Password: admin
INSERT INTO usuarios (email, password_hash, nombre, rol_id, activo) VALUES 
('admin@boveda.cl', '$2a$10$vI8tmv90T4qR8AJSvB0mreN1jG6pXW/N0Jb.o11qB6WwQG8oR5l8V', 'Administrador Sistema', 1, 1);

-- 6. Unos tipos de documentos básicos
INSERT INTO tipos_documento (nombre, descripcion, requiere_vencimiento) VALUES 
('Contrato de Trabajo', 'Documento legal de contratación', 0),
('EPP - Entrega', 'Registro de entrega de elementos de protección', 1),
('Inducción de Seguridad', 'Registro de charla ODI', 1),
('Certificado de Antecedentes', 'Certificado oficial vigente', 1);

-- 7. Unos tipos de ausencia básica
INSERT INTO tipos_ausencia (nombre, es_justificada) VALUES 
('Falta Injustificada', 0),
('Permiso con Goce', 1),
('Licencia Médica', 1),
('Vacaciones', 1);
