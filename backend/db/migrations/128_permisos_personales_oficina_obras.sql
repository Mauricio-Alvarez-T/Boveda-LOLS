-- =============================================
-- Migración 128: más permisos personales sobre el rol «Administrador» (mig 126 y 127)
-- =============================================
-- Marcos 2026-10-21, antes de pasar a las 6 personas de Super Administrador a Administrador: lo que cada
-- una hace hoy en Bóveda y el rol no trae se suma como permiso PROPIO (permisos_usuario_override 'grant').
--   · Paula Martínez y Matías Millanao (RRHH): aprobar/rechazar las fichas de ingreso que manda terreno,
--     subir documentos al trabajador, finiquitar y reactivar trabajadores, asignar y borrar períodos
--     (vacaciones, licencias, permisos; un período no se edita: se borra y se vuelve a asignar) y feriados.
--   · Rodrigo Riquelme, Luis Lazcano y Daphne Lazcano: crear, editar y finalizar/reactivar obras (sin
--     borrar).
--   · Los cinco: «ver usuarios» (solo mirar la lista), porque el menú Configuración —donde están obras y
--     feriados— aparece solo con ese permiso. Leonardo no lo recibe (Marcos: solo quien hace algo ahí).
--
-- Se busca a cada persona por su CORREO: si no existe (otro entorno), no se agrega nada. Idempotente: no
-- duplica un permiso que la persona ya tenga como override.

INSERT INTO permisos_usuario_override (usuario_id, permiso_clave, tipo)
SELECT u.id, p.clave, 'grant'
FROM usuarios u
JOIN permisos_catalogo p ON p.clave IN (
    'trabajadores.solicitud.aprobar', 'documentos.subir', 'trabajadores.eliminar', 'trabajadores.reactivar',
    'asistencia.periodo.crear', 'asistencia.periodo.eliminar', 'asistencia.feriado.gestionar', 'usuarios.ver'
)
WHERE u.email IN ('paulamartinez@lols.cl', 'matiasmillanao@lols.cl')
  AND NOT EXISTS (
      SELECT 1 FROM permisos_usuario_override o WHERE o.usuario_id = u.id AND o.permiso_clave = p.clave
  );

INSERT INTO permisos_usuario_override (usuario_id, permiso_clave, tipo)
SELECT u.id, p.clave, 'grant'
FROM usuarios u
JOIN permisos_catalogo p ON p.clave IN ('obras.crear', 'obras.editar', 'obras.finalizar', 'usuarios.ver')
WHERE u.email IN ('rodrigoriquelme@lols.cl', 'luislazcano@lols.cl', 'daphnelazcano@lols.cl')
  AND NOT EXISTS (
      SELECT 1 FROM permisos_usuario_override o WHERE o.usuario_id = u.id AND o.permiso_clave = p.clave
  );
