const mysql = require('mysql2/promise');

const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'sgdl',
    port: process.env.DB_PORT || 3306,
    waitForConnections: true,
    // Tunable por env (insurance ante picos multi-usuario; las queries son rápidas
    // y liberan pronto). waitForConnections:true encola en vez de rechazar.
    connectionLimit: Number(process.env.DB_POOL_LIMIT) || 50,
    queueLimit: 50,
    charset: 'utf8mb4'
});

// Test connection on startup
pool.getConnection()
    .then(conn => {
        console.log('✅ MySQL conectado correctamente');
        conn.release();
    })
    .catch(err => {
        console.error('❌ Error conectando a MySQL:', err.message);
    });

module.exports = pool;
