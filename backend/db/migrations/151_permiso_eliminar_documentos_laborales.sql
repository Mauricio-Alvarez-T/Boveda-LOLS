-- =============================================
-- 151 — Permiso: eliminar documentos laborales generados por Bóveda
-- =============================================
-- Pedido del dueño (2026-11-06): poder eliminar un documento de «Documentos laborales (Bóveda)»
-- (contrato, finiquito, kit, amonestación…) desde la ficha, al lado de Imprimir y Descargar, y solo
-- con permiso. Permiso propio: `documentos.eliminar` (borrar lo subido) lo tienen más roles y un
-- contrato o finiquito firmado es más delicado.
--
-- Borrado lógico (activo = FALSE, el archivo queda en el servidor). Solo el Super Administrador por
-- defecto; se da a otro rol desde Configuración. Catálogo primero y luego el rol (FK
-- permisos_rol_v2.permiso_clave → permisos_catalogo.clave). Sin `roles.version`: quien lo reciba
-- vuelve a iniciar sesión para verlo (va en el JWT).

INSERT IGNORE INTO permisos_catalogo (clave, modulo, nombre, descripcion, orden) VALUES
    ('documentos.laborales.eliminar', 'Documentos',
     'Eliminar Documentos Laborales',
     'Quitar de la ficha un contrato, finiquito, kit o carta generado por Bóveda (queda en el historial). No se puede si está en un lote de custodia en curso', 7);

INSERT IGNORE INTO permisos_rol_v2 (rol_id, permiso_clave)
VALUES (1, 'documentos.laborales.eliminar');
