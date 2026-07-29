-- =============================================
-- 098 — Permisos granulares de bombas de hormigón
-- =============================================
-- Problema: crear/editar una programación de hormigón estaba gateado por
-- `inventario.crear` / `inventario.editar`, que son GENÉRICOS del módulo —
-- también habilitan editar stock, ediciones masivas de ítems, imágenes,
-- discrepancias y catálogos de Configuración. Para que el rol "En Terreno"
-- pudiera llenar una solicitud de hormigón había que abrirle todo eso.
--
-- Solución: dos permisos propios del tab Hormigón. Los gates son OR
-- (`checkPermission('inventario.bombas.crear', 'inventario.crear')`), así que
-- los roles que YA podían crear/editar siguen igual sin recibir nada nuevo.
--
-- El catálogo también se sincroniza solo al arrancar el backend
-- (`permisos.service.js → syncCatalogoEnArranque`), pero se inserta acá porque
-- `permisos_rol_v2.permiso_clave` tiene FK a `permisos_catalogo.clave`: si esta
-- migración corre ANTES del deploy, la asignación fallaría sin estas filas.
--
-- Idempotente: `permisos_catalogo.clave` es UNIQUE y `permisos_rol_v2` tiene
-- PRIMARY KEY (rol_id, permiso_clave) → INSERT IGNORE no duplica.

INSERT IGNORE INTO permisos_catalogo (clave, modulo, nombre, descripcion, orden) VALUES
    ('inventario.bombas.crear',  'Inventario', 'Crear Programación Hormigón',  'Inventario → Pestaña "Bombas Hormigón": permite crear programaciones de hormigón (botón "Registrar uso") SIN necesidad de "Crear en Inventario". Requiere también "Ver Inventario" y "Ver Tab Bombas Hormigón".', 19),
    ('inventario.bombas.editar', 'Inventario', 'Editar Programación Hormigón', 'Inventario → Pestaña "Bombas Hormigón": permite editar programaciones existentes SIN necesidad de "Editar Inventario" (que habilita stock e ítems). Eliminar sigue requiriendo "Eliminar en Inventario".', 20);

-- Super Admin (rol_id = 1), mismo patrón que las migraciones 043/044/046.
INSERT IGNORE INTO permisos_rol_v2 (rol_id, permiso_clave) VALUES
    (1, 'inventario.bombas.crear'),
    (1, 'inventario.bombas.editar');

-- Rol "En Terreno": pedido del usuario (2026-07-29) — ya VE el tab Hormigón
-- (tiene `inventario.ver` + `inventario.tab.bombas`), solo le faltaba poder
-- llenar y modificar la solicitud. NO se le da `inventario.eliminar`: borrar
-- programaciones no se delega a terreno.
-- Se busca por NOMBRE porque el rol no está sembrado por migración (lo creó un
-- admin desde la UI, así que su id no es estable entre entornos). Si el rol no
-- existe, el SELECT no devuelve filas y la migración es un no-op.
INSERT IGNORE INTO permisos_rol_v2 (rol_id, permiso_clave)
SELECT r.id, k.clave
FROM roles r
CROSS JOIN (
    SELECT 'inventario.bombas.crear'  AS clave
    UNION ALL SELECT 'inventario.bombas.editar'
) k
WHERE r.nombre = 'En Terreno';
