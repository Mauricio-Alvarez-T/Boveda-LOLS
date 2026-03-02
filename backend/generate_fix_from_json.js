const fs = require('fs');

const workersRaw = JSON.parse(fs.readFileSync('debug_workers.json', 'utf-8'));

function escapeSql(str) { return "'" + String(str).replace(/'/g, "''") + "'"; }

let sql = "SET NAMES utf8mb4;\nSET FOREIGN_KEY_CHECKS = 0;\n\n";
sql += "-- 1. FIX: Mover registros a la empresa correcta LOLS (77.085.560-8) y borrar la errónea (76.000.000-0)\n";
sql += "SET @id_ok = (SELECT id FROM empresas WHERE rut = '77.085.560-8' LIMIT 1);\n";
sql += "SET @id_err = (SELECT id FROM empresas WHERE rut = '76.000.000-0' LIMIT 1);\n";
sql += "UPDATE trabajadores SET empresa_id = @id_ok WHERE empresa_id = @id_err AND @id_ok IS NOT NULL;\n";
sql += "UPDATE obras SET empresa_id = @id_ok WHERE empresa_id = @id_err AND @id_ok IS NOT NULL;\n";
sql += "DELETE FROM empresas WHERE rut = '76.000.000-0' AND id = @id_err LIMIT 1;\n\n";

sql += "-- 2. Empresa Destino: MIGUEL ANGEL URRUTIA AGUILERA\n";
sql += "SET @id_miguel = (SELECT id FROM empresas WHERE razon_social LIKE '%MIGUEL ANGEL URRUTIA AGUILERA%' LIMIT 1);\n\n";

const cargos = [...new Set(workersRaw.map(w => w[7]))];
cargos.forEach(c => sql += "INSERT IGNORE INTO cargos (nombre) VALUES (" + escapeSql(c) + ");\n");

sql += "\n";
const obras = [...new Set(workersRaw.map(w => w[8]))];
obras.forEach(o => sql += "INSERT IGNORE INTO obras (nombre, direccion, empresa_id) VALUES (" + escapeSql(o) + ", 'Sin Dirección', @id_miguel);\n");

sql += "\n-- 3. Importación de Trabajadores\n";
workersRaw.forEach(w => {
    const ap = w[1].split(' ');
    const apPat = ap[0];
    const apMat = ap.slice(1).join(' ');

    let fecha = "2000-01-01";
    if (w[6]) {
        const d = w[6].split('-');
        if (d.length === 3) {
            fecha = (parseInt(d[2]) < 50 ? '20' + d[2] : '19' + d[2]) + '-' + d[1].padStart(2, '0') + '-' + d[0].padStart(2, '0');
        }
    }

    const activo = w[9] && w[9].includes('ACTIVO') ? 1 : 0;

    sql += "INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)\n";
    sql += "SELECT " + escapeSql(w[4].toUpperCase()) + ", " + escapeSql(w[2]) + ", " + escapeSql(apPat) + ", " + escapeSql(apMat) + ", @id_miguel, o.id, c.id, " + escapeSql(fecha) + ", " + activo;
    sql += " FROM obras o, cargos c WHERE o.nombre = " + escapeSql(w[8]) + " AND c.nombre = " + escapeSql(w[7]) + " AND o.empresa_id = @id_miguel LIMIT 1;\n";
});

sql += "\nSET FOREIGN_KEY_CHECKS = 1;\n";

fs.writeFileSync('fix_and_import_miguel.sql', sql, 'utf-8');
console.log('SQL file written successfully. Length: ' + workersRaw.length);
