const db = require('./src/config/db');
const fs = require('fs');
const path = require('path');

async function runMigration() {
    try {
        const sqlPath = path.join(__dirname, 'db', 'migrations', '014_feriados.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');
        
        // Split by semicolon (naive but works for simple migrations)
        const commands = sql.split(';').filter(cmd => cmd.trim());
        
        for (const cmd of commands) {
            await db.query(cmd);
            console.log('Executed:', cmd.substring(0, 50) + '...');
        }
        
        console.log('✅ Migración 014_feriados completada con éxito');
        process.exit(0);
    } catch (err) {
        console.error('❌ Error ejecutando migración:', err.message);
        process.exit(1);
    }
}

runMigration();
