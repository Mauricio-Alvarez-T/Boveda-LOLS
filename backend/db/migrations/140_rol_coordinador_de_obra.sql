-- =============================================
-- Migración 140: el rol «Administrador» pasa a llamarse «Coordinador de Obra»
-- =============================================
-- Marcos 2026-10-26: «cambiale el nombre de rol a Leonardo, que mantenga los mismos permisos pero que se llame
-- Coordinador de Obra, ya que él hace las compras y aprueba las transferencias». Desde la mig 139 Leonardo López es el
-- único del rol «Administrador» en producción. El nombre del rol es el cargo que la app muestra (menú lateral, Soporte
-- → Panorama, Inventario), así que se RENOMBRA: mismo id, mismos permisos, la misma gente. RR.HH, Supervisor y Gerente
-- (copias del Administrador, mig 139) no cambian.
--
-- Si en ese entorno ya existiera un rol «Coordinador de Obra» (nombre UNIQUE), el renombre no se puede: UPDATE IGNORE
-- lo salta y entonces ese rol queda con exactamente los permisos del Administrador y Leonardo (por correo, solo si
-- está en «Administrador») pasa a él. Si el renombre sí se hizo, esos pasos no encuentran el rol «Administrador» y no
-- hacen nada.
--
-- Re-login: roles.version + 1 del «Coordinador de Obra» (el menú lateral muestra el nombre del rol que viajó en el
-- inicio de sesión) y, en el caso de respaldo, del «Administrador» que Leonardo deja. Nunca el rol 1. Corre cuando el
-- auto-migrate reinicia el backend. Idempotente: una segunda pasada no renombra ni mueve a nadie (solo vuelve a subir
-- la versión del «Coordinador de Obra»).

-- 1. El cambio de nombre.
UPDATE IGNORE roles
SET nombre = 'Coordinador de Obra',
    descripcion = 'Compras y aprobación de las solicitudes de Inventario: ve todo, sin configuración del sistema ni borrados.'
WHERE nombre = 'Administrador';

-- 2. Respaldo (solo si «Coordinador de Obra» ya existía y el paso 1 no pudo): sus permisos = los del Administrador.
DELETE pr
FROM permisos_rol_v2 pr
JOIN roles r ON r.id = pr.rol_id
JOIN roles adm ON adm.nombre = 'Administrador'
LEFT JOIN permisos_rol_v2 base ON base.rol_id = adm.id AND base.permiso_clave = pr.permiso_clave
WHERE r.nombre = 'Coordinador de Obra'
  AND base.rol_id IS NULL;

INSERT IGNORE INTO permisos_rol_v2 (rol_id, permiso_clave)
SELECT r.id, base.permiso_clave
FROM roles r
JOIN roles adm ON adm.nombre = 'Administrador'
JOIN permisos_rol_v2 base ON base.rol_id = adm.id
WHERE r.nombre = 'Coordinador de Obra';

-- 3. Re-login: el «Coordinador de Obra» y, en el respaldo, el «Administrador» si Leonardo está ahí (antes de moverlo).
--    La subconsulta lee usuarios, no roles (MySQL 1093).
UPDATE roles
SET version = version + 1
WHERE id <> 1
  AND (
        nombre = 'Coordinador de Obra'
     OR (nombre = 'Administrador'
         AND id IN (SELECT u.rol_id FROM usuarios u
                    WHERE u.email = 'leonardolopez@lols.cl' AND u.rol_id IS NOT NULL))
      );

-- 4. Respaldo: Leonardo pasa del «Administrador» al «Coordinador de Obra».
UPDATE usuarios u
JOIN roles actual ON actual.id = u.rol_id
JOIN roles nuevo ON nuevo.nombre = 'Coordinador de Obra'
SET u.rol_id = nuevo.id
WHERE u.email = 'leonardolopez@lols.cl'
  AND actual.nombre = 'Administrador';
