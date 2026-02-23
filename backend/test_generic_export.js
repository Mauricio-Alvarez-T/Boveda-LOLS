const createCrudService = require('./src/services/crud.service');

async function test() {
    console.log('Testing generic excel export...');
    const service = createCrudService('empresas', { searchFields: ['rut', 'razon_social'] });

    try {
        const buffer = await service.exportToExcel({}, 'Empresas');
        console.log('Export successful, buffer size:', buffer.length);
        if (buffer.length > 1000) {
            console.log('✅ TEST PASSED');
        } else {
            console.log('❌ TEST FAILED: Buffer too small');
        }
        process.exit(0);
    } catch (err) {
        console.error('❌ TEST FAILED:', err);
        process.exit(1);
    }
}

test();
