const feriadosService = require('./src/services/feriados.service');
require('dotenv').config();

async function sync() {
    try {
        console.log('🔄 Sincronizando feriados 2025...');
        const result = await feriadosService.syncNacionalHolidays(2025);
        console.log(`✅ Sincronización exitosa: ${result.count} feriados cargados.`);
        
        console.log('🔄 Sincronizando feriados 2024 (por si acaso)...');
        const result2 = await feriadosService.syncNacionalHolidays(2024);
        console.log(`✅ Sincronización exitosa: ${result2.count} feriados cargados.`);
        
        process.exit(0);
    } catch (err) {
        console.error('❌ Error sincronizando:', err);
        process.exit(1);
    }
}

sync();
