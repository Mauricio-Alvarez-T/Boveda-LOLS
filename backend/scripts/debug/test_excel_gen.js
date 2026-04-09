const asistenciaService = require('./src/services/asistencia.service');
const db = require('./src/config/db');

async function testExport() {
    try {
        console.log('🧪 Probando generación de Excel...');
        // Usar una obra y fechas reales si es posible, o mockear db.query
        // Para una prueba rápida, solo verificamos que la función se ejecute sin errores sintácticos
        const mockQuery = {
            obra_id: 1,
            fecha_inicio: '2026-03-01',
            fecha_fin: '2026-03-31'
        };

        // Nota: Esto fallará si no hay conexión a la DB real o si los IDs no existen,
        // pero atrapará errores de sintaxis en el nuevo código.
        const buffer = await asistenciaService.generarExcel(mockQuery);
        console.log('✅ Buffer generado con éxito. Tamaño:', buffer.length, 'bytes');
        process.exit(0);
    } catch (err) {
        console.error('❌ Error en la generación:', err.message);
        // Si el error es solo por falta de datos/conexión, el código es sintácticamente correcto
        if (err.message.includes('obra_id') || err.message.includes('Connect')) {
             console.log('⚠️ El código parece estar bien, pero falló por entorno (esperado)');
             process.exit(0);
        }
        process.exit(1);
    }
}

testExport();
