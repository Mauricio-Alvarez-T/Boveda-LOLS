require('dotenv').config();
const db = require('../src/config/db');

async function seed() {
    try {
        console.log('🌱 Seeding document types...');
        const types = [
            { nombre: 'Contrato de Trabajo', dias_vigencia: null, obligatorio: true },
            { nombre: 'Anexo de Contrato', dias_vigencia: null, obligatorio: false },
            { nombre: 'Cédula de Identidad', dias_vigencia: 3650, obligatorio: true },
            { nombre: 'Certificado de Antecedentes', dias_vigencia: 60, obligatorio: true },
            { nombre: 'Liquidación de Sueldo', dias_vigencia: null, obligatorio: false },
            { nombre: 'Finiquito', dias_vigencia: null, obligatorio: false },
            { nombre: 'Examen Preocupacional', dias_vigencia: 365, obligatorio: false },
            { nombre: 'Charla ODI', dias_vigencia: null, obligatorio: true }
        ];

        for (const type of types) {
            // Check if exists manually if UNIQUE name isn't set, otherwise rely on ID or just insert.
            // Using INSERT IGNORE or checking first. Assuming 'nombre' might not be unique in schema, so checking first is safer.
            const [existing] = await db.query('SELECT id FROM tipos_documento WHERE nombre = ?', [type.nombre]);
            if (existing.length === 0) {
                await db.query(`
                    INSERT INTO tipos_documento (nombre, dias_vigencia, obligatorio, activo)
                    VALUES (?, ?, ?, true)
                `, [type.nombre, type.dias_vigencia, type.obligatorio]);
                console.log(`Created: ${type.nombre}`);
            } else {
                console.log(`Skipped (already exists): ${type.nombre}`);
            }
        }
        console.log('✅ Document types seeded successfully.');
        process.exit(0);
    } catch (err) {
        console.error('❌ Error seeding document types:', err);
        process.exit(1);
    }
}

seed();
