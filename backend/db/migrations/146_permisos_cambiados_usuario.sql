-- =============================================
-- Migración 146: cerrar la sesión de UNA persona al cambiarle sus permisos, su rol o su bodega
-- =============================================
-- Marcos 2026-10-28 (ventana «Permisos de <persona>» en frases, opción E): al guardar los permisos propios de una
-- persona el backend subía `roles.version` de SU ROL entero (POST /usuarios/user-overrides/:id) y con eso sacaba de
-- Bóveda a todas las personas de ese rol (p. ej. las tres de RR.HH) aunque solo se le cambió algo a una. Lo mismo
-- pasaba en PUT /usuarios/:id al cambiarle el rol (subía el rol que deja) o la bodega (subía su rol actual).
--
-- Columna NUEVA y opcional: `usuarios.permisos_cambiados_en DATETIME NULL`.
--   · Vacía      = nunca se le cerró la sesión por esto (todas las filas existentes quedan así).
--   · Con fecha  = el segundo en que se le cambiaron por última vez los permisos/rol/bodega: los tokens emitidos
--                  hasta ese segundo (`iat` <= esa fecha) dejan de valer → 401 expired_by_version → vuelve a entrar.
-- La escribe `version.service.cerrarSesionDe(id)`; el backend la carga en memoria al arrancar (init) y el middleware
-- de auth la compara con el `iat` del token. Cambiar los permisos del ROL sigue subiendo `roles.version` (todos).
-- La fecha va en **UTC** (DATE_ADD / TIMESTAMPDIFF desde 1970-01-01, sin FROM_UNIXTIME / UNIX_TIMESTAMP): así no
-- depende de la zona horaria del servidor ni se corre una hora al recargarla en el cambio de horario.
--
-- Nada se calcula ni se rellena. Idempotente: ADD COLUMN IF NOT EXISTS (MariaDB 10.6). Sin UPDATE, sin DELETE,
-- sin índice (se lee una vez al arrancar, solo las filas con fecha).

ALTER TABLE usuarios
    ADD COLUMN IF NOT EXISTS permisos_cambiados_en DATETIME NULL
        COMMENT 'Cuándo (UTC) se le cambiaron por última vez los permisos/rol/bodega a esta persona; los tokens emitidos hasta ese segundo dejan de valer (mig 146)';
