-- =============================================
-- Migración 127: permisos personales de Paula, Matías y Leonardo (sobre el rol «Administrador», mig 126)
-- =============================================
-- Marcos 2026-10-21: el rol «Administrador» ve todo sin la operación diaria. A quien opera algo se le suma
-- como permiso PROPIO (permisos_usuario_override, tipo 'grant'), no al rol:
--   · Paula Martínez y Matías Millanao (RRHH): emitir contratos y documentos laborales, registrar las
--     entregas físicas (armar lotes, recibir firmados) y crear trabajadores. También EDITAR trabajadores:
--     emitir el contrato pide completar los datos que falten de la ficha (sin editar, el botón se apaga).
--   · Leonardo López (vehículos): crear y editar vehículos (agregar y renovar documentos, revisiones,
--     mantenciones, kilómetros). Sin borrar, como el resto del rol.
--
-- Se busca a cada persona por su CORREO: si no existe (otro entorno), no se agrega nada. Idempotente: no
-- duplica un permiso que la persona ya tenga como override.

INSERT INTO permisos_usuario_override (usuario_id, permiso_clave, tipo)
SELECT u.id, p.clave, 'grant'
FROM usuarios u
JOIN permisos_catalogo p ON p.clave IN (
    'documentos.laborales.emitir', 'documentos.entrega.registrar', 'trabajadores.crear', 'trabajadores.editar'
)
WHERE u.email IN ('paulamartinez@lols.cl', 'matiasmillanao@lols.cl')
  AND NOT EXISTS (
      SELECT 1 FROM permisos_usuario_override o WHERE o.usuario_id = u.id AND o.permiso_clave = p.clave
  );

INSERT INTO permisos_usuario_override (usuario_id, permiso_clave, tipo)
SELECT u.id, p.clave, 'grant'
FROM usuarios u
JOIN permisos_catalogo p ON p.clave IN ('vehiculos.crear', 'vehiculos.editar')
WHERE u.email = 'leonardolopez@lols.cl'
  AND NOT EXISTS (
      SELECT 1 FROM permisos_usuario_override o WHERE o.usuario_id = u.id AND o.permiso_clave = p.clave
  );
