require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const db = require('../src/config/db');

(async () => {
    try {
        console.log("🚀 Iniciando migraciones de mantenimiento...");
        
        // 1. Column for worker termination date
        await db.query(`ALTER TABLE trabajadores ADD COLUMN IF NOT EXISTS fecha_desvinculacion DATE NULL DEFAULT NULL`);
        
        // 2. Versioning for roles to invalidate sessions
        await db.query(`ALTER TABLE roles ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1`);
        
        // 3. Permiso de depurar (antiguamente purgar)
        // a. Insertar nuevo
        await db.query(`
            INSERT IGNORE INTO permisos_catalogo (clave, modulo, nombre, descripcion, orden) 
            VALUES ('trabajadores.depurar', 'Trabajadores', 'Depurar Trabajador', 'Eliminar permanentemente trabajadores finiquitados', 6)
        `);
        // b. Actualizar dependencias (evita error de FK ON DELETE CASCADE)
        await db.query(`UPDATE permisos_rol_v2 SET permiso_clave = 'trabajadores.depurar' WHERE permiso_clave = 'trabajadores.purgar'`);
        await db.query(`UPDATE permisos_usuario_override SET permiso_clave = 'trabajadores.depurar' WHERE permiso_clave = 'trabajadores.purgar'`);
        // c. Eliminar la clave antigua
        await db.query(`DELETE FROM permisos_catalogo WHERE clave = 'trabajadores.purgar'`);

        console.log("✅ Esquema de base de datos verificado y actualizado");
        
        // 4. Sincronizar Catálogo de Permisos Maestro
        const permisosService = require('../src/services/permisos.service');
        await permisosService.syncCatalogoEnArranque();
        console.log("✅ Catálogo de permisos sincronizado perfectamente");
        
    } catch (err) {
        console.error("❌ Error al actualizar esquema BD o catálogo:", err.message);
        process.exit(1);
    } finally {
        process.exit(0);
    }
})();
