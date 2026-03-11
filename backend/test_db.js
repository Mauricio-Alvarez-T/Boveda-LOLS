require('dotenv').config();
const mysql = require('mysql2/promise');

async function checkLizana() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        port: process.env.DB_PORT || 3306
    });

    try {
        console.log("Conectado a la BD.");
        
        // 1. Buscar a Benjamín Lizana
        const [trabajadores] = await connection.query(`
            SELECT id, rut, nombres, apellido_paterno, activo 
            FROM trabajadores 
            WHERE rut LIKE '%22281583%' OR apellido_paterno LIKE '%Lizana%'
        `);
        console.log("\\n--- TRABAJADOR LIZANA ---");
        console.table(trabajadores);

        if (trabajadores.length > 0) {
            const lizanaId = trabajadores[0].id;
            
            // 2. Buscar sus asistencias
            const [asistencias] = await connection.query(`
                SELECT a.id, a.fecha, a.obra_id, ea.codigo, a.horas_extra 
                FROM asistencias a
                JOIN estados_asistencia ea ON a.estado_id = ea.id
                WHERE a.trabajador_id = ?
                ORDER BY a.fecha DESC
                LIMIT 5
            `, [lizanaId]);
            console.log("\\n--- ASISTENCIAS RECIENTES DE LIZANA ---");
            console.table(asistencias);
        }

        // 3. Revisar el rut del usuario (Oficina)
        console.log("\\n--- TRABAJADOR PRUEBA (Oficina) ---");
        const [prueba] = await connection.query(`
            SELECT id, rut, nombres, apellido_paterno, activo 
            FROM trabajadores 
            WHERE apellido_paterno LIKE 'Alvarez%'
        `);
        console.table(prueba);
        
        if (prueba.length > 0) {
             const pruebaId = prueba[0].id;
             const [asistPrueba] = await connection.query(`
                SELECT a.id, a.fecha, a.obra_id, ea.codigo 
                FROM asistencias a
                JOIN estados_asistencia ea ON a.estado_id = ea.id
                WHERE a.trabajador_id = ?
                ORDER BY a.fecha DESC
                LIMIT 5
            `, [pruebaId]);
            console.log("\\n--- ASISTENCIAS DE PRUEBA ---");
            console.table(asistPrueba);
        }

    } catch (err) {
        console.error(err);
    } finally {
        await connection.end();
    }
}

checkLizana();
