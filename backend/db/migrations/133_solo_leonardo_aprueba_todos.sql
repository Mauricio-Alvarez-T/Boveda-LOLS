-- =============================================
-- Migración 133: «Solo Leonardo aprueba», ahora en TODOS los roles (sigue a la mig 131)
-- =============================================
-- Marcos 2026-10-23, decisión del dueño («Sí, a todos»). La mig 131 quitó 'inventario.transferencias.aprobar'
-- solo del rol «Administrador»; los demás roles que lo traían (los de terreno, p. ej. «Supervisor de Obra» en test)
-- seguían aprobando. Desde esta migración aprueban solicitudes de inventario (y resuelven sus diferencias) SOLO:
--   · Leonardo López, como permiso PROPIO (permisos_usuario_override, tipo 'grant'), y
--   · el Super Administrador (rol 1: Marcos y Mauricio), que tiene todo el catálogo y no se toca.
-- En test Leonardo está en «Supervisor de Obra»: ese rol pierde 'aprobar' y él lo conserva como permiso propio.
--
-- Qué hace, en este orden:
--   1) Re-login: roles.version + 1 de todo rol (salvo el 1) que hoy tenga 'aprobar', y del rol (salvo el 1) de toda
--      persona que lo tenga como permiso propio 'grant' y no sea Leonardo (activa o no: el token no se revisa
--      contra usuarios.activo). Va PRIMERO porque, una vez borrado el permiso, ya no se sabe quiénes lo tenían.
--      Si Leonardo está en uno de esos roles (en test), su sesión también se renueva y vuelve con 'aprobar' propio.
--   2) Borra 'aprobar' de permisos_rol_v2 de TODOS los roles salvo el 1.
--   3) Borra el 'aprobar' propio ('grant') de todas las personas salvo Leonardo. Los 'deny' quedan (quitan, no dan).
--   4) Deja a Leonardo con 'aprobar' propio (ya lo tiene desde la 131; si no existe en este entorno, nada).
-- A cada persona se la busca por su CORREO, como en la 131. Nunca se borra nada del catálogo ni de otro permiso.
--
-- Los roles que no tenían nada que perder no se tocan: el Administrador ya no tiene 'aprobar' desde la 131 y solo
-- Leonardo lo tiene como propio, así que su versión no sube (salvo que alguien se lo haya devuelto a mano).
-- Las sesiones viejas se cierran cuando el auto-migrate reinicia Passenger (versionService guarda las versiones en
-- memoria; corriendo migrate a mano, reiniciar el backend).
--
-- Idempotente: la segunda vez ya no hay rol (salvo el 1) ni persona (salvo Leonardo) con 'aprobar', así que el
-- UPDATE no sube ninguna versión y los DELETE no borran nada; el permiso de Leonardo va con ON DUPLICATE KEY UPDATE
-- tipo = 'grant' (PK usuario_id + permiso_clave: no se duplica y pisa un 'deny' puesto a mano).
-- MariaDB 10.6 y MySQL: las subconsultas del UPDATE leen permisos_rol_v2, usuarios y permisos_usuario_override,
-- nunca roles (MySQL no deja leer en una subconsulta la misma tabla que se actualiza, error 1093).

-- 1. Re-login de quienes pierden 'aprobar' (ANTES de borrarlo).
UPDATE roles
SET version = version + 1
WHERE id <> 1
  AND (
        id IN (
            SELECT pr.rol_id FROM permisos_rol_v2 pr
            WHERE pr.permiso_clave = 'inventario.transferencias.aprobar'
        )
     OR id IN (
            SELECT u.rol_id FROM permisos_usuario_override o
            JOIN usuarios u ON u.id = o.usuario_id
            WHERE o.permiso_clave = 'inventario.transferencias.aprobar'
              AND o.tipo = 'grant'
              AND u.email <> 'leonardolopez@lols.cl'
              AND u.rol_id IS NOT NULL
        )
  );

-- 2. Ningún rol aprueba, salvo Super Administrador (rol 1).
DELETE FROM permisos_rol_v2
WHERE permiso_clave = 'inventario.transferencias.aprobar'
  AND rol_id <> 1;

-- 3. Ninguna persona aprueba como permiso propio, salvo Leonardo.
DELETE o
FROM permisos_usuario_override o
JOIN usuarios u ON u.id = o.usuario_id
WHERE o.permiso_clave = 'inventario.transferencias.aprobar'
  AND o.tipo = 'grant'
  AND u.email <> 'leonardolopez@lols.cl';

-- 4. Leonardo López: 'aprobar' como permiso propio (la clave ya está en el catálogo, permisos.config.js; el JOIN
--    con permisos_catalogo respeta la FK).
INSERT INTO permisos_usuario_override (usuario_id, permiso_clave, tipo)
SELECT u.id, p.clave, 'grant'
FROM usuarios u
JOIN permisos_catalogo p ON p.clave = 'inventario.transferencias.aprobar'
WHERE u.email = 'leonardolopez@lols.cl'
ON DUPLICATE KEY UPDATE tipo = 'grant';
