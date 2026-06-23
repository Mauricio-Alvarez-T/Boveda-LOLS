const mysql = require('mysql2/promise');
const logger = require('../utils/logger-structured');

const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'sgdl',
    port: process.env.DB_PORT || 3306,
    waitForConnections: true,
    // Default conservador (10): staging y prod comparten el usuario MySQL
    // `lolscl_boveda` en hosting compartido, donde `max_user_connections` es
    // bajo (~15-25). Un pool alto reventaba con "User ... already has more than
    // 'max_user_connections' active connections" (dejando el dashboard en $0).
    // Afinable por entorno con DB_POOL_LIMIT (p.ej. staging=5, prod=10);
    // waitForConnections:true ENCOLA en vez de abrir de más / rechazar.
    connectionLimit: Number(process.env.DB_POOL_LIMIT) || 10,
    queueLimit: 50,
    charset: 'utf8mb4',
    // Fase 1 plan v2: BOOLEAN/TINYINT(1) → boolean real en todo el API (antes
    // llegaban como 0/1 y obligaban a workarounds !!flag / flagOff en frontend).
    // Solo castea TINY con display width 1 (los BOOLEAN); TINYINT "plano"
    // (ej. periodicidad_anios, width 4) sigue siendo número. NULL se preserva.
    typeCast: (field, next) => {
        if (field.type === 'TINY' && field.length === 1) {
            const v = field.string();
            return v === null ? null : v === '1';
        }
        return next();
    }
});

// Test connection on startup
pool.getConnection()
    .then(conn => {
        logger.info('MySQL conectado correctamente');
        conn.release();
    })
    .catch(err => {
        logger.error('Error conectando a MySQL', { err: err.message });
    });

module.exports = pool;
