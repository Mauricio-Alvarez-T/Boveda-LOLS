-- =============================================
-- 155 — Permiso: marcar días pasados del mes en curso (jefes de obra)
-- =============================================
-- Marcos 2026-11-18, confirmado por Daphne: «dale el permiso para que en obra pasen asistencia si se olvidaron
-- cualquier día del mes». Desde la 154 la asistencia se marca el mismo día y un día anterior solo con
-- `asistencia.dias_pasados` (RR.HH.). Este permiso deja al jefe de obra pasar o corregir un día que ya pasó **dentro
-- del mes en curso** (hora de Chile); un mes anterior sigue siendo solo de RR.HH. (el mes se cierra para la nómina).
-- No trae la campana ni el aviso «Importante»: eso sigue siendo de `asistencia.dias_pasados`.
--
-- Lo reciben el Super Administrador (rol 1) y «Supervisor de Obra» (los jefes de obra). Se da a otro rol, o se quita,
-- desde Configuración. Catálogo primero (FK), con el mismo texto que permisos.config.js.
--
-- Re-login: los permisos viajan en el token; se sube roles.version de «Supervisor de Obra» (nunca del rol 1).
-- Idempotente: INSERT IGNORE; repetirla solo vuelve a pedir un inicio de sesión a ese rol.

INSERT IGNORE INTO permisos_catalogo (clave, modulo, nombre, descripcion, orden) VALUES
    ('asistencia.dias_pasados_mes', 'Asistencia',
     'Marcar días pasados del mes',
     'Marcar o corregir la asistencia de un día que ya pasó, solo dentro del mes en curso (un mes anterior, solo con «Marcar días que ya pasaron»)', 11);

INSERT IGNORE INTO permisos_rol_v2 (rol_id, permiso_clave)
SELECT r.id, 'asistencia.dias_pasados_mes'
FROM roles r
WHERE r.id = 1 OR r.nombre = 'Supervisor de Obra';

UPDATE roles
SET version = version + 1
WHERE nombre = 'Supervisor de Obra' AND id <> 1;
