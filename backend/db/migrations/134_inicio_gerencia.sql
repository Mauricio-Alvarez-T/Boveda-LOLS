-- =============================================
-- Migración 134: permiso nuevo «Inicio de gerencia» (inicio.gerencia) para don Luis Lazcano
-- =============================================
-- Marcos 2026-10-23, decisión del dueño (lienzo del Inicio de gerencia, opción B «Tablero por tema»): arriba de las
-- tarjetas del Inicio, un tablero con los seis temas que esperan una decisión de gerencia (faltas reiteradas del
-- Art. 160 N°3, papeles de vehículos, pérdidas en Inventario, documentos de trabajadores, papeles laborales atrasados
-- y solicitudes de materiales trabadas). Lo abre el permiso NUEVO 'inicio.gerencia' (GET /api/dashboard/gerencia); cada
-- tema pide además el permiso de su módulo y los montos de Inventario, el de ver valores.
--   · Luis Lazcano lo recibe como permiso PROPIO (permisos_usuario_override, tipo 'grant'): por ahora es el único.
--   · Super Administrador (rol 1: Marcos y Mauricio) lo tiene como todo el catálogo; queda también en su rol, como en
--     las migraciones 111, 117 y 131.
--
-- Orden: el catálogo PRIMERO (FK desde permisos_usuario_override y permisos_rol_v2 hacia permisos_catalogo), con el
-- mismo texto que permisos.config.js (el sync del migrate lo reescribe igual). A Luis se le busca por su CORREO: si no
-- existe en este entorno, no se le agrega nada.
--
-- Idempotente: INSERT IGNORE en el catálogo y en el rol; el permiso propio va con ON DUPLICATE KEY UPDATE
-- tipo = 'grant' (PK usuario_id + permiso_clave): no se duplica y, si alguien se lo había denegado a mano, la decisión
-- del dueño lo deja concedido. Repetirla solo vuelve a subir la versión del rol de Luis (un re-login más, sin daño).
--
-- Re-login: los permisos viajan en el token. Se sube roles.version del rol de Luis (en producción, «Administrador»),
-- nunca del rol 1. Las sesiones viejas se cierran cuando el auto-migrate reinicia Passenger y versionService vuelve a
-- leer las versiones; quien entre de nuevo recibe sus permisos nuevos.

-- 1. Catálogo: el permiso nuevo.
INSERT IGNORE INTO permisos_catalogo (clave, modulo, nombre, descripcion, orden) VALUES
    ('inicio.gerencia', 'Inicio', 'Inicio de gerencia',
     'Inicio → tablero «N temas esperan una decisión» arriba de las tarjetas: faltas reiteradas, papeles de vehículos, pérdidas en Inventario, documentos de trabajadores, papeles laborales atrasados y solicitudes trabadas. Cada tema se ve solo con el permiso de su módulo. Los montos de Inventario, solo con "Ver Costos de Inventario" o "Ver Valores en Resumen Ejecutivo".',
     1);

-- 2. Super Administrador (rol 1) también lo tiene en su rol.
INSERT IGNORE INTO permisos_rol_v2 (rol_id, permiso_clave)
SELECT r.id, p.clave
FROM roles r
JOIN permisos_catalogo p ON p.clave = 'inicio.gerencia'
WHERE r.id = 1;

-- 3. Luis Lazcano: el permiso como propio.
INSERT INTO permisos_usuario_override (usuario_id, permiso_clave, tipo)
SELECT u.id, p.clave, 'grant'
FROM usuarios u
JOIN permisos_catalogo p ON p.clave = 'inicio.gerencia'
WHERE u.email = 'luislazcano@lols.cl'
ON DUPLICATE KEY UPDATE tipo = 'grant';

-- 4. Re-login de Luis: su rol sube de versión (si no es el 1). La subconsulta lee usuarios, no roles (MySQL 1093).
UPDATE roles
SET version = version + 1
WHERE id IN (
    SELECT u.rol_id FROM usuarios u
    WHERE u.email = 'luislazcano@lols.cl'
      AND u.rol_id IS NOT NULL AND u.rol_id <> 1
);
