require('dotenv').config();
const db = require('./src/config/db');

async function run() {
    try {
        console.log("Adding fecha_desvinculacion to trabajadores...");
        await db.query(`
            ALTER TABLE trabajadores 
            ADD COLUMN fecha_desvinculacion DATE NULL DEFAULT NULL AFTER activo;
        `);
        console.log("Column added or already exists.");
    } catch (e) {
        if (e.code === 'ER_DUP_FIELDNAME') {
            console.log("Column already exists.");
        } else {
            console.error(e);
        }
    } finally {
        process.exit();
    }
}
run();
