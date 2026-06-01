/**
 * Listado maestro de permisos del sistema.
 * Esto actúa como la única fuente de verdad real de la aplicación.
 * 
 * Formato: [clave, modulo, nombre, descripcion, orden]
 */
const MAESTRO_PERMISOS = [
    // ASISTENCIA
    ['asistencia.ver',              'Asistencia', 'Ver Asistencia',              'Ver el registro diario de asistencia', 1],
    ['asistencia.guardar',          'Asistencia', 'Guardar Asistencia',          'Guardar cambios en la asistencia diaria', 2],
    ['asistencia.exportar_excel',   'Asistencia', 'Exportar Excel',              'Descargar el reporte mensual en Excel', 3],
    ['asistencia.enviar_whatsapp',  'Asistencia', 'Enviar por WhatsApp',         'Compartir reporte por WhatsApp', 4],
    ['asistencia.periodo.ver',      'Asistencia', 'Ver Períodos',                'Ver los períodos de ausencia asignados', 5],
    ['asistencia.periodo.crear',    'Asistencia', 'Crear Período',               'Asignar períodos de ausencia (licencias, vacaciones, etc.)', 6],
    ['asistencia.periodo.eliminar', 'Asistencia', 'Eliminar Período',            'Borrar períodos de ausencia', 7],
    ['asistencia.feriado.gestionar','Asistencia', 'Gestionar Feriados',          'Marcar/desmarcar días como feriado', 8],
    ['asistencia.horarios.ver',     'Asistencia', 'Ver Horarios',                'Ver la configuración de horarios laborales', 9],
    ['asistencia.horarios.editar',  'Asistencia', 'Editar Horarios',             'Modificar horarios laborales', 10],
    ['asistencia.tomar.global',     'Asistencia', 'Asistencia Global',           'Tomar asistencia de todas las obras simultáneamente', 11],
    ['asistencia.sabados_extra.ver',           'Asistencia', 'Ver Sábados Extra',           'Ver el listado de citaciones de trabajo extraordinario en sábado', 12],
    ['asistencia.sabados_extra.crear',         'Asistencia', 'Crear Citación Sábado',       'Crear citaciones de trabajo extraordinario en sábado', 13],
    ['asistencia.sabados_extra.editar',        'Asistencia', 'Editar Citación Sábado',      'Editar citaciones de trabajo extraordinario en sábado en estado "citada"', 14],
    ['asistencia.sabados_extra.cancelar',      'Asistencia', 'Cancelar Citación Sábado',    'Cancelar citaciones de trabajo extraordinario en sábado', 15],
    ['asistencia.sabados_extra.registrar',     'Asistencia', 'Registrar Asistencia Sábado', 'Marcar asistencia y horas trabajadas el sábado', 16],
    ['asistencia.sabados_extra.enviar_whatsapp','Asistencia','Enviar Sábado por WhatsApp',  'Compartir citación o asistencia de sábado por WhatsApp', 17],
    ['asistencia.horas_extra.ver',  'Asistencia', '$ Ver Horas Extra',           'Asistencia → Vista Diaria y Exportación Excel: si está denegado, oculta las columnas "Horas Extra" y "Horas Sábado" (datos sensibles porque son insumo del cálculo de pago).', 18],

    // TRABAJADORES
    ['trabajadores.ver',            'Trabajadores', 'Ver Trabajadores',          'Ver la lista y fichas de trabajadores', 1],
    ['trabajadores.crear',          'Trabajadores', 'Crear Trabajador',          'Registrar nuevos trabajadores', 2],
    ['trabajadores.editar',         'Trabajadores', 'Editar Trabajador',         'Modificar datos de trabajadores', 3],
    ['trabajadores.eliminar',       'Trabajadores', 'Finiquitar Trabajador',     'Finiquitar o eliminar trabajadores', 4],
    ['trabajadores.reactivar',      'Trabajadores', 'Reactivar Trabajador',      'Reactivar trabajadores finiquitados', 5],
    ['trabajadores.depurar',        'Trabajadores', 'Depurar Trabajador',        'Eliminar permanentemente trabajadores finiquitados', 6],
    ['trabajadores.financiero.ver', 'Trabajadores', '$ Ver Datos Financieros',   'Trabajadores → Ficha del Trabajador: si está denegado, oculta la sección de sueldo base, anticipos y descuentos. (Campos en desarrollo — aún no implementados en la UI.)', 7],
    ['trabajadores.financiero.editar','Trabajadores','$ Editar Datos Financieros','Trabajadores → Ficha del Trabajador: si está denegado, los campos de sueldo, anticipos y descuentos aparecen como solo lectura. Requiere también "Ver Datos Financieros". (Campos en desarrollo.)', 8],

    // DOCUMENTOS
    ['documentos.ver',              'Documentos', 'Ver Documentos',              'Ver la documentación de los trabajadores', 1],
    ['documentos.subir',            'Documentos', 'Subir Documentos',            'Cargar archivos de documentación', 2],
    ['documentos.descargar',        'Documentos', 'Descargar Documentos',        'Descargar archivos individuales o en ZIP', 3],
    ['documentos.eliminar',         'Documentos', 'Eliminar Documentos',         'Eliminar archivos de documentación', 4],

    // REPORTES (Consultas)
    ['reportes.ver',                'Reportes', 'Ver Consultas',                 'Acceder a la sección de Consultas', 1],
    ['reportes.exportar',           'Reportes', 'Exportar Reporte',              'Descargar reportes en Excel', 2],
    ['reportes.enviar_email',       'Reportes', 'Enviar por Email',              'Enviar reportes por correo electrónico', 3],

    // CONFIGURACIÓN: EMPRESAS
    ['empresas.ver',                'Empresas', 'Ver Empresas',                  'Ver el catálogo de empresas', 1],
    ['empresas.crear',              'Empresas', 'Crear Empresa',                 'Registrar nuevas empresas', 2],
    ['empresas.editar',             'Empresas', 'Editar Empresa',                'Modificar datos de empresas', 3],
    ['empresas.eliminar',           'Empresas', 'Eliminar Empresa',              'Eliminar empresas', 4],

    // CONFIGURACIÓN: OBRAS
    ['obras.ver',                   'Obras', 'Ver Obras',                        'Ver el catálogo de obras', 1],
    ['obras.crear',                 'Obras', 'Crear Obra',                       'Registrar nuevas obras', 2],
    ['obras.editar',                'Obras', 'Editar Obra',                      'Modificar datos de obras', 3],
    ['obras.eliminar',              'Obras', 'Eliminar Obra',                    'Eliminar obras', 4],

    // CONFIGURACIÓN: CARGOS
    ['cargos.ver',                  'Cargos', 'Ver Cargos',                      'Ver el catálogo de cargos', 1],
    ['cargos.crear',                'Cargos', 'Crear Cargo',                     'Registrar nuevos cargos', 2],
    ['cargos.editar',               'Cargos', 'Editar Cargo',                    'Modificar cargos', 3],
    ['cargos.eliminar',             'Cargos', 'Eliminar Cargo',                  'Eliminar cargos', 4],

    // CONFIGURACIÓN: USUARIOS Y ROLES
    ['usuarios.ver',                'Usuarios', 'Ver Usuarios',                  'Ver la lista de usuarios del sistema', 1],
    ['usuarios.crear',              'Usuarios', 'Crear Usuario',                 'Registrar nuevos usuarios', 2],
    ['usuarios.editar',             'Usuarios', 'Editar Usuario',                'Modificar datos de usuarios', 3],
    ['usuarios.eliminar',           'Usuarios', 'Eliminar Usuario',              'Eliminar usuarios', 4],
    ['usuarios.roles.ver',          'Usuarios', 'Ver Roles',                     'Ver los roles del sistema', 5],
    ['usuarios.roles.crear',        'Usuarios', 'Crear Rol',                      'Crear nuevos roles', 6],
    ['usuarios.roles.editar',       'Usuarios', 'Editar Rol',                     'Modificar roles y sus permisos', 7],
    ['usuarios.roles.eliminar',     'Usuarios', 'Eliminar Rol',                   'Eliminar roles', 8],
    ['usuarios.permisos.gestionar', 'Usuarios', 'Gestionar Permisos',             'Asignar permisos a roles y usuarios', 9],

    // INVENTARIO
    ['inventario.ver',              'Inventario', 'Ver Inventario',              'Acceso base al módulo de inventario (debe ir acompañado de al menos un permiso de tab abajo)', 1],
    ['inventario.crear',            'Inventario', 'Crear en Inventario',         'Crear solicitudes, transferencias y registros de inventario', 2],
    ['inventario.editar',           'Inventario', 'Editar Inventario',           'Modificar stock, descuentos y registros de inventario', 3],
    ['inventario.aprobar',          'Inventario', 'Aprobar Transferencias',      'Aprobar o rechazar solicitudes de transferencia de equipos', 4],
    ['inventario.eliminar',         'Inventario', 'Eliminar en Inventario',      'Anular o eliminar registros de inventario', 5],
    // Tabs del módulo Inventario — visibilidad granular por tab. Cada permiso
    // gatea sólo la APARICIÓN de la pestaña en el menú superior; los datos $
    // dentro siguen gateados por permisos del módulo "Financiero".
    ['inventario.tab.resumen_ejecutivo','Inventario','Ver Tab Resumen Ejecutivo','Inventario → Pestaña "Resumen Ejecutivo": si está denegado, la pestaña no aparece en el menú superior del módulo.', 6],
    ['inventario.tab.resumen',          'Inventario','Ver Tab Resumen',          'Inventario → Pestaña "Resumen": si está denegado, la pestaña no aparece en el menú superior del módulo.', 7],
    ['inventario.tab.por_ubicacion',    'Inventario','Ver Tab Por Obra/Bodega',  'Inventario → Pestaña "Por Obra/Bodega": si está denegado, la pestaña no aparece en el menú superior del módulo.', 8],
    ['inventario.tab.transferencias',   'Inventario','Ver Tab Transferencias',   'Inventario → Pestaña "Transferencias": si está denegado, la pestaña no aparece en el menú superior del módulo.', 9],
    ['inventario.tab.maestro',          'Inventario','Ver Tab Maestro',          'Inventario → Pestaña "Maestro" (edición de items y stock): si está denegado, la pestaña no aparece. Requiere también "Editar Inventario" para usar las acciones internas.', 10],
    ['inventario.tab.bombas',           'Inventario','Ver Tab Bombas Hormigón',  'Inventario → Pestaña "Bombas Hormigón": si está denegado, la pestaña no aparece en el menú superior del módulo.', 11],
    // Visibilidad transversal en pestaña Transferencias: si está denegado, el
    // listado SÓLO muestra las transferencias cuyo solicitante_id = usuario actual.
    // Sin este permiso, el usuario nunca ve solicitudes de terceros (ni por GET /:id).
    // Default deny — admin debe asignar manualmente a roles que requieran visión
    // global (jefatura, bodega central, aprobadores que necesitan auditar).
    ['inventario.transferencias.ver_todas','Inventario','Ver Todas las Transferencias','Inventario → Pestaña "Transferencias": si está denegado, el usuario sólo ve las solicitudes que él mismo creó. Si está concedido, ve el listado completo de todas las solicitudes del sistema.', 12],
    // ── Permisos granulares del flujo de transferencias (SoD) ──
    // Reemplazan los gates genéricos (`inventario.crear`/`.aprobar`/`.editar`)
    // para separar identidad por rol del flujo: solicitante ≠ aprobador ≠
    // transportista ≠ receptor. SoD se enforcea en backend
    // (transferencia.service.js) — un user con `aprobar` no puede aprobar
    // transferencias que él mismo solicitó, salvo que tenga `sod_bypass`.
    ['inventario.transferencias.solicitar',    'Inventario', 'Solicitar Transferencia',     'Crear solicitudes de transferencia normal, devolución e intra-obra. NO incluye flujos especiales (push directo, intra-bodega, orden gerencia).', 13],
    ['inventario.transferencias.solicitud_materiales', 'Inventario', 'Solicitud de Materiales', 'Crear solicitudes de materiales de construcción (cemento, fierro, áridos, etc.). Flujo con aprobación: pendiente → aprobada → en tránsito → recibida.', 14],
    ['inventario.transferencias.aprobar',      'Inventario', 'Aprobar Transferencia',       'Aprobar o rechazar solicitudes pendientes. SoD: no puede aprobar transferencias que él mismo solicitó (excepto con sod_bypass).', 15],
    ['inventario.transferencias.despachar',    'Inventario', 'Despachar Transferencia',     'Marcar una transferencia aprobada como en tránsito. SoD: no puede despachar transferencias que él mismo aprobó.', 16],
    ['inventario.transferencias.recibir',      'Inventario', 'Recibir Transferencia',       'Confirmar recepción física de una transferencia en tránsito. SoD: no puede recibir transferencias que él mismo despachó.', 17],
    ['inventario.transferencias.cancelar',     'Inventario', 'Cancelar Transferencia',      'Cancelar una transferencia en estado pendiente o aprobada. NO permite cancelar despachadas (en tránsito) — eso requiere el permiso especial "Cancelar en Tránsito".', 18],
    ['inventario.transferencias.cancelar_en_transito', 'Inventario', '⚠️ Cancelar en Tránsito', 'Permite cancelar una transferencia YA DESPACHADA (en tránsito), cuyo stock está físicamente viajando. Acción excepcional reservada a jefatura. Sin este permiso, las despachadas solo se pueden rechazar al recibir.', 23],
    ['inventario.transferencias.push_directo', 'Inventario', '⚠️ Push Directo Bodega→Obra',  'Flujo especial: el usuario despacha stock de bodega a obra sin pasar por aprobación. Consolida solicitante + aprobador + transportista en un solo usuario. Para bodegueros con autoridad operacional.', 19],
    ['inventario.transferencias.intra_bodega', 'Inventario', '⚠️ Movimiento Intra-Bodega',   'Flujo especial: mover stock entre bodegas instantáneamente. Consolida los 4 roles. Para gestión de stock interno.', 20],
    ['inventario.transferencias.orden_gerencia','Inventario','⚠️ Orden de Gerencia',          'Flujo especial: PM/dueño ejecuta movimiento bypaseando aprobación normal. Consolida solicitante + aprobador + transportista. Sólo PM o gerencia.', 21],
    ['inventario.transferencias.sod_bypass',   'Inventario', '⚠️ Bypass SoD',                'Permite ejecutar acciones consecutivas sobre la misma transferencia (solicitar + aprobar + despachar + recibir). Para obras con personal único o emergencias. Audit log obligatorio.', 22],

    // SISTEMA
    ['sistema.logs.ver',            'Sistema', 'Ver Historial',                  'Ver el historial de actividad del sistema', 1],
    ['sistema.email.configurar',    'Sistema', 'Configurar Email',               'Configurar credenciales de correo', 2],
    ['sistema.plantillas.gestionar', 'Sistema', 'Gestionar Plantillas',           'Crear y editar plantillas de email', 3],
    ['sistema.tipos_doc.gestionar',  'Sistema', 'Gestionar Tipos Doc.',           'Crear y editar tipos de documento', 4],
    ['sistema.estados.gestionar',    'Sistema', 'Gestionar Estados Asist.',       'Crear y editar estados de asistencia', 5],
    ['sistema.tipos_ausencia.gestionar', 'Sistema', 'Gestionar Tipos Ausencia',   'Crear y editar tipos de ausencia', 6],
    ['sistema.reportes.gestionar',   'Sistema', 'Gestionar Reportes Automáticos', 'Gestionar destinatarios y enviar prueba del reporte semanal RRHH', 7],

    // ─────────────────────────────────────────────────────────────────────────
    // FINANCIERO — sección transversal que gatea visibilidad de campos $ del
    // módulo INVENTARIO (costos, facturas, bombas, descuentos, resumen).
    // Política deny-by-default: sólo Super Admin los recibe automáticamente;
    // admins asignan al resto manualmente vía PermisosRolPanel o
    // PermisosUsuarioPanel (Overrides).
    //
    // El módulo "Financiero" se detecta por nombre en el frontend para mostrar
    // la sección con badge $ destacado al inicio del modal.
    //
    // Permisos $ de OTROS módulos (asistencia.horas_extra.ver,
    // trabajadores.financiero.*) viven en sus módulos naturales con prefijo
    // "$" en el nombre — separación clara entre $ inventario y $ otros.
    // ─────────────────────────────────────────────────────────────────────────
    ['inventario.costos.ver',           'Financiero', 'Ver Costos de Inventario',         'Inventario → Items y Stock: si está denegado, oculta las columnas y campos "Valor Compra" y "Valor Arriendo" en el formulario del item y en las listas de stock por obra/bodega.', 1],
    ['inventario.costos.editar',        'Financiero', 'Editar Costos de Inventario',      'Inventario → Formulario de Item: si está denegado, los campos "Valor Compra" y "Valor Arriendo" aparecen como solo lectura (no se pueden modificar). Requiere también "Ver Costos de Inventario".', 2],
    ['inventario.facturas.ver',         'Financiero', 'Ver Facturas',                     'Inventario → Pestaña "Facturas": si está denegado, la pestaña completa queda inaccesible (no se ven montos netos, precios unitarios ni detalle de facturas).', 3],
    ['inventario.facturas.gestionar',   'Financiero', 'Gestionar Facturas',               'Inventario → Pestaña "Facturas": si está denegado, el usuario puede ver el listado (si tiene "Ver Facturas") pero no puede crear, editar ni anular facturas con precios.', 4],
    ['inventario.bombas.ver_costos',    'Financiero', 'Ver Costos Bombas Hormigón',       'Inventario → Pestaña "Bombas de Hormigón": si está denegado, oculta la columna "Costo" de cada registro y la tarjeta "Costo Total" del panel resumen.', 5],
    ['inventario.descuentos.gestionar', 'Financiero', 'Gestionar Descuentos Obra',        'Inventario → Stock por Obra: si está denegado, el usuario no puede configurar ni modificar el porcentaje de descuento aplicado a la obra.', 6],
    ['inventario.resumen.ver_valores',  'Financiero', 'Ver Valores en Resumen Ejecutivo', 'Inventario → Pestaña "Resumen Ejecutivo": si está denegado, oculta la tarjeta "Valor obras" (valor bruto/neto) y el ranking "Top Obras por Valor".', 7]
];

// Constante exportada para consumo en frontend (detectar sección destacada)
// y en helpers de sanitización. Mantener sincronizada con las claves del
// bloque "FINANCIERO" arriba (sólo permisos $ de inventario).
const PERMISOS_FINANCIEROS = [
    'inventario.costos.ver',
    'inventario.costos.editar',
    'inventario.facturas.ver',
    'inventario.facturas.gestionar',
    'inventario.bombas.ver_costos',
    'inventario.descuentos.gestionar',
    'inventario.resumen.ver_valores'
];

// Export histórico: `require('./permisos.config')` devuelve el array MAESTRO
// (compatibilidad con `permisos.service.js`). Se adjuntan también propiedades
// nombradas para que nuevos consumidores puedan importarlas:
//   const PERMISOS = require('./permisos.config');                // array
//   const { PERMISOS_FINANCIEROS } = require('./permisos.config'); // subset
module.exports = MAESTRO_PERMISOS;
module.exports.PERMISOS_FINANCIEROS = PERMISOS_FINANCIEROS;
