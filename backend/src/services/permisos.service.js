const db = require('../config/db');

const permisosService = {
    /**
     * Calcula los permisos finales de un usuario:
     * = (permisos del rol) + (overrides tipo 'grant') - (overrides tipo 'deny')
     * Devuelve un Array<string> con las claves de los permisos.
     */
    async getPermisosEfectivos(usuario_id, rol_id) {
        // 0. Super Administrator (rol_id === 1): parte con TODOS los permisos del
        //    catálogo (God Mode). Antes los overrides se ignoraban completamente,
        //    pero eso hacía imposible que un Super Admin probara escenarios de
        //    "denegar acceso a info $" sobre sí mismo. Ahora aplicamos overrides
        //    deny SOLO si la clave NO está en SAFE_KEYS — así el admin nunca puede
        //    bloquearse acceso a la gestión de usuarios/permisos y siempre tiene
        //    forma de revertir el experimento.
        if (rol_id === 1) {
            const [catalogo] = await db.query('SELECT clave FROM permisos_catalogo');
            const all = new Set(catalogo.map(c => c.clave));

            // Lock-out safety: estos permisos NUNCA se pueden denegar al Super
            // Admin vía override. Garantiza recuperación si se prueba con la
            // propia cuenta.
            const SAFE_KEYS = new Set([
                'usuarios.ver',
                'usuarios.crear',
                'usuarios.editar',
                'usuarios.eliminar',
                'usuarios.roles.ver',
                'usuarios.roles.crear',
                'usuarios.roles.editar',
                'usuarios.roles.eliminar',
                'usuarios.permisos.gestionar',
                'sistema.logs.ver',
            ]);

            const [adminOverrides] = await db.query(
                'SELECT permiso_clave, tipo FROM permisos_usuario_override WHERE usuario_id = ?',
                [usuario_id]
            );
            for (const ov of adminOverrides) {
                if (ov.tipo === 'deny' && !SAFE_KEYS.has(ov.permiso_clave)) {
                    all.delete(ov.permiso_clave);
                }
                // 'grant' no aplica: Super Admin ya tiene todo.
            }
            return Array.from(all);
        }

        // 1. Obtener permisos base del rol
        const [rolPermisos] = await db.query(
            'SELECT permiso_clave FROM permisos_rol_v2 WHERE rol_id = ?',
            [rol_id]
        );
        const permisos = new Set(rolPermisos.map(r => r.permiso_clave));

        // 2. Obtener overrides del usuario
        const [overrides] = await db.query(
            'SELECT permiso_clave, tipo FROM permisos_usuario_override WHERE usuario_id = ?',
            [usuario_id]
        );

        for (const ov of overrides) {
            if (ov.tipo === 'grant') permisos.add(ov.permiso_clave);
            if (ov.tipo === 'deny') permisos.delete(ov.permiso_clave);
        }

        return Array.from(permisos);
    },

    /** Devuelve el catálogo completo agrupado por módulo */
    async getCatalogo() {
        const [rows] = await db.query(
            'SELECT clave, modulo, nombre, descripcion FROM permisos_catalogo ORDER BY modulo, orden'
        );
        
        // Agrupar por módulo
        const grouped = {};
        for (const r of rows) {
            if (!grouped[r.modulo]) grouped[r.modulo] = [];
            grouped[r.modulo].push(r);
        }
        return grouped;
    },

    /** Obtener permisos de un rol (v2) */
    async getPermisosRol(rol_id) {
        const [rows] = await db.query(
            'SELECT permiso_clave FROM permisos_rol_v2 WHERE rol_id = ?',
            [rol_id]
        );
        return rows.map(r => r.permiso_clave);
    },

    /** Guardar permisos de un rol (bulk replace) */
    async setPermisosRol(rol_id, claves) {
        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();
            
            // Eliminar actuales
            await conn.query('DELETE FROM permisos_rol_v2 WHERE rol_id = ?', [rol_id]);
            
            // Insertar nuevos si hay
            if (claves && claves.length > 0) {
                const values = claves.map(c => [rol_id, c]);
                await conn.query(
                    'INSERT INTO permisos_rol_v2 (rol_id, permiso_clave) VALUES ?',
                    [values]
                );
            }
            
            await conn.commit();
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }
    },

    /** Obtener overrides de un usuario */
    async getOverrides(usuario_id) {
        const [rows] = await db.query(
            'SELECT permiso_clave, tipo FROM permisos_usuario_override WHERE usuario_id = ?',
            [usuario_id]
        );
        return rows;
    },

    /** Guardar overrides de un usuario (bulk replace) */
    async setOverrides(usuario_id, overrides) {
        // overrides = [{ permiso_clave: 'x', tipo: 'grant'|'deny' }, ...]
        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();
            
            // Eliminar actuales
            await conn.query('DELETE FROM permisos_usuario_override WHERE usuario_id = ?', [usuario_id]);
            
            // Insertar nuevos si hay
            if (overrides && overrides.length > 0) {
                const values = overrides.map(o => [usuario_id, o.permiso_clave, o.tipo]);
                await conn.query(
                    'INSERT INTO permisos_usuario_override (usuario_id, permiso_clave, tipo) VALUES ?',
                    [values]
                );
            }
            
            await conn.commit();
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }
    },

    /** 
     * Sincroniza el catálogo de permisos en la DB con el archivo de configuración maestro.
     * Inserta los faltantes y actualiza los existentes según su clave.
     * Llamado en el arranque de la aplicación.
     */
    async syncCatalogoEnArranque() {
        try {
            const MAESTRO_PERMISOS = require('../config/permisos.config');
            if (!MAESTRO_PERMISOS || MAESTRO_PERMISOS.length === 0) return;

            // ON DUPLICATE KEY UPDATE ensures descriptions and names stay updated
            // This guarantees that any new permission added to the config becomes available.
            await db.query(
                `INSERT INTO permisos_catalogo (clave, modulo, nombre, descripcion, orden) 
                 VALUES ? 
                 ON DUPLICATE KEY UPDATE 
                 nombre = VALUES(nombre), 
                 descripcion = VALUES(descripcion), 
                 orden = VALUES(orden),
                 modulo = VALUES(modulo)`,
                [MAESTRO_PERMISOS]
            );
            console.log(`✅ Catálogo de Permisos Sincronizado (${MAESTRO_PERMISOS.length} permisos).`);
        } catch (error) {
            console.error('❌ Error sincronizando catálogo de permisos:', error.message);
        }
    }
};

module.exports = permisosService;
