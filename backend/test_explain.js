const db = require('./src/config/db');

async function testExplain() {
    try {
        console.log('🔍 Testing query plans with EXPLAIN...');

        // 1. Trabajadores query
        const [trab] = await db.query('EXPLAIN SELECT COUNT(*) as count FROM trabajadores t WHERE t.activo = 1 AND t.obra_id = 1');
        console.log('\n--- Query Trabajadores (Expect to use idx_trab_obra_activo) ---');
        console.log('key used:', trab[0].key);
        console.log('type:', trab[0].type);

        // 2. Asistencias trend query
        const [asist] = await db.query(`
            EXPLAIN SELECT a.fecha, 
                SUM(CASE WHEN ea.es_presente = 1 THEN 1 ELSE 0 END) as presentes,
                COUNT(a.id) as total
            FROM asistencias a
            JOIN estados_asistencia ea ON a.estado_id = ea.id
            WHERE a.fecha >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
            AND a.obra_id = 1
            GROUP BY a.fecha
        `);
        console.log('\n--- Query Asistencia (Expect to use idx_asistencias_obra_fecha) ---');
        console.log('key used (Asistencia table):', asist.find(r => r.table === 'a').key);
        console.log('type:', asist.find(r => r.table === 'a').type);

        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}
testExplain();
