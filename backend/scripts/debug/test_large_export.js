const axios = require('axios');
const fs = require('fs');

async function testLargeExport() {
    const workers = [];
    for (let i = 1; i <= 250; i++) {
        workers.push({
            id: i,
            rut: `${10000000 + i}-${i % 10}`,
            nombres: `Trabajador ${i}`,
            apellido_paterno: `Apellido ${i}`,
            empresa_nombre: 'Empresa Test',
            obra_nombre: 'Obra Test',
            cargo_nombre: 'Cargo Test',
            docs_porcentaje: 80,
            activo: true,
            fecha_ingreso: '2024-01-01'
        });
    }

    console.log(`🚀 Probando exportación con ${workers.length} trabajadores...`);

    try {
        // We need a valid token to test this, but since I'm the assistant I'll just check if the payload is accepted
        // by looking at the server logs if possible or assuming local testing by user.
        // For now, let's just create this script for the user or for me to try if I had a token.
        console.log('Payload size approx:', Math.round(JSON.stringify({ trabajadores: workers }).length / 1024), 'KB');

        // Attempt the request (will fail with 401 but let's see if it's a Payload Too Large 413)
        const response = await axios.post('http://localhost:3000/api/fiscalizacion/exportar-excel', {
            trabajadores: workers
        }, {
            headers: { 'Content-Type': 'application/json' },
            validateStatus: false
        });

        console.log('Status code:', response.status);
        if (response.status === 413) {
            console.error('❌ ERROR: Payload disparado (Too Large)');
        } else if (response.status === 401) {
            console.log('✅ Payload aceptado (401 es esperado sin token, pero indica que pasó el middleware de body-parser)');
        } else {
            console.log('Respuesta:', response.data);
        }
    } catch (error) {
        console.error('❌ Error en la conexión:', error.message);
    }
}

testLargeExport();
