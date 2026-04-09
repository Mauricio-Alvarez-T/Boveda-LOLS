require('dotenv').config();
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

async function runMigration() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        port: process.env.DB_PORT || 3306,
        multipleStatements: true
    });

    try {
        const sql = fs.readFileSync(path.join(__dirname, 'db/migrations/012_periodos_ausencia.sql'), 'utf8');
        console.log('Ejecutando migración 012_periodos_ausencia.sql...');
        await connection.query(sql);
        console.log('✅ Migración ejecutada exitosamente');
        
        // Verify
        const [tables] = await connection.query("SHOW TABLES LIKE 'periodos_ausencia'");
        console.log('Tabla periodos_ausencia existe:', tables.length > 0);
        
        const [cols] = await connection.query("DESCRIBE periodos_ausencia");
        console.table(cols.map(c => ({ Field: c.Field, Type: c.Type, Key: c.Key })));
    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        await connection.end();
    }
}

runMigration();
