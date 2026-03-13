const fs = require('fs');
const path = require('path');

// Manual .env loading
const envPath = path.join(__dirname, '../backend/.env');
if (fs.existsSync(envPath)) {
    const envConfig = fs.readFileSync(envPath, 'utf8');
    envConfig.split('\n').forEach(line => {
        const [key, value] = line.split('=');
        if (key && value) {
            process.env[key.trim()] = value.trim();
        }
    });
}

const db = require('../backend/src/config/db');

async function run() {
    try {
        console.log('--- Current States ---');
        const [states] = await db.query('SELECT * FROM estados_asistencia');
        console.log(JSON.stringify(states, null, 2));

        console.log('\n--- Updating 1/2 to JI ---');
        const [updateJI] = await db.query("UPDATE estados_asistencia SET nombre = 'Jornada Incompleta (JI)', codigo = 'JI' WHERE codigo = '1/2'");
        console.log('Update JI:', updateJI.affectedRows, 'rows');

        console.log('\n--- Refining Absence States ---');
        // Rename 'Falta' to 'Falta Injustificada' if it exists or consolidate
        // We want only 'Falta Justificada' and 'Falta Injustificada'
        // Let's see what we have first.
        
        const [updatedStates] = await db.query('SELECT * FROM estados_asistencia');
        console.log('\n--- Updated States ---');
        console.log(JSON.stringify(updatedStates, null, 2));

        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

run();
