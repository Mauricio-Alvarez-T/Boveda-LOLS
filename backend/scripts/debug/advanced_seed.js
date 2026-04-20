const db = require('./src/config/db');
const bcrypt = require('bcryptjs');

async function seed() {
    console.log('🚀 Iniciando Super Seed de datos...');

    try {
        // 1. Limpiar algunas tablas para evitar duplicados si se corre varias veces
        // (Opcional, pero útil para pruebas limpias)
        // await db.query('SET FOREIGN_KEY_CHECKS = 0');
        // await db.query('TRUNCATE TABLE asistencias');
        // await db.query('TRUNCATE TABLE documentos');
        // await db.query('TRUNCATE TABLE trabajadores');
        // await db.query('SET FOREIGN_KEY_CHECKS = 1');

        // 2. Cargos
        const cargos = [
            'Administrador de Obra', 'Jefe de Terreno', 'Prevencionista de Riesgos',
            'Capataz', 'Maestro Mayor', 'Maestro Primera', 'Ayudante', 'Jornal',
            'Operador de Grúa', 'Bodeguero'
        ];
        for (const c of cargos) {
            await db.query('INSERT IGNORE INTO cargos (nombre) VALUES (?)', [c]);
        }
        const [cargoRows] = await db.query('SELECT id FROM cargos');
        const cargoIds = cargoRows.map(r => r.id);

        // 3. Empresas
        const empresas = [
            { rut: '76.111.222-3', nombre: 'Constructora Alfa S.A.', dir: 'Av. Kennedy 5400, Vitacura' },
            { rut: '77.333.444-5', nombre: 'Ingeniería y Construcción Beta SpA', dir: 'Huérfanos 800, Santiago' },
            { rut: '78.555.666-7', nombre: 'Servicios Logísticos Gamma Ltda.', dir: 'Vicuña Mackenna 1200, Ñuñoa' },
            { rut: '79.777.888-9', nombre: 'Inmobiliaria Delta del Sur', dir: 'O\'Higgins 450, Concepción' }
        ];
        const empresaIds = [];
        for (const e of empresas) {
            const [res] = await db.query('INSERT IGNORE INTO empresas (rut, razon_social, direccion) VALUES (?, ?, ?)',
                [e.rut, e.nombre, e.dir]);
            if (res.insertId) empresaIds.push(res.insertId);
            else {
                const [existing] = await db.query('SELECT id FROM empresas WHERE rut = ?', [e.rut]);
                empresaIds.push(existing[0].id);
            }
        }

        // 4. Obras
        const obrasArr = [
            { nombre: 'Proyecto Torre Costanera II', dir: 'Andrés Bello 2700', emp: empresaIds[0] },
            { nombre: 'Remodelación Metro Línea 7', dir: 'Mapocho / Matucana', emp: empresaIds[0] },
            { nombre: 'Edificio Residencial El Parque', dir: 'Av. Ossa 110', emp: empresaIds[1] },
            { nombre: 'Centro Logístico Pudahuel', dir: 'Américo Vespucio Norte', emp: empresaIds[2] },
            { nombre: 'Mall Plaza Biobío Expansión', dir: 'Los Carrera, Concepción', emp: empresaIds[3] }
        ];
        const obraIds = [];
        for (const o of obrasArr) {
            const [res] = await db.query('INSERT IGNORE INTO obras (nombre, direccion, empresa_id) VALUES (?, ?, ?)',
                [o.nombre, o.dir, o.emp]);
            if (res.insertId) obraIds.push(res.insertId);
            else {
                const [existing] = await db.query('SELECT id FROM obras WHERE nombre = ?', [o.nombre]);
                obraIds.push(existing[0].id);
            }
        }

        // 5. Tipos de Documento
        const tiposDoc = [
            { nombre: 'Contrato de Trabajo', vig: 0, obl: 1 },
            { nombre: 'Anexo de Traslado', vig: 0, obl: 0 },
            { nombre: 'EPP - Registro Entrega', vig: 180, obl: 1 },
            { nombre: 'ODI - Charla Seguridad', vig: 365, obl: 1 },
            { nombre: 'Certificado Antecedentes', vig: 60, obl: 1 },
            { nombre: 'Certificado Afiliación AFP', vig: 90, obl: 1 },
            { nombre: 'Certificado Afiliación Fonasa/Isapre', vig: 90, obl: 1 },
            { nombre: 'Liquidación de Sueldo (Ant.)', vig: 30, obl: 0 },
            { nombre: 'Mutualidad - Derecho a Saber', vig: 365, obl: 1 }
        ];
        for (const t of tiposDoc) {
            await db.query('INSERT IGNORE INTO tipos_documento (nombre, dias_vigencia, obligatorio) VALUES (?, ?, ?)',
                [t.nombre, t.vig, t.obl]);
        }
        const [tipoDocRows] = await db.query('SELECT id FROM tipos_documento');
        const tipoDocIds = tipoDocRows.map(r => r.id);

        // 6. Trabajadores (Generar 60)
        const nombres = ['Juan', 'Pedro', 'Luis', 'Alberto', 'Ricardo', 'Miguel', 'José', 'Andrés', 'Cristóbal', 'Daniel'];
        const apellidos = ['González', 'Muñoz', 'Rojas', 'Díaz', 'Pérez', 'Soto', 'Contreras', 'Silva', 'Martínez', 'Sepúlveda'];

        console.log('👷 Generando 60 trabajadores...');
        for (let i = 0; i < 60; i++) {
            const rut = `${10 + (i % 15)}.${100 + i}.${200 + i}-${i % 10}`;
            const nom = nombres[i % 10];
            const apePat = apellidos[i % 10];
            const apeMat = apellidos[(i + 5) % 10];
            const obraIdx = i % obraIds.length;
            const obraId = obraIds[obraIdx];
            const empId = obrasArr[obraIdx].emp;
            const cargoId = cargoIds[i % cargoIds.length];

            await db.query(`INSERT IGNORE INTO trabajadores 
                (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo) 
                VALUES (?, ?, ?, ?, ?, ?, ?, '2024-01-15', 1)`,
                [rut, nom, apePat, apeMat, empId, obraId, cargoId]);
        }

        // 7. Asistencia (Los últimos 15 días)
        console.log('📅 Generando registros de asistencia (15 días)...');
        const [trabs] = await db.query('SELECT id, obra_id FROM trabajadores');
        const [estados] = await db.query('SELECT id, codigo FROM estados_asistencia');
        const estadoP = estados.find(e => e.codigo === 'A').id;  // A = Asiste
        const estadoA = estados.find(e => e.codigo === 'F').id;  // F = Falta
        const estadoAT = estados.find(e => e.codigo === 'AT').id;

        const hoy = new Date();
        for (let d = 1; d <= 15; d++) {
            const fecha = new Date(hoy);
            fecha.setDate(hoy.getDate() - d);
            const fechaStr = fecha.toISOString().split('T')[0];
            const dow = fecha.getDay();
            if (dow === 0 || dow === 6) continue; // No se trabaja fin de semana en el seed

            for (const t of trabs) {
                // Probabilidades
                const rand = Math.random();
                let est = estadoP;
                let hEntrada = '08:00:00';
                let hSalida = '18:00:00';

                if (rand < 0.05) est = estadoA; // 5% ausente
                else if (rand < 0.15) { // 10% atraso
                    est = estadoAT;
                    hEntrada = '08:25:00';
                }

                await db.query(`INSERT IGNORE INTO asistencias
                    (trabajador_id, obra_id, fecha, estado_id, hora_entrada, hora_salida)
                    VALUES (?, ?, ?, ?, ?, ?)`,
                    [t.id, t.obra_id, fechaStr, est, hEntrada, hSalida]);
            }
        }

        // 8. Plantillas de Email para el admin
        const [admin] = await db.query('SELECT id FROM usuarios WHERE email = "admin@boveda.cl"');
        if (admin.length > 0) {
            const adminId = admin[0].id;
            const plantillas = [
                {
                    nombre: 'Reporte de Nómina Quincenal',
                    asunto: 'Nómina de Trabajadores - Quincena {{quincena}}',
                    cuerpo: 'Estimados,\n\nAdjunto enviamos el reporte de nómina correspondiente a la quincena de {{mes}}.\n\nSaludos cordiales,\nEquipo SGDL.'
                },
                {
                    nombre: 'Aviso de Documentación Faltante',
                    asunto: 'Urgente: Documentación de Obra Pendiente',
                    cuerpo: 'Hola {{nombre}},\n\nSe informa que existen documentos críticos vencidos o no presentados para la obra {{obra}}.\nFavor revisar la plataforma.\n\nAtte,\nFiscalización.'
                }
            ];
            for (const p of plantillas) {
                await db.query('INSERT IGNORE INTO plantillas_correo (usuario_id, nombre, asunto, cuerpo) VALUES (?, ?, ?, ?)',
                    [adminId, p.nombre, p.asunto, p.cuerpo]);
            }
        }

        console.log('✅ Super Seed completado exitosamente.');
        process.exit(0);

    } catch (err) {
        console.error('❌ Error fatal en el seed:', err);
        process.exit(1);
    }
}

seed();
