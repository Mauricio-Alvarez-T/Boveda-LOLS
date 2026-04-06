const fs = require('fs');
const path = require('path');
const db = require('./src/config/db');

async function runOpt() {
    try {
        console.log('🚀 Running 010_optimizacion_db.sql...');
        const sqlPath = path.join(__dirname, 'db/migrations/010_optimizacion_db.sql');
        const sqlStr = fs.readFileSync(sqlPath, 'utf8');

        const statements = sqlStr.split(';')
            .map(s => s.trim())
            .filter(s => s.length > 0 && !s.startsWith('--'));

        for (let s of statements) {
            // Eliminar comentarios en la misma línea y otras cosas que no sean código SQL puro si es necesario, pero suele bastar
            if (s && s.toLowerCase().indexOf('alter') >= 0 || s.toLowerCase().indexOf('create') >= 0 || s.toLowerCase().indexOf('update') >= 0) {
                console.log('Executing:', s.substring(0, 50) + '...');
                await db.query(s);
            }
        }
        console.log('✅ Database optimization and normalization complete.');
        process.exit(0);
    } catch (err) {
        console.error('❌ Error applying optimization:', err);
        process.exit(1);
    }
}

runOpt();
