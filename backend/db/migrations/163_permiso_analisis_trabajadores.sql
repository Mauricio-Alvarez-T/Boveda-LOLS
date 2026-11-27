-- =============================================
-- 163 — Permiso: Análisis de trabajadores (Gestiones → «Análisis»)
-- =============================================
-- Pedido de Daphne (RR.HH., 2026-11-27): un apartado con la mayor cantidad de datos posible de los
-- trabajadores, «tipo Power BI»: dotación, rotación, asistencia, perfil y papeles. Los montos (costo
-- estimado de la dotación) se ven además con `cargos.sueldo.ver`, el permiso de sueldos que ya existe.
--
-- Solo crea el permiso y se lo da al Super Administrador; el dueño lo asigna a mano (Daphne, RR.HH.,
-- gerencia) desde Configuración. Catálogo primero y luego el rol (FK permisos_rol_v2 → permisos_catalogo).
-- Sin `roles.version`: quien lo reciba vuelve a iniciar sesión para verlo (va en el JWT).

INSERT IGNORE INTO permisos_catalogo (clave, modulo, nombre, descripcion, orden) VALUES
    ('trabajadores.analisis.ver', 'Trabajadores',
     'Ver Análisis de Trabajadores',
     'Gestiones → Análisis: dotación, rotación, asistencia, perfil y papeles en gráficos y cifras, con filtros y Excel. Los montos requieren además «Ver sueldos por cargo»', 11);

INSERT IGNORE INTO permisos_rol_v2 (rol_id, permiso_clave)
VALUES (1, 'trabajadores.analisis.ver');
