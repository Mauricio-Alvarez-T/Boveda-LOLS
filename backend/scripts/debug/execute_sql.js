const fs = require('fs');
const mysql = require('mysql2/promise');
require('dotenv').config();

async function run() {
    try {
        const sql = fs.readFileSync('fix_and_import_miguel.sql', 'utf-8');
        console.log('SQL file read successfully. Connecting to DB...');

        const connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'lols.cl',
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            port: process.env.DB_PORT || 3306,
            multipleStatements: true
        });

        console.log('Connected. Executing script...');
        const [results] = await connection.query(sql);
        console.log('Script execution complete. Results:', results ? results.length + ' statements executed' : 'No result array');
        await connection.end();
    } catch (err) {
        console.error('Error executing SQL:', err);
    }
}

run();
