
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env') });

async function listUsers() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'sgdl'
    });

    try {
        const [rows] = await connection.execute('SELECT id, email, nombre, activo FROM usuarios');
        console.log('USERS_JSON:' + JSON.stringify(rows, null, 2));
    } catch (err) {
        console.error('Error listing users:', err);
    } finally {
        await connection.end();
    }
}

listUsers();
