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

    // TRABAJADORES
    ['trabajadores.ver',            'Trabajadores', 'Ver Trabajadores',          'Ver la lista y fichas de trabajadores', 1],
    ['trabajadores.crear',          'Trabajadores', 'Crear Trabajador',          'Registrar nuevos trabajadores', 2],
    ['trabajadores.editar',         'Trabajadores', 'Editar Trabajador',         'Modificar datos de trabajadores', 3],
    ['trabajadores.eliminar',       'Trabajadores', 'Finiquitar Trabajador',     'Finiquitar o eliminar trabajadores', 4],
    ['trabajadores.reactivar',      'Trabajadores', 'Reactivar Trabajador',      'Reactivar trabajadores finiquitados', 5],
    ['trabajadores.depurar',        'Trabajadores', 'Depurar Trabajador',        'Eliminar permanentemente trabajadores finiquitados', 6],

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
    ['inventario.ver',              'Inventario', 'Ver Inventario',              'Ver el módulo de inventario completo', 1],
    ['inventario.crear',            'Inventario', 'Crear en Inventario',         'Crear solicitudes, transferencias y registros de inventario', 2],
    ['inventario.editar',           'Inventario', 'Editar Inventario',           'Modificar stock, descuentos y registros de inventario', 3],
    ['inventario.aprobar',          'Inventario', 'Aprobar Transferencias',      'Aprobar o rechazar solicitudes de transferencia de equipos', 4],
    ['inventario.eliminar',         'Inventario', 'Eliminar en Inventario',      'Anular o eliminar registros de inventario', 5],

    // SISTEMA
    ['sistema.logs.ver',            'Sistema', 'Ver Historial',                  'Ver el historial de actividad del sistema', 1],
    ['sistema.email.configurar',    'Sistema', 'Configurar Email',               'Configurar credenciales de correo', 2],
    ['sistema.plantillas.gestionar', 'Sistema', 'Gestionar Plantillas',           'Crear y editar plantillas de email', 3],
    ['sistema.tipos_doc.gestionar',  'Sistema', 'Gestionar Tipos Doc.',           'Crear y editar tipos de documento', 4],
    ['sistema.estados.gestionar',    'Sistema', 'Gestionar Estados Asist.',       'Crear y editar estados de asistencia', 5],
    ['sistema.tipos_ausencia.gestionar', 'Sistema', 'Gestionar Tipos Ausencia',   'Crear y editar tipos de ausencia', 6]
];

module.exports = MAESTRO_PERMISOS;
