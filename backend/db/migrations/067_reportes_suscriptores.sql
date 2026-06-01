-- =============================================
-- Migración 067: Suscriptores del Reporte Semanal RRHH (Slice B)
-- =============================================
-- Tabla de destinatarios del reporte automático semanal. El script
-- `scripts/reporte_semanal.js` (cron) lee de aquí los suscriptores activos;
-- si la tabla está vacía cae a la env REPORTE_TO (sin regresión).
--
-- Permiso `sistema.reportes.gestionar`: el catálogo se auto-sincroniza desde
-- `permisos.config.js` al arranque; aquí solo se asigna a Super Admin (rol_id=1),
-- igual que la migración 046. Otros roles se asignan manual en Configuración → Roles.
--
-- Idempotente: CREATE TABLE IF NOT EXISTS + INSERT IGNORE.

CREATE TABLE IF NOT EXISTS reportes_suscriptores (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    nombre VARCHAR(150) NULL,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_reportes_suscriptores_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='Destinatarios del reporte semanal RRHH (Slice B).';

-- Asignar permiso de gestión solo a Super Admin (rol_id=1).
INSERT IGNORE INTO permisos_rol_v2 (rol_id, permiso_clave) VALUES
    (1, 'sistema.reportes.gestionar');
