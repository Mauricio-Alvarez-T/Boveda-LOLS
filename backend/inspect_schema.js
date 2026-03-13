const db = require('./src/config/db');

async function inspect() {
    try {
        console.log('--- TABLA asistencias ---');
        const [colsA] = await db.query('SHOW COLUMNS FROM asistencias');
        console.log(colsA.map(c => c.Field).join(', '));

        console.log('\n--- TABLA trabajadores ---');
        const [colsT] = await db.query('SHOW COLUMNS FROM trabajadores');
        console.log(colsT.map(c => c.Field).join(', '));

        console.log('\n--- TABLA estados_asistencia ---');
        const [colsE] = await db.query('SHOW COLUMNS FROM estados_asistencia');
        console.log(colsE.map(c => c.Field).join(', '));

    } catch (err) {
        console.error('ERROR:', err.message);
    } finally {
        process.exit();
    }
}

inspect();
