const db = require('../config/db');
const logger = require('../utils/logger-structured');

// Lock-out safety del Super Administrador: estos permisos NUNCA se le pueden
// denegar vía override. Garantiza recuperación si se prueba con la propia cuenta.
const SAFE_KEYS_SUPER_ADMIN = new Set([
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

/**
 * LA regla, pura (sin BD): de la base y los overrides de una persona, sus permisos con el origen de cada uno.
 *   - Rol 1 (Super Administrator, `rol_id === 1`): la base es TODO el catálogo (God Mode). Antes los overrides se
 *     ignoraban completamente, pero eso hacía imposible que un Super Admin probara escenarios de "denegar acceso a
 *     info $" sobre sí mismo. Ahora aplicamos overrides deny SOLO si la clave NO está en SAFE_KEYS — así el admin
 *     nunca puede bloquearse acceso a la gestión de usuarios/permisos y siempre tiene forma de revertir el
 *     experimento. Un 'grant' no aplica: ya tiene todo.
 *   - El resto: (permisos del rol) + (overrides 'grant') − (overrides 'deny'), en el orden en que llegan.
 * La usan `detallePermisos` (una persona: el login, /auth/me, la ficha de Soporte) y el Panorama de Soporte (todas
 * las personas, con los datos leídos en lote): el mismo cálculo, no un segundo.
 * @param {number} rol_id
 * @param {Iterable<string>} baseClaves  permisos del rol (rol 1: las claves del catálogo)
 * @param {Array<{permiso_clave: string, tipo: string}>} overrides  los de ESA persona
 */
function componerPermisos(rol_id, baseClaves, overrides) {
    const base = new Set(baseClaves);
    const permisos = new Set(base);
    const superAdmin = rol_id === 1;
    for (const ov of overrides || []) {
        if (superAdmin) {
            if (ov.tipo === 'deny' && !SAFE_KEYS_SUPER_ADMIN.has(ov.permiso_clave)) permisos.delete(ov.permiso_clave);
        } else {
            if (ov.tipo === 'grant') permisos.add(ov.permiso_clave);
            if (ov.tipo === 'deny') permisos.delete(ov.permiso_clave);
        }
    }
    const efectivos = Array.from(permisos);
    return {
        efectivos,
        base: Array.from(base),
        propios: efectivos.filter(k => !base.has(k)),
        quitados: Array.from(base).filter(k => !permisos.has(k)),
    };
}

const permisosService = {
    componerPermisos,

    /**
     * EL cálculo de los permisos de un usuario, con el ORIGEN de cada uno. Lo usan el login, /auth/me
     * (vía getPermisosEfectivos) y la ficha de «Soporte · usuarios»: un solo cálculo, no se duplica
     * (la regla está en `componerPermisos`; aquí solo se lee lo de esa persona).
     *   efectivos = (permisos del rol) + (overrides tipo 'grant') - (overrides tipo 'deny')
     * Devuelve:
     *   - `efectivos`: Array<string> con las claves finales (lo que viaja en el JWT como `p`);
     *   - `base`: las del rol (rol 1: todo el catálogo);
     *   - `propios`: efectivas que NO vienen del rol (override 'grant');
     *   - `quitados`: del rol, pero que la persona no tiene (override 'deny').
     */
    async detallePermisos(usuario_id, rol_id) {
        let base;
        if (rol_id === 1) {
            // Super Administrator: parte con TODOS los permisos del catálogo (ver componerPermisos).
            const [catalogo] = await db.query('SELECT clave FROM permisos_catalogo');
            base = catalogo.map(c => c.clave);
        } else {
            const [rolPermisos] = await db.query(
                'SELECT permiso_clave FROM permisos_rol_v2 WHERE rol_id = ?',
                [rol_id]
            );
            base = rolPermisos.map(r => r.permiso_clave);
        }
        const [overrides] = await db.query(
            'SELECT permiso_clave, tipo FROM permisos_usuario_override WHERE usuario_id = ?',
            [usuario_id]
        );
        return componerPermisos(rol_id, base, overrides);
    },

    /**
     * Calcula los permisos finales de un usuario:
     * = (permisos del rol) + (overrides tipo 'grant') - (overrides tipo 'deny')
     * Devuelve un Array<string> con las claves de los permisos.
     */
    async getPermisosEfectivos(usuario_id, rol_id) {
        return (await permisosService.detallePermisos(usuario_id, rol_id)).efectivos;
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
            logger.info(`Catálogo de Permisos Sincronizado (${MAESTRO_PERMISOS.length} permisos).`);
        } catch (error) {
            logger.error('Error sincronizando catálogo de permisos', { err: error.message });
        }
    }
};

module.exports = permisosService;
