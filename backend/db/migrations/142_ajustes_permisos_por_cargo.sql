-- =============================================
-- Migración 142: tres permisos que se heredaron al separar los roles (mig 139/140)
-- =============================================
-- Marcos 2026-10-26, después de la vuelta por los perfiles (Soporte):
--   1) «Configuración» en terreno: Supervisor de Obra y Prevencionista traían `usuarios.ver` (venía del rol «En Terreno»)
--      y con él veían Configuración y la lista de usuarios con sus correos. Se les quita.
--   2) Presupuestos (`costos.gestionar`, ver y editar): solo Rodrigo (Supervisor) y don Luis (Gerente). Se quita de RR.HH
--      y de Coordinador de Obra (venía del rol «Administrador», mig 126).
--   3) Sueldos de los trabajadores (`trabajadores.financiero.ver`): el Coordinador de Obra (Leonardo) deja de verlos.
-- Se quitan del ROL y, para quien hoy está en ese rol, también el permiso propio («grant») de esa misma clave, si
-- alguien se lo dio a mano: así la decisión vale para todos los de ese cargo. Los «deny» quedan. Lo de otras personas
-- (p. ej. el arquitecto con Presupuestos como permiso propio) no se toca.
-- Re-login: roles.version + 1 de los cuatro roles (los permisos viajan en el token; corre cuando el auto-migrate
-- reinicia el backend). Nunca el rol 1. Idempotente: los DELETE no fallan si ya no está; repetirla solo vuelve a subir
-- las versiones.

-- 1. Del rol.
DELETE pr
FROM permisos_rol_v2 pr
JOIN roles r ON r.id = pr.rol_id
WHERE r.id <> 1
  AND (
        (r.nombre IN ('Supervisor de Obra', 'Prevencionista') AND pr.permiso_clave = 'usuarios.ver')
     OR (r.nombre IN ('RR.HH', 'Coordinador de Obra') AND pr.permiso_clave = 'costos.gestionar')
     OR (r.nombre = 'Coordinador de Obra' AND pr.permiso_clave = 'trabajadores.financiero.ver')
      );

-- 2. El permiso propio de quien hoy está en esos roles (solo «grant»).
DELETE o
FROM permisos_usuario_override o
JOIN usuarios u ON u.id = o.usuario_id
JOIN roles r ON r.id = u.rol_id
WHERE r.id <> 1
  AND o.tipo = 'grant'
  AND (
        (r.nombre IN ('Supervisor de Obra', 'Prevencionista') AND o.permiso_clave = 'usuarios.ver')
     OR (r.nombre IN ('RR.HH', 'Coordinador de Obra') AND o.permiso_clave = 'costos.gestionar')
     OR (r.nombre = 'Coordinador de Obra' AND o.permiso_clave = 'trabajadores.financiero.ver')
      );

-- 3. Re-login de los cuatro roles.
UPDATE roles
SET version = version + 1
WHERE id <> 1
  AND nombre IN ('Supervisor de Obra', 'Prevencionista', 'RR.HH', 'Coordinador de Obra');
