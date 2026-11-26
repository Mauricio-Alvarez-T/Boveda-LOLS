-- =============================================
-- 159 — El aviso «Importante» de asistencia también para don Luis (Gerente)
-- =============================================
-- Marcos 2026-11-26: «está bien para las personas que lo tienen, agregaría a don Luis que es el dueño… Paula, Matías,
-- Daphne y don Luis son los que usan el sistema» (Marcos y Mauricio, Super Administrador, lo ven por control).
--
-- El aviso lo recibe quien tiene `asistencia.dias_pasados` (mig 154): campana «Importante» (obras que no pasaron la
-- lista y obras en preparación con trabajadores), la ventana al entrar y el aviso al celular de las 8:00. Se le da al
-- rol «Gerente» (solo don Luis). Como Gerente ya tiene los permisos de asistencia de oficina, con esto también puede
-- marcar o corregir un día que ya pasó, igual que RR.HH.
--
-- Re-login: los permisos viajan en el token; se sube roles.version de «Gerente» (nunca del rol 1).
-- Idempotente: INSERT IGNORE; repetirla solo vuelve a pedir un inicio de sesión a ese rol.

INSERT IGNORE INTO permisos_rol_v2 (rol_id, permiso_clave)
SELECT r.id, 'asistencia.dias_pasados'
FROM roles r
WHERE r.nombre = 'Gerente';

UPDATE roles
SET version = version + 1
WHERE nombre = 'Gerente' AND id <> 1;
