const db = require('../config/db');

const permisosService = {
    /**
     * Calcula los permisos finales de un usuario:
     * = (permisos del rol) + (overrides tipo 'grant') - (overrides tipo 'deny')
     * Devuelve un Array<string> con las claves de los permisos.
     */
    async getPermisosEfectivos(usuario_id, rol_id) {
        // 0. Super Administrator (God Mode): Return ALL permissions
        if (rol_id === 1) {
            const [catalogo] = await db.query('SELECT clave FROM permisos_catalogo');
            return catalogo.map(c => c.clave);
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
    }
};

module.exports = permisosService;
