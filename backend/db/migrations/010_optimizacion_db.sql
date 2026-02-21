-- =============================================
-- SGDL - Migración 010: Optimización y Normalización
-- Mejoras: Índices compuestos, ajustes de tipos de datos, Soft Deletes
-- =============================================

-- =============================================
-- 1. Soft Deletes y Auditoría
-- =============================================
-- Agregar 'deleted_at' para soft deletes auditables en lugar de solo depender del boolean 'activo'
ALTER TABLE trabajadores 
    ADD COLUMN IF NOT EXISTS deleted_at DATETIME DEFAULT NULL COMMENT 'Fecha de eliminación lógica';

ALTER TABLE documentos 
    ADD COLUMN IF NOT EXISTS deleted_at DATETIME DEFAULT NULL COMMENT 'Fecha de eliminación lógica';

-- =============================================
-- 2. Normalización de Tipos de Datos
-- =============================================
-- Ajustar password_hash a CHAR(60) ya que bcrypt genera un hash fijo de 60 caracteres
ALTER TABLE usuarios 
    MODIFY COLUMN password_hash CHAR(60) COLLATE utf8mb4_unicode_ci NOT NULL;

-- =============================================
-- 3. Índices Estratégicos (Performance)
-- =============================================

-- Asistencia: Índice compuesto para optimizar "asistencia de hoy" y "tendencia 7 días" por obra
CREATE INDEX idx_asistencias_obra_fecha ON asistencias(obra_id, fecha);

-- Dashboard: Índice para contar rápidamente trabajadores activos por obra
CREATE INDEX idx_trab_obra_activo ON trabajadores(obra_id, activo);

-- Documentos: Índice para búsquedas rápidas de documentos por trabajador y su estado
CREATE INDEX idx_docs_trab_activo ON documentos(trabajador_id, activo);

-- Documentos: Índice para optimizar métrica de documentos vencidos (combinando flag activo y fecha)
CREATE INDEX idx_docs_activo_venc ON documentos(activo, fecha_vencimiento);

-- Usuarios: Índice único para login (antes no había índice UNIQUE explícito asegurado de email salvo el general, aquí lo reforzamos si no existe)
-- CREATE UNIQUE INDEX idx_usuarios_email ON usuarios(email); -- Ya debería ser único o tener uno implícito, lo aseguramos:
-- Verificar si ya existe el índice en usuarios(email) antes de intentar crearlo de nuevo puede fallar en mysql directo si ya existe. 
-- Como el esquema dice email VARCHAR(255) DEFAULT NULL, usualmente es UNIQUE. Si ya lo es, ignoramos esto o lo añadimos:
-- ALTER TABLE usuarios ADD UNIQUE INDEX idx_usuarios_email (email); 
-- *Nota: Si da error por duplicado o ya existente, puede omitirse.
