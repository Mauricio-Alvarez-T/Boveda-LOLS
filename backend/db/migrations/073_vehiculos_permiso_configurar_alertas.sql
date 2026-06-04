-- 073 — Limpieza: elimina el permiso 'vehiculos.configurar_alertas'
--
-- Se descartó el enfoque por rol/permiso: la visibilidad de las alertas de
-- vehículos (Días antes / Email / WhatsApp) se controla por LISTA DE USUARIOS
-- en el frontend (ver frontend/src/utils/alertasVehiculos.ts), porque varios
-- usuarios comparten el rol "Super Administrador" (God Mode) y se requiere
-- distinguir por persona, no por rol.
--
-- Esta migración deja el catálogo limpio si el permiso alcanzó a sincronizarse.
-- Idempotente: los DELETE no fallan si no existe la fila.

DELETE FROM permisos_rol_v2          WHERE permiso_clave = 'vehiculos.configurar_alertas';
DELETE FROM permisos_usuario_override WHERE permiso_clave = 'vehiculos.configurar_alertas';
DELETE FROM permisos_catalogo         WHERE clave         = 'vehiculos.configurar_alertas';
