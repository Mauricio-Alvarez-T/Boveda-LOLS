-- =============================================
-- Migración 131: «Solo Leonardo aprueba» + permiso nuevo «Ver diferencias» (sobre el rol «Administrador», mig 126)
-- =============================================
-- Marcos 2026-10-22, decisión del dueño (él avisa a Mauricio, que lleva el módulo de inventario y diferencias):
--   1) Aprobar solicitudes de inventario (y resolver sus diferencias) queda SOLO para Leonardo López: se quita
--      'inventario.transferencias.aprobar' del rol «Administrador» y se le da a él como permiso PROPIO
--      (permisos_usuario_override, tipo 'grant'). Paula, Rodrigo, Matías, Luis y Daphne dejan de aprobar.
--      Super Administrador no cambia: tiene todo el catálogo.
--   2) Permiso NUEVO 'inventario.transferencias.diferencias_ver' («Ver diferencias»): ver la lista de diferencias
--      (filtro «Diferencias» de Inventario → Solicitudes), su detalle en solo lectura, y verlas contadas en el
--      Inicio, SIN poder resolverlas. Resolver, rehacer y subir foto de una diferencia siguen pidiendo
--      'aprobar'. Por ahora solo Daphne Lazcano, como permiso propio.
--   3) 'inventario.transferencias.cancelar' (cancelar solicitudes pendientes o aprobadas) como permiso propio de
--      Leonardo y de Daphne. Las que van en tránsito (push directo, orden de gerencia o despachadas) siguen
--      pidiendo «Cancelar en Tránsito», que no se da aquí.
--
-- Orden: el catálogo PRIMERO (FK desde permisos_usuario_override y permisos_rol_v2 hacia permisos_catalogo), con
-- el mismo texto que permisos.config.js (el sync del migrate lo reescribe igual). A cada persona se la busca por
-- su CORREO: si no existe (otro entorno), no se le agrega nada.
--
-- Idempotente: INSERT IGNORE en el catálogo y en el rol; los DELETE no fallan si ya no está; los permisos propios
-- van con ON DUPLICATE KEY UPDATE tipo = 'grant' (PK usuario_id + permiso_clave): no se duplican y, si alguien
-- tenía ese permiso denegado a mano, la decisión del dueño lo deja concedido.
--
-- Re-login: los permisos viajan en el token. Se sube roles.version del rol «Administrador» y, si en este entorno
-- Leonardo o Daphne tienen otro rol, también el de ellos (salvo Super Administrador, rol 1: ya tiene todo y los
-- botones piden «aprobar» O «ver diferencias»). Las sesiones viejas se cierran cuando el auto-migrate reinicia
-- Passenger y versionService vuelve a leer las versiones; quien entre de nuevo recibe sus permisos nuevos.

-- 1. Catálogo: el permiso nuevo (Super Administrador lo recibe como todo el catálogo; queda también en su rol,
--    como las migraciones 111 y 117).
INSERT IGNORE INTO permisos_catalogo (clave, modulo, nombre, descripcion, orden) VALUES
    ('inventario.transferencias.diferencias_ver', 'Inventario', 'Ver diferencias',
     'Inventario → Solicitudes → «Diferencias»: ver la lista y el detalle de las diferencias entre lo enviado y lo que llegó, y verlas contadas en el Inicio, sin poder resolverlas. Para aprobarlas o rechazarlas hace falta "Aprobar Transferencia".',
     28);

INSERT IGNORE INTO permisos_rol_v2 (rol_id, permiso_clave)
SELECT r.id, p.clave
FROM roles r
JOIN permisos_catalogo p ON p.clave = 'inventario.transferencias.diferencias_ver'
WHERE r.id = 1;

-- 2. El rol «Administrador» deja de aprobar.
DELETE pr
FROM permisos_rol_v2 pr
JOIN roles r ON r.id = pr.rol_id
WHERE r.nombre = 'Administrador'
  AND pr.permiso_clave = 'inventario.transferencias.aprobar';

-- «Solo Leonardo»: si a otra persona del rol se le había dado «aprobar» como permiso propio, también se quita.
DELETE o
FROM permisos_usuario_override o
JOIN usuarios u ON u.id = o.usuario_id
JOIN roles r ON r.id = u.rol_id
WHERE r.nombre = 'Administrador'
  AND o.permiso_clave = 'inventario.transferencias.aprobar'
  AND o.tipo = 'grant'
  AND u.email <> 'leonardolopez@lols.cl';

-- 3. Leonardo López: aprobar y cancelar como permisos propios.
INSERT INTO permisos_usuario_override (usuario_id, permiso_clave, tipo)
SELECT u.id, p.clave, 'grant'
FROM usuarios u
JOIN permisos_catalogo p ON p.clave IN ('inventario.transferencias.aprobar', 'inventario.transferencias.cancelar')
WHERE u.email = 'leonardolopez@lols.cl'
ON DUPLICATE KEY UPDATE tipo = 'grant';

-- 4. Daphne Lazcano: ver diferencias y cancelar como permisos propios.
INSERT INTO permisos_usuario_override (usuario_id, permiso_clave, tipo)
SELECT u.id, p.clave, 'grant'
FROM usuarios u
JOIN permisos_catalogo p ON p.clave IN ('inventario.transferencias.diferencias_ver', 'inventario.transferencias.cancelar')
WHERE u.email = 'daphnelazcano@lols.cl'
ON DUPLICATE KEY UPDATE tipo = 'grant';

-- 5. Re-login de los afectados (ver arriba). La subconsulta lee usuarios, no roles: MySQL la acepta en el UPDATE.
UPDATE roles
SET version = version + 1
WHERE nombre = 'Administrador'
   OR id IN (
       SELECT u.rol_id FROM usuarios u
       WHERE u.email IN ('leonardolopez@lols.cl', 'daphnelazcano@lols.cl')
         AND u.rol_id IS NOT NULL AND u.rol_id <> 1
   );
