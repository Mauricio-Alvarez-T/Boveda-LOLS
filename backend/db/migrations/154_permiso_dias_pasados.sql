-- =============================================
-- 154 — Permiso: marcar la asistencia de un día que ya pasó
-- =============================================
-- Pedido de Marcos (2026-11-18): «que no tenga la opción de marcar la asistencia si ya pasó, que mejor lo vea Daphne
-- eso, pero que le llegue a su perfil importante si alguien se olvidó de pasar lista». La asistencia se marca el MISMO
-- día (hora de Chile); un día anterior solo lo marca o corrige quien tenga `asistencia.dias_pasados`. Ese permiso
-- también recibe la campana «Importante» y el aviso al celular cuando una obra no pasó la lista.
--
-- Lo reciben el Super Administrador (rol 1) y RR.HH. (en algunos entornos el rol se llama «RRHH»). Se da a otro rol, o
-- se quita, desde Configuración. Catálogo primero (FK permisos_rol_v2.permiso_clave → permisos_catalogo.clave), con el
-- mismo texto que permisos.config.js (el sync del migrate lo reescribe igual).
--
-- Re-login: los permisos viajan en el token. Se sube roles.version de RR.HH. (nunca del rol 1) para que entren de
-- nuevo con el permiso. Idempotente: INSERT IGNORE; repetirla solo vuelve a pedir un inicio de sesión a RR.HH.

INSERT IGNORE INTO permisos_catalogo (clave, modulo, nombre, descripcion, orden) VALUES
    ('asistencia.dias_pasados', 'Asistencia',
     'Marcar días que ya pasaron',
     'Marcar o corregir la asistencia de un día que ya pasó (sin este permiso, solo el mismo día). Recibe el aviso «Importante» cuando una obra no pasó la lista', 11);

INSERT IGNORE INTO permisos_rol_v2 (rol_id, permiso_clave)
SELECT r.id, 'asistencia.dias_pasados'
FROM roles r
WHERE r.id = 1 OR r.nombre IN ('RR.HH', 'RRHH');

UPDATE roles
SET version = version + 1
WHERE nombre IN ('RR.HH', 'RRHH') AND id <> 1;
