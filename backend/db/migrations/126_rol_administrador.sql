-- =============================================
-- Migración 126: rol «Administrador» (dueños y jefatura)
-- =============================================
-- Marcos 2026-10-21: Paula Martínez, Rodrigo Riquelme, Leonardo López, Matías Millanao, Luis Lazcano y
-- Daphne Lazcano estaban como Super Administrador. Ese rol queda para quienes programan y prueban
-- (Marcos, Mauricio). «Administrador» ve todo y toma las decisiones de jefatura (aprobar solicitudes de
-- inventario, orden de gerencia), sin la operación diaria, sin configuración del sistema ni borrados.
-- Lo que alguien necesite de más se agrega de a poco (al rol o como permiso propio de la persona).
--
-- Solo crea el rol y sus permisos: las personas se asignan a mano en Configuración → Usuarios (y vuelven
-- a iniciar sesión, porque los permisos viajan en el token).
--
-- Idempotente: roles.nombre es UNIQUE y permisos_rol_v2 tiene PK (rol_id, permiso_clave). El JOIN con
-- permisos_catalogo asigna solo claves que existen (FK).

INSERT IGNORE INTO roles (nombre, descripcion)
VALUES ('Administrador', 'Dueños y jefatura: ven todo y aprueban; sin configuración del sistema ni borrados.');

INSERT IGNORE INTO permisos_rol_v2 (rol_id, permiso_clave)
SELECT r.id, p.clave
FROM roles r
JOIN permisos_catalogo p ON p.clave IN (
    -- Asistencia (ver todo, exportar, horas extra)
    'asistencia.ver', 'asistencia.exportar_excel', 'asistencia.enviar_whatsapp', 'asistencia.periodo.ver',
    'asistencia.horarios.ver', 'asistencia.tomar.global', 'asistencia.actividades_sugeridas.ver',
    'asistencia.actividades_sugeridas.informe', 'asistencia.horas_extra.ver',
    -- Trabajadores y documentos (ver y descargar)
    'trabajadores.ver', 'trabajadores.financiero.ver',
    'documentos.ver', 'documentos.descargar', 'documentos.laborales.descargar',
    -- Gestiones (reportes)
    'reportes.ver', 'reportes.exportar', 'reportes.enviar_email',
    -- Catálogos (ver)
    'empresas.ver', 'obras.ver', 'cargos.ver', 'cargos.sueldo.ver', 'conductores.ver',
    -- Inventario (ver todo, valores y decisiones de jefatura)
    'inventario.ver', 'inventario.tab.resumen_ejecutivo', 'inventario.tab.resumen', 'inventario.tab.por_ubicacion',
    'inventario.tab.transferencias', 'inventario.tab.maestro', 'inventario.tab.bombas', 'inventario.movimientos.ver',
    'inventario.transferencias.ver_todas', 'inventario.transferencias.aprobar', 'inventario.transferencias.orden_gerencia',
    'inventario.costos.ver', 'inventario.facturas.ver', 'inventario.bombas.ver_costos', 'inventario.resumen.ver_valores',
    -- Vehículos (ver)
    'vehiculos.ver',
    -- Presupuestos (único permiso del módulo; incluye editar)
    'costos.gestionar'
)
WHERE r.nombre = 'Administrador';
