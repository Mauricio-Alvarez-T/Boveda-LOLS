require('dotenv').config();
const db = require('./src/config/db');

async function migrate() {
    try {
        console.log('--- Iniciando Migración de Estados v10 ---');
        
        // 1. Obtener IDs de Atrasos y JI
        const [atrasos] = await db.query('SELECT id, nombre, codigo FROM estados_asistencia WHERE codigo = "AT" OR nombre LIKE "%atraso%"');
        const [ji] = await db.query('SELECT id FROM estados_asistencia WHERE codigo = "JI"');
        
        if (ji.length === 0) {
            console.error('Error: No se encontró el estado JI (Jornada Incompleta).');
            process.exit(1);
        }

        const jiId = ji[0].id;

        for (const a of atrasos) {
            console.log(`Migrando registros de "${a.nombre}" (${a.codigo}) -> JI...`);
            const [updateRes] = await db.query('UPDATE asistencias SET estado_id = ? WHERE estado_id = ?', [jiId, a.id]);
            console.log(`- ${updateRes.affectedRows} registros actualizados.`);
            await db.query('UPDATE estados_asistencia SET activo = 0 WHERE id = ?', [a.id]);
        }

        // 2. Permisos Legales (PL)
        const [pl] = await db.query('SELECT id FROM estados_asistencia WHERE codigo = "PL"');
        let plId;
        if (pl.length === 0) {
            console.log('Creando nuevo estado PL (Permisos Legales)...');
            const [res] = await db.query('INSERT INTO estados_asistencia (nombre, codigo, color, es_presente, activo) VALUES ("Permisos Legales", "PL", "#9333ea", 0, 1)');
            plId = res.insertId;
        } else {
            plId = pl[0].id;
        }

        // 3. Migrar Nacimiento, Defunción, Matrimonio a PL
        const targets = ['NAC', 'DEF', 'MAT'];
        for (const t of targets) {
            const [old] = await db.query('SELECT id, nombre FROM estados_asistencia WHERE codigo = ?', [t]);
            if (old.length > 0) {
                console.log(`Migrando registros de "${old[0].nombre}" -> PL...`);
                const [updateRes] = await db.query('UPDATE asistencias SET estado_id = ? WHERE estado_id = ?', [plId, old[0].id]);
                console.log(`- ${updateRes.affectedRows} registros actualizados.`);
                await db.query('UPDATE estados_asistencia SET activo = 0 WHERE id = ?', [old[0].id]);
            }
        }

        console.log('--- Migración Completada Exitosamente ---');
        process.exit(0);
    } catch (e) {
        console.error('ERROR EN MIGRACIÓN:', e);
        process.exit(1);
    }
}

migrate();
