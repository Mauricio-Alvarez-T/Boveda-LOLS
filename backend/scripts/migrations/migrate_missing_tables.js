/**
 * Creates missing tables for horarios_obra and plantillas_correo.
 * Safe to run multiple times (uses IF NOT EXISTS).
 * 
 * Usage: node migrate_missing_tables.js
 */
require('dotenv').config();
const db = require('./src/config/db');

async function migrate() {
    console.log('🔄 Creating missing tables...\n');

    // 1. horarios_obra table
    await db.query(`
        CREATE TABLE IF NOT EXISTS horarios_obra (
            id INT AUTO_INCREMENT PRIMARY KEY,
            obra_id INT NOT NULL,
            dia_semana INT NOT NULL COMMENT '0=Lunes, 6=Domingo',
            entrada VARCHAR(5) DEFAULT '08:00',
            salida VARCHAR(5) DEFAULT '18:00',
            inicio_colacion VARCHAR(5) DEFAULT NULL,
            fin_colacion VARCHAR(5) DEFAULT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY unique_obra_dia (obra_id, dia_semana),
            FOREIGN KEY (obra_id) REFERENCES obras(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('✅ Tabla horarios_obra creada/verificada');

    // 2. plantillas_correo table
    await db.query(`
        CREATE TABLE IF NOT EXISTS plantillas_correo (
            id INT AUTO_INCREMENT PRIMARY KEY,
            usuario_id INT NOT NULL,
            nombre VARCHAR(255) NOT NULL,
            asunto VARCHAR(500) DEFAULT '',
            cuerpo TEXT DEFAULT '',
            predeterminada TINYINT(1) DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('✅ Tabla plantillas_correo creada/verificada');

    console.log('\n🎉 Migración completada con éxito');
    process.exit(0);
}

migrate().catch(err => {
    console.error('❌ Error en migración:', err.message);
    process.exit(1);
});
