const fs = require('fs');

const rawText = fs.readFileSync('workers_miguel.txt', 'utf-8');
const linesArr = rawText.split('\\r').map(l => l.trim()).filter(l => l.length > 5);

console.log('Detected lines:', linesArr.length);

const workers = [];
for (let line of linesArr) {
    const parts = line.split('\\t').map(p => p.trim());

    if (parts.length >= 10) {
        workers.push({
            N: parts[0],
            APELLIDOS: parts[1],
            NOMBRES: parts[2],
            RUT_num: parts[3],
            RUT_FULL: parts[4],
            DIGITO: parts[5],
            FECHA: parts[6],
            CARGO: parts[7],
            OBRA: parts[8],
            DETALLE: parts[9]
        });
    }
}

function escapeSql(str) {
    if (typeof str !== 'string') return "'" + String(str) + "'";
    return "'" + str.replace(/'/g, "''") + "'";
}

let sqlParts = [
    "SET NAMES utf8mb4;",
    "SET FOREIGN_KEY_CHECKS = 0;",
    "",
    "SET @id_ok = (SELECT id FROM empresas WHERE rut = '77.085.560-8' LIMIT 1);",
    "SET @id_err = (SELECT id FROM empresas WHERE rut = '76.000.000-0' LIMIT 1);",
    "",
    "UPDATE trabajadores SET empresa_id = @id_ok WHERE empresa_id = @id_err AND @id_ok IS NOT NULL;",
    "UPDATE obras SET empresa_id = @id_ok WHERE empresa_id = @id_err AND @id_ok IS NOT NULL;",
    "DELETE FROM empresas WHERE rut = '76.000.000-0' AND id = @id_err LIMIT 1;",
    "",
    "SET @id_miguel = (SELECT id FROM empresas WHERE razon_social LIKE '%MIGUEL ANGEL URRUTIA AGUILERA%' LIMIT 1);",
    ""
];

const uniqueCargos = [...new Set(workers.map(w => w.CARGO))];
uniqueCargos.forEach(cargo => {
    sqlParts.push("INSERT IGNORE INTO cargos (nombre) VALUES (" + escapeSql(cargo) + ");");
});

sqlParts.push("");
const uniqueObras = [...new Set(workers.map(w => w.OBRA))];
uniqueObras.forEach(obra => {
    sqlParts.push("INSERT IGNORE INTO obras (nombre, direccion, empresa_id) VALUES (" + escapeSql(obra) + ", 'Sin Dirección', @id_miguel);");
});

sqlParts.push("");
sqlParts.push("-- Importación de 97 Trabajadores");

for (const w of workers) {
    const apPat = w.APELLIDOS.split(' ')[0] || '';
    const apMat = w.APELLIDOS.split(' ').slice(1).join(' ') || '';

    // Convert DD-MM-YY to YYYY-MM-DD
    const dParts = w.FECHA.split('-');
    if (dParts.length === 3) {
        let yearNum = parseInt(dParts[2], 10);
        yearNum = yearNum < 50 ? 2000 + yearNum : 1900 + yearNum;
        const fechaVal = yearNum + '-' + dParts[1].padStart(2, '0') + '-' + dParts[0].padStart(2, '0');

        const rutVal = w.RUT_FULL.toUpperCase();
        const activoVal = w.DETALLE.toUpperCase().includes('ACTIVO') ? 1 : 0;

        sqlParts.push("INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)");
        sqlParts.push("SELECT " + escapeSql(rutVal) + ", " + escapeSql(w.NOMBRES) + ", " + escapeSql(apPat) + ", " + escapeSql(apMat) + ", @id_miguel, o.id, c.id, " + escapeSql(fechaVal) + ", " + activoVal + " FROM obras o, cargos c WHERE o.nombre = " + escapeSql(w.OBRA) + " AND c.nombre = " + escapeSql(w.CARGO) + " AND o.empresa_id = @id_miguel LIMIT 1;");
    }
}

sqlParts.push("");
sqlParts.push("SET FOREIGN_KEY_CHECKS = 1;");

fs.writeFileSync('fix_and_import_miguel.sql', sqlParts.join('\\n'), 'utf-8');
console.log('SQL generado con ' + workers.length + ' trabajadores.');
