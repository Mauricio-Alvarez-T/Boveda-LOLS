-- =============================================
-- Migración 139: un rol por cargo, y «Super Administrador» solo para Marcos y Mauricio
-- =============================================
-- Marcos 2026-10-26: en producción 8 personas seguían en «Super Administrador» (rol 1: todo el catálogo, Soporte y
-- «ver como») y las de terreno en «En Terreno». El rol 1 queda solo para quienes programan (Marcos, Mauricio).
-- Decisión del dueño, un rol por cargo (la app no guarda el cargo de los usuarios: el nombre del rol es lo que se ve
-- junto al nombre en Inventario y en Soporte → Panorama):
--   · Administrador ......... Leonardo López
--   · RR.HH ................. Paula Martínez, Matías Millanao, Daphne Lazcano
--   · Supervisor ............ Rodrigo Riquelme
--   · Gerente ............... Luis Lazcano
--   · Supervisor de Obra .... Alfonso Castilla, Franco Gutiérrez, Felipe Escobar, Cristian Mancilla, Héctor Herrera
--   · Prevencionista ........ Cristoffer Bolados, Héctor Gómez, Jhoan Vásquez
-- Permisos: «RR.HH», «Supervisor» y «Gerente» = los del rol «Administrador» (Gerente, más «Inicio de gerencia»);
-- «Supervisor de Obra» y «Prevencionista» = los del rol «En Terreno» (lo que hoy usan). Si alguno de esos roles ya
-- existía, queda con exactamente esos permisos. Los permisos propios de cada persona (migs 127-137) no se tocan: van
-- por correo, no por rol. Lo de la mig 137 que dependía del rol se repite aquí: quien pasa a un rol de oficina y ve
-- Configuración (`usuarios.ver`) conserva «Ver Parámetros de Sueldo» como permiso propio.
--
-- A la gente de oficina se la busca por CORREO. A la de terreno, solo si hoy está en «En Terreno», por correo o, para
-- las tres de las que no hay correo a mano, por apellido. Quien no exista en ese entorno queda como está.
--
-- Re-login: los permisos viajan en el token y la versión es por rol → se sube roles.version del rol que cada persona
-- DEJA (igual que Configuración → Usuarios al cambiar un rol). En producción son el rol 1 (Marcos y Mauricio también
-- vuelven a entrar) y «En Terreno»: sin eso, quien deja el rol 1 seguiría hasta 8 h con un token de Super
-- Administrador. Las sesiones se cierran cuando el auto-migrate reinicia el backend (versionService las guarda en
-- memoria).
-- Idempotente: roles.nombre es UNIQUE (INSERT IGNORE); permisos_rol_v2 tiene PK (rol_id, permiso_clave); la tabla
-- temporal vive solo en esta conexión y guarda ids (sin comparar textos de dos tablas: sin choque de collation). Una
-- segunda pasada no mueve a nadie (quien ya está en su rol se saca de la lista); solo vuelve a subir la versión de los
-- cinco roles nuevos.

-- 1. Los roles nuevos (si ya existían, quedan activos).
INSERT IGNORE INTO roles (nombre, descripcion) VALUES
    ('RR.HH', 'Recursos humanos: los permisos del Administrador, y lo de cada persona como permiso propio.'),
    ('Supervisor', 'Supervisión: los permisos del Administrador.'),
    ('Gerente', 'Gerencia: los permisos del Administrador más el Inicio de gerencia.'),
    ('Supervisor de Obra', 'Terreno: los permisos de «En Terreno» (pedir y recibir materiales, asistencia de su obra).'),
    ('Prevencionista', 'Prevención de riesgos en obra: los permisos de «En Terreno».');

UPDATE roles
SET activo = 1
WHERE nombre IN ('RR.HH', 'Supervisor', 'Gerente', 'Supervisor de Obra', 'Prevencionista')
  AND activo <> 1;

-- 2. Oficina: exactamente los permisos del Administrador (Gerente, más «Inicio de gerencia»).
DELETE pr
FROM permisos_rol_v2 pr
JOIN roles r ON r.id = pr.rol_id
JOIN roles adm ON adm.nombre = 'Administrador'
LEFT JOIN permisos_rol_v2 base ON base.rol_id = adm.id AND base.permiso_clave = pr.permiso_clave
WHERE r.nombre IN ('RR.HH', 'Supervisor', 'Gerente')
  AND base.rol_id IS NULL
  AND NOT (r.nombre = 'Gerente' AND pr.permiso_clave = 'inicio.gerencia');

INSERT IGNORE INTO permisos_rol_v2 (rol_id, permiso_clave)
SELECT r.id, base.permiso_clave
FROM roles r
JOIN roles adm ON adm.nombre = 'Administrador'
JOIN permisos_rol_v2 base ON base.rol_id = adm.id
WHERE r.nombre IN ('RR.HH', 'Supervisor', 'Gerente');

INSERT IGNORE INTO permisos_rol_v2 (rol_id, permiso_clave)
SELECT r.id, p.clave
FROM roles r
JOIN permisos_catalogo p ON p.clave = 'inicio.gerencia'
WHERE r.nombre = 'Gerente';

-- 3. Terreno: exactamente los permisos de «En Terreno».
DELETE pr
FROM permisos_rol_v2 pr
JOIN roles r ON r.id = pr.rol_id
JOIN roles terreno ON terreno.nombre = 'En Terreno'
LEFT JOIN permisos_rol_v2 base ON base.rol_id = terreno.id AND base.permiso_clave = pr.permiso_clave
WHERE r.nombre IN ('Supervisor de Obra', 'Prevencionista')
  AND base.rol_id IS NULL;

INSERT IGNORE INTO permisos_rol_v2 (rol_id, permiso_clave)
SELECT r.id, base.permiso_clave
FROM roles r
JOIN roles terreno ON terreno.nombre = 'En Terreno'
JOIN permisos_rol_v2 base ON base.rol_id = terreno.id
WHERE r.nombre IN ('Supervisor de Obra', 'Prevencionista');

-- 4. Quién va a qué rol: una sola lista para el re-login y el cambio.
DROP TEMPORARY TABLE IF EXISTS _mig139_destino;
CREATE TEMPORARY TABLE _mig139_destino (
    usuario_id INT NOT NULL PRIMARY KEY,
    rol_anterior INT NULL,
    rol_nuevo INT NOT NULL
);

-- 4a. Oficina, por correo (de cualquier rol).
INSERT IGNORE INTO _mig139_destino (usuario_id, rol_anterior, rol_nuevo)
SELECT u.id, u.rol_id, nuevo.id
FROM usuarios u
JOIN roles nuevo ON nuevo.nombre = CASE u.email
        WHEN 'leonardolopez@lols.cl'   THEN 'Administrador'
        WHEN 'paulamartinez@lols.cl'   THEN 'RR.HH'
        WHEN 'matiasmillanao@lols.cl'  THEN 'RR.HH'
        WHEN 'daphnelazcano@lols.cl'   THEN 'RR.HH'
        WHEN 'rodrigoriquelme@lols.cl' THEN 'Supervisor'
        WHEN 'luislazcano@lols.cl'     THEN 'Gerente'
    END
WHERE u.email IN ('leonardolopez@lols.cl', 'paulamartinez@lols.cl', 'matiasmillanao@lols.cl',
                  'daphnelazcano@lols.cl', 'rodrigoriquelme@lols.cl', 'luislazcano@lols.cl');

-- 4b. Terreno, solo quien hoy está en «En Terreno»: por correo, o por apellido (Escobar, Mancilla o Mansilla, Bolados).
INSERT IGNORE INTO _mig139_destino (usuario_id, rol_anterior, rol_nuevo)
SELECT u.id, u.rol_id, nuevo.id
FROM usuarios u
JOIN roles actual ON actual.id = u.rol_id
JOIN roles nuevo ON nuevo.nombre = CASE
        WHEN u.email IN ('hectorgomez@lols.cl', 'jhoanvasquez@lols.cl') OR u.nombre LIKE '%Bolados%'
            THEN 'Prevencionista'
        ELSE 'Supervisor de Obra'
    END
WHERE actual.nombre = 'En Terreno'
  AND (
        u.email IN ('alfonsocastilla@lols.cl', 'francogutierrez@lols.cl', 'hectorherrera@lols.cl',
                    'hectorgomez@lols.cl', 'jhoanvasquez@lols.cl')
     OR u.nombre LIKE '%Escobar%'
     OR u.nombre LIKE '%Man_illa%'
     OR u.nombre LIKE '%Bolados%'
      );

-- 4c. Quien ya está en su rol no cambia (ni re-loguea).
DELETE FROM _mig139_destino
WHERE rol_anterior = rol_nuevo;

-- 5. Re-login: el rol que cada persona deja (ver arriba), y los cinco roles de esta migración (si alguno ya existía
--    con gente, sus permisos pudieron cambiar en los pasos 2 y 3). La subconsulta lee la tabla temporal, no roles
--    (MySQL 1093).
UPDATE roles
SET version = version + 1
WHERE id IN (SELECT rol_anterior FROM _mig139_destino WHERE rol_anterior IS NOT NULL)
   OR nombre IN ('RR.HH', 'Supervisor', 'Gerente', 'Supervisor de Obra', 'Prevencionista');

-- 6. El cambio de rol.
UPDATE usuarios u
JOIN _mig139_destino d ON d.usuario_id = u.id
SET u.rol_id = d.rol_nuevo;

-- 7. Como en la mig 137: quien pasa a un rol de oficina y ve Configuración (`usuarios.ver` propio o del rol, sin
--    «deny») conserva «Ver Parámetros de Sueldo» como permiso propio. INSERT IGNORE: no pisa uno que ya exista.
INSERT IGNORE INTO permisos_usuario_override (usuario_id, permiso_clave, tipo)
SELECT d.usuario_id, 'cargos.sueldo.ver', 'grant'
FROM _mig139_destino d
JOIN roles r ON r.id = d.rol_nuevo
WHERE r.nombre IN ('Administrador', 'RR.HH', 'Supervisor', 'Gerente')
  AND (
        EXISTS (SELECT 1 FROM permisos_usuario_override o
                WHERE o.usuario_id = d.usuario_id AND o.permiso_clave = 'usuarios.ver' AND o.tipo = 'grant')
     OR EXISTS (SELECT 1 FROM permisos_rol_v2 pr
                WHERE pr.rol_id = d.rol_nuevo AND pr.permiso_clave = 'usuarios.ver')
      )
  AND NOT EXISTS (SELECT 1 FROM permisos_usuario_override o
                  WHERE o.usuario_id = d.usuario_id AND o.permiso_clave = 'usuarios.ver' AND o.tipo = 'deny');

DROP TEMPORARY TABLE IF EXISTS _mig139_destino;
