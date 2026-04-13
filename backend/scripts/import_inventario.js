require('dotenv').config({ path: __dirname + '/../.env' });
const db = require('../src/config/db');
const data = require('./inventario_data.json');

// Mapeos y Utilidades
const getCategoriaPorNombre = (descripcion) => {
    const desc = descripcion.toUpperCase();
    if (desc.includes('ANDAMIO')) return 1; // ANDAMIOS
    if (desc.includes('MOLDAJE')) return 3; // MOLDAJES
    if (desc.includes('VIGA')) return 2; // ALZAPRIMAS / VIGAS
    return 4; // MAQUINARIA
};

const limpiarString = (str) => {
    return str.replace(/[^a-zA-Z0-9]/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase();
};

async function main() {
    let conn;
    try {
        console.log('🔄 Iniciando importación de Inventario...');
        conn = await db.getConnection();
        await conn.beginTransaction();

        // 1. Obtener el super admin para 'registrado_por'
        const [users] = await conn.query('SELECT id FROM usuarios WHERE rol_id = 1 LIMIT 1');
        const superAdminId = users.length > 0 ? users[0].id : 1; 

        // 2. Mapear Obras existentes
        const [obrasDb] = await conn.query('SELECT id, nombre FROM obras');
        const getObraId = async (obraName) => {
            if (obraName.includes('LOLS_GENERAL')) return null; // Oficina central o bodega central

            const matchedObra = obrasDb.find(o => 
                limpiarString(o.nombre).includes(limpiarString(obraName)) || 
                limpiarString(obraName).includes(limpiarString(o.nombre))
            );
            
            if (matchedObra) return matchedObra.id;

            // Si no existe, crear la obra
            console.log(`⚠️ Obra no encontrada: ${obraName}. Creando automáticamente...`);
            const [res] = await conn.query('INSERT INTO obras (nombre, activa) VALUES (?, 1)', [obraName]);
            const newId = res.insertId;
            obrasDb.push({ id: newId, nombre: obraName });
            return newId;
        };

        // 3. Procesar "resumen_consolidado_general" -> Como Factura (opcional)
        console.log('📂 Procesando Facturas de Inventario...');
        // Opcional: registrar una factura consolidada
        const metadatos = data.metadatos_documento;
        const total = data.resumen_consolidado_general.total_a_facturar_con_descuento_25_pct;
        const [resFactura] = await conn.query(
            `INSERT INTO facturas_inventario (numero_factura, proveedor, fecha_factura, monto_neto, observaciones, registrado_por) 
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
                metadatos.mes_facturacion, 
                metadatos.cliente, 
                new Date('2026-03-26'), // Fecha simulada de corte
                total,
                `Importado desde archivo: ${metadatos.nombre_archivo}`,
                superAdminId
            ]
        );
        const facturaId = resFactura.insertId;

        // 4. Procesar Items y Ubicaciones de Stock
        console.log('📦 Procesando Obras, Items y Stock...');
        const d_obras = data.obras_facturacion_detallada;

        for (const [obraNombreKey, obraData] of Object.entries(d_obras)) {
            const obraId = await getObraId(obraNombreKey.replace(/_/g, ' '));

            for (const item of obraData.items_activos) {
                // a. Verificar/Insertar el Item en el catálogo
                let [itemCheck] = await conn.query('SELECT id FROM items_inventario WHERE nro_item = ?', [item.item]);
                let itemId;

                const catId = getCategoriaPorNombre(item.descripcion);
                const precio_unitario = (item.cantidad > 0 && item.total > 0) ? (item.total / item.cantidad) : 0;

                if (itemCheck.length === 0) {
                    const [resItem] = await conn.query(
                        `INSERT INTO items_inventario (nro_item, categoria_id, descripcion, valor_arriendo, activo)
                         VALUES (?, ?, ?, ?, ?)`,
                        [item.item, catId, item.descripcion, precio_unitario, 1]
                    );
                    itemId = resItem.insertId;
                } else {
                    itemId = itemCheck[0].id;
                }

                // b. Registrar en Factura Items (historico)
                await conn.query(
                    `INSERT INTO factura_items (factura_id, item_id, obra_id, cantidad, precio_unitario)
                     VALUES (?, ?, ?, ?, ?)`,
                    [facturaId, itemId, obraId, item.cantidad, precio_unitario]
                );

                // c. Actualizar el Stock actual en Ubicaciones Stock
                if (obraId) {
                    const [stockCheck] = await conn.query(
                        'SELECT id FROM ubicaciones_stock WHERE item_id = ? AND obra_id = ? AND bodega_id IS NULL',
                        [itemId, obraId]
                    );

                    if (stockCheck.length > 0) {
                        await conn.query(
                            'UPDATE ubicaciones_stock SET cantidad = cantidad + ?, valor_arriendo_override = ? WHERE id = ?',
                            [item.cantidad, precio_unitario > 0 ? precio_unitario : null, stockCheck[0].id]
                        );
                    } else {
                        await conn.query(
                            `INSERT INTO ubicaciones_stock (item_id, obra_id, cantidad, valor_arriendo_override)
                             VALUES (?, ?, ?, ?)`,
                            [itemId, obraId, item.cantidad, precio_unitario > 0 ? precio_unitario : null]
                        );
                    }
                }
            }
        }

        // 5. Procesar Bombas de Hormigón
        console.log('🚧 Procesando Historial de Bombas de Hormigón...');
        const bombasData = data.registro_operativo_maquinaria.historial_servicios;

        for (const servicio of bombasData) {
            const obraId = await getObraId(servicio.obra);
            if (obraId) {
                // Evitamos duplicados por si el script se corre dos veces
                const [dupCheck] = await conn.query(
                    'SELECT id FROM registro_bombas_hormigon WHERE obra_id = ? AND fecha = ? AND tipo_bomba = ?',
                    [obraId, servicio.fecha, servicio.tipo_bomba]
                );

                if (dupCheck.length === 0) {
                    await conn.query(
                        `INSERT INTO registro_bombas_hormigon (obra_id, fecha, tipo_bomba, es_externa, proveedor, observaciones, registrado_por)
                         VALUES (?, ?, ?, ?, ?, ?, ?)`,
                        [
                            obraId,
                            servicio.fecha,
                            servicio.tipo_bomba,
                            servicio.estado.includes('EXT'), // es_externa
                            servicio.estado.includes('EXT') ? data.metadatos_documento.cliente : 'Empresa',
                            `Estado original: ${servicio.estado}`,
                            superAdminId
                        ]
                    );
                }
            }
        }

        await conn.commit();
        console.log('✅ Importación Finalizada con Éxito!');
        process.exit(0);

    } catch (err) {
        console.error('❌ Error durante la importación:', err);
        if (conn) await conn.rollback();
        process.exit(1);
    } finally {
        if (conn) conn.release();
    }
}

main();
