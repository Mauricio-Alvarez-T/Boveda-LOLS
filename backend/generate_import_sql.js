const fs = require('fs');

const rawData = fs.readFileSync('workers.json', 'utf-8');
const workers = JSON.parse(rawData);

let sql = `-- Script generado masivamente para insertar trabajadores
SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- 1. Asegurar la Empresa
INSERT IGNORE INTO empresas (rut, razon_social, direccion) 
VALUES ('76.000.000-0', 'LOLS EMPRESAS DE INGENIERIA LTDA', 'Direccion Central');

SET @emp_rut = '76.000.000-0';
SET @emp_id = (SELECT id FROM empresas WHERE rut = @emp_rut LIMIT 1);

-- 2. Asegurar Cargos
`;

const uniqueCargos = [...new Set(workers.map(w => w.CARGO.trim()))];
for (const cargo of uniqueCargos) {
    sql += `INSERT IGNORE INTO cargos (nombre) VALUES (${mysqlEscape(cargo)});\n`;
}

sql += `\n-- 3. Asegurar Obras\n`;
const uniqueObras = [...new Set(workers.map(w => w.OBRA.trim()))];
for (const obra of uniqueObras) {
    sql += `INSERT IGNORE INTO obras (nombre, direccion, empresa_id) VALUES (${mysqlEscape(obra)}, 'Sin Dirección', @emp_id);\n`;
}

sql += `\n-- 4. Insertar Trabajadores\n`;

for (const worker of workers) {
    // Apellidos parsing
    let apellidos = worker.APELLIDOS.trim().split(' ');
    let apPat = apellidos[0] || '';
    let apMat = apellidos.slice(1).join(' ') || '';

    // RUT parsing
    let rut = worker.RUT_2.trim();

    // Fecha
    let fecha = worker.FECHA; // YYYY-MM-DD

    // Activo
    let activo = worker.DETALLE.trim() === 'ACTIVO' ? 1 : 0;

    // Cargo & Obra
    let cargo = worker.CARGO.trim();
    let obra = worker.OBRA.trim();

    sql += `
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT ${mysqlEscape(rut)}, ${mysqlEscape(worker.NOMBRES)}, ${mysqlEscape(apPat)}, ${mysqlEscape(apMat)}, @emp_id, o.id, c.id, ${mysqlEscape(fecha)}, ${activo}
FROM obras o, cargos c
WHERE o.nombre = ${mysqlEscape(obra)} AND c.nombre = ${mysqlEscape(cargo)} LIMIT 1;`;
}

sql += `\n\nSET FOREIGN_KEY_CHECKS = 1;\n`;

fs.writeFileSync('import_trabajadores.sql', sql, 'utf-8');
console.log('Script SQL generado exitosamente en import_trabajadores.sql');

function mysqlEscape(str) {
    if (typeof str !== 'string') return "'" + str + "'";
    return "'" + str.replace(/[\0\x08\x09\x1a\n\r"'\\\%]/g, function (char) {
        switch (char) {
            case "\0": return "\\0";
            case "\x08": return "\\b";
            case "\x09": return "\\t";
            case "\x1a": return "\\z";
            case "\n": return "\\n";
            case "\r": return "\\r";
            case "\"": return "\\\"";
            case "'": return "\\'";
            case "\\": return "\\\\";
            case "%": return "\\%";
        }
    }) + "'";
}
