require('dotenv').config();
const db = require('./src/config/db');

async function migrate() {
    console.log('🚀 Iniciando migración de permisos granulares...');
    
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        // 1. Crear tabla permisos_catalogo
        console.log('--- Creando tabla permisos_catalogo ---');
        await connection.query(`
            CREATE TABLE IF NOT EXISTS permisos_catalogo (
                id INT AUTO_INCREMENT PRIMARY KEY,
                clave VARCHAR(100) NOT NULL UNIQUE,
                modulo VARCHAR(50) NOT NULL,
                nombre VARCHAR(100) NOT NULL,
                descripcion VARCHAR(255) DEFAULT NULL,
                orden INT DEFAULT 0
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        // 2. Crear tabla permisos_rol_v2
        console.log('--- Creando tabla permisos_rol_v2 ---');
        await connection.query(`
            CREATE TABLE IF NOT EXISTS permisos_rol_v2 (
                rol_id INT NOT NULL,
                permiso_clave VARCHAR(100) NOT NULL,
                PRIMARY KEY (rol_id, permiso_clave),
                FOREIGN KEY (rol_id) REFERENCES roles(id) ON DELETE CASCADE,
                FOREIGN KEY (permiso_clave) REFERENCES permisos_catalogo(clave) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        // 3. Crear tabla permisos_usuario_override
        console.log('--- Creando tabla permisos_usuario_override ---');
        await connection.query(`
            CREATE TABLE IF NOT EXISTS permisos_usuario_override (
                usuario_id INT NOT NULL,
                permiso_clave VARCHAR(100) NOT NULL,
                tipo ENUM('grant', 'deny') NOT NULL,
                PRIMARY KEY (usuario_id, permiso_clave),
                FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
                FOREIGN KEY (permiso_clave) REFERENCES permisos_catalogo(clave) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        // 4. Poblar catálogo maestro
        console.log('--- Poblando catálogo maestro de permisos ---');
        const permisos = [
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

            // TRABAJADORES
            ['trabajadores.ver',            'Trabajadores', 'Ver Trabajadores',          'Ver la lista y fichas de trabajadores', 1],
            ['trabajadores.crear',          'Trabajadores', 'Crear Trabajador',          'Registrar nuevos trabajadores', 2],
            ['trabajadores.editar',         'Trabajadores', 'Editar Trabajador',         'Modificar datos de trabajadores', 3],
            ['trabajadores.eliminar',       'Trabajadores', 'Finiquitar Trabajador',     'Finiquitar o eliminar trabajadores', 4],
            ['trabajadores.reactivar',      'Trabajadores', 'Reactivar Trabajador',      'Reactivar trabajadores finiquitados', 5],
            ['trabajadores.purgar',         'Trabajadores', 'Purgar Trabajador',         'Eliminar permanentemente trabajadores finiquitados', 6],

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

            // SISTEMA
            ['sistema.logs.ver',            'Sistema', 'Ver Historial',                  'Ver el historial de actividad del sistema', 1],
            ['sistema.email.configurar',    'Sistema', 'Configurar Email',               'Configurar credenciales de correo', 2],
            ['sistema.plantillas.gestionar', 'Sistema', 'Gestionar Plantillas',           'Crear y editar plantillas de email', 3],
            ['sistema.tipos_doc.gestionar',  'Sistema', 'Gestionar Tipos Doc.',           'Crear y editar tipos de documento', 4],
            ['sistema.estados.gestionar',    'Sistema', 'Gestionar Estados Asist.',       'Crear y editar estados de asistencia', 5],
            ['sistema.tipos_ausencia.gestionar', 'Sistema', 'Gestionar Tipos Ausencia',   'Crear y editar tipos de ausencia', 6]
        ];

        await connection.query(
            'INSERT IGNORE INTO permisos_catalogo (clave, modulo, nombre, descripcion, orden) VALUES ?',
            [permisos]
        );

        // 5. MIGRACIÓN DE DATOS EXISTENTES
        console.log('--- Migrando datos desde permisos_rol antiguos ---');
        
        const currentPermsMappping = [
            { oldMod: 'asistencia', can: 'puede_ver', newKeys: ['asistencia.ver', 'asistencia.periodo.ver', 'asistencia.horarios.ver'] },
            { oldMod: 'asistencia', can: 'puede_crear', newKeys: ['asistencia.guardar', 'asistencia.periodo.crear', 'asistencia.enviar_whatsapp'] },
            { oldMod: 'asistencia', can: 'puede_editar', newKeys: ['asistencia.guardar', 'asistencia.periodo.eliminar', 'asistencia.horarios.editar', 'asistencia.feriado.gestionar'] },
            { oldMod: 'asistencia', can: 'puede_eliminar', newKeys: ['asistencia.periodo.eliminar'] },
            
            { oldMod: 'trabajadores', can: 'puede_ver', newKeys: ['trabajadores.ver'] },
            { oldMod: 'trabajadores', can: 'puede_crear', newKeys: ['trabajadores.crear'] },
            { oldMod: 'trabajadores', can: 'puede_editar', newKeys: ['trabajadores.editar', 'trabajadores.reactivar'] },
            { oldMod: 'trabajadores', can: 'puede_eliminar', newKeys: ['trabajadores.eliminar'] },
            
            { oldMod: 'documentos', can: 'puede_ver', newKeys: ['documentos.ver', 'documentos.descargar', 'reportes.ver'] },
            { oldMod: 'documentos', can: 'puede_crear', newKeys: ['documentos.subir', 'reportes.exportar', 'reportes.enviar_email'] },
            { oldMod: 'documentos', can: 'puede_editar', newKeys: ['documentos.subir'] },
            { oldMod: 'documentos', can: 'puede_eliminar', newKeys: ['documentos.eliminar'] },
            
            { oldMod: 'empresas', can: 'puede_ver', newKeys: ['empresas.ver'] },
            { oldMod: 'empresas', can: 'puede_crear', newKeys: ['empresas.crear'] },
            { oldMod: 'empresas', can: 'puede_editar', newKeys: ['empresas.editar'] },
            { oldMod: 'empresas', can: 'puede_eliminar', newKeys: ['empresas.eliminar'] },
            
            { oldMod: 'obras', can: 'puede_ver', newKeys: ['obras.ver'] },
            { oldMod: 'obras', can: 'puede_crear', newKeys: ['obras.crear'] },
            { oldMod: 'obras', can: 'puede_editar', newKeys: ['obras.editar'] },
            { oldMod: 'obras', can: 'puede_eliminar', newKeys: ['obras.eliminar'] },
            
            { oldMod: 'cargos', can: 'puede_ver', newKeys: ['cargos.ver'] },
            { oldMod: 'cargos', can: 'puede_crear', newKeys: ['cargos.crear'] },
            { oldMod: 'cargos', can: 'puede_editar', newKeys: ['cargos.editar'] },
            { oldMod: 'cargos', can: 'puede_eliminar', newKeys: ['cargos.eliminar'] },
            
            { oldMod: 'usuarios', can: 'puede_ver', newKeys: ['usuarios.ver', 'usuarios.roles.ver', 'sistema.logs.ver'] },
            { oldMod: 'usuarios', can: 'puede_crear', newKeys: ['usuarios.crear', 'usuarios.roles.crear'] },
            { oldMod: 'usuarios', can: 'puede_editar', newKeys: ['usuarios.editar', 'usuarios.roles.editar', 'usuarios.permisos.gestionar'] },
            { oldMod: 'usuarios', can: 'puede_eliminar', newKeys: ['usuarios.eliminar', 'usuarios.roles.eliminar'] }
        ];

        const [oldRows] = await connection.query('SELECT * FROM permisos_rol');
        if (oldRows.length > 0) {
            console.log(`Encontrados ${oldRows.length} registros de permisos antiguos. Mapeando...`);
            let insertValues = [];
            
            for (const row of oldRows) {
                for (const map of currentPermsMappping) {
                    if (row.modulo === map.oldMod && row[map.can] === 1) {
                        for (const key of map.newKeys) {
                            insertValues.push([row.rol_id, key]);
                        }
                    }
                }
            }
            
            if (insertValues.length > 0) {
                await connection.query(
                    'INSERT IGNORE INTO permisos_rol_v2 (rol_id, permiso_clave) VALUES ?',
                    [insertValues]
                );
                console.log(`✅ ${insertValues.length} asociaciones de permisos migradas exitosamente.`);
            }
        }

        await connection.commit();
        console.log('✅ Migración finalizada correctamente.');
    } catch (err) {
        if (connection) await connection.rollback();
        console.error('❌ Error durante la migración:', err);
        process.exit(1);
    } finally {
        if (connection) connection.release();
        process.exit(0);
    }
}

migrate();
