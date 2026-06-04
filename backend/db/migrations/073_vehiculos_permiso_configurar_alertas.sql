-- 073 — Permiso para configurar alertas de vencimiento de vehículos
-- Controla la visibilidad de los campos "Días antes / Email alerta / WhatsApp"
-- en los formularios de seguros, revisiones y mantenciones.
-- La vista del trabajador NO ve estos campos; el admin (rol_id=1) sí.
-- Idempotente: INSERT IGNORE.

INSERT IGNORE INTO permisos_catalogo (clave, modulo, nombre, descripcion, orden) VALUES
    ('vehiculos.configurar_alertas', 'Vehículos', 'Configurar Alertas de Vencimiento',
     'Ver y editar los avisos por email/WhatsApp de seguros, revisiones y mantenciones', 5);

-- Asignar al Super Admin (rol_id=1)
INSERT IGNORE INTO permisos_rol_v2 (rol_id, permiso_clave)
SELECT 1, 'vehiculos.configurar_alertas'
WHERE EXISTS (SELECT 1 FROM permisos_catalogo WHERE clave = 'vehiculos.configurar_alertas');
