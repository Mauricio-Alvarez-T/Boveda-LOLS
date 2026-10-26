-- =============================================
-- Migración 137: parámetros de sueldo solo para quien ve Configuración + «Cancelar en tránsito» para Leonardo y Daphne
-- =============================================
-- Marcos 2026-10-26, dos decisiones del dueño:
--   1) «Quítale los permisos de los parámetros de sueldo de acuerdo a su rol»: 'cargos.sueldo.ver' («Ver Parámetros de
--      Sueldo») vino con el rol «Administrador» (mig 126), pero solo se usa en Configuración → Cargos, y Configuración
--      aparece solo con 'usuarios.ver' (Sidebar / menuLateral). Leonardo y quien no ve Configuración lo tenían sin poder
--      usarlo. Sale del ROL; a quien SÍ ve Configuración (permiso propio 'usuarios.ver', mig 128: Paula, Matías,
--      Rodrigo, Luis, Daphne) se le deja como permiso PROPIO, para no quitarle lo que hoy usa.
--   2) «Dale la opción para que los dos puedan anular solicitudes en camino»: 'inventario.transferencias.cancelar_en_transito'
--      como permiso propio de Leonardo López y Daphne Lazcano (ya cancelan pendientes y aprobadas desde la 131).
--
-- Orden: primero los permisos propios (antes de borrarlo del rol, para saber quién lo tenía), luego el rol, luego la
-- versión (re-login). Idempotente: INSERT IGNORE no pisa un permiso propio que ya exista (ni un «deny» puesto a mano);
-- el DELETE no falla si ya no está; ON DUPLICATE KEY UPDATE deja «grant» el de cancelar en tránsito. A cada persona se
-- la busca por su CORREO: si no existe en ese entorno, no se le agrega nada.
-- Re-login: los permisos viajan en el token → roles.version + 1 del rol «Administrador» y, si Leonardo o Daphne tienen
-- otro rol en este entorno, también el de ellos (nunca el rol 1). Las sesiones viejas se cierran cuando el auto-migrate
-- reinicia el backend (versionService guarda las versiones en memoria).

-- 1. Quien ve Configuración (tiene 'usuarios.ver' como permiso propio o por su rol, sin «deny») y está en el rol
--    «Administrador» conserva los parámetros de sueldo como permiso propio.
INSERT IGNORE INTO permisos_usuario_override (usuario_id, permiso_clave, tipo)
SELECT u.id, 'cargos.sueldo.ver', 'grant'
FROM usuarios u
JOIN roles r ON r.id = u.rol_id
WHERE r.nombre = 'Administrador'
  AND (
        EXISTS (SELECT 1 FROM permisos_usuario_override o
                WHERE o.usuario_id = u.id AND o.permiso_clave = 'usuarios.ver' AND o.tipo = 'grant')
     OR EXISTS (SELECT 1 FROM permisos_rol_v2 pr
                WHERE pr.rol_id = u.rol_id AND pr.permiso_clave = 'usuarios.ver')
      )
  AND NOT EXISTS (SELECT 1 FROM permisos_usuario_override o
                  WHERE o.usuario_id = u.id AND o.permiso_clave = 'usuarios.ver' AND o.tipo = 'deny');

-- 2. El rol «Administrador» deja de traer los parámetros de sueldo.
DELETE pr
FROM permisos_rol_v2 pr
JOIN roles r ON r.id = pr.rol_id
WHERE r.nombre = 'Administrador'
  AND pr.permiso_clave = 'cargos.sueldo.ver';

-- 3. Leonardo López y Daphne Lazcano: cancelar también lo que va en tránsito (permiso propio).
INSERT INTO permisos_usuario_override (usuario_id, permiso_clave, tipo)
SELECT u.id, p.clave, 'grant'
FROM usuarios u
JOIN permisos_catalogo p ON p.clave = 'inventario.transferencias.cancelar_en_transito'
WHERE u.email IN ('leonardolopez@lols.cl', 'daphnelazcano@lols.cl')
ON DUPLICATE KEY UPDATE tipo = 'grant';

-- 4. Re-login de los afectados (ver arriba). La subconsulta lee usuarios, no roles (MySQL 1093).
UPDATE roles
SET version = version + 1
WHERE id <> 1
  AND (
        nombre = 'Administrador'
     OR id IN (
            SELECT u.rol_id FROM usuarios u
            WHERE u.email IN ('leonardolopez@lols.cl', 'daphnelazcano@lols.cl')
              AND u.rol_id IS NOT NULL AND u.rol_id <> 1
        )
      );
