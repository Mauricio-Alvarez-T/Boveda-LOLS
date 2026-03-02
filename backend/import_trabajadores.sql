-- Script generado masivamente para insertar trabajadores
SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- 1. Asegurar la Empresa
INSERT IGNORE INTO empresas (rut, razon_social, direccion) 
VALUES ('76.000.000-0', 'LOLS EMPRESAS DE INGENIERIA LTDA', 'Direccion Central');

SET @emp_rut = '76.000.000-0';
SET @emp_id = (SELECT id FROM empresas WHERE rut = @emp_rut LIMIT 1);

-- 2. Asegurar Cargos
INSERT IGNORE INTO cargos (nombre) VALUES ('MAESTRO PINTOR');
INSERT IGNORE INTO cargos (nombre) VALUES ('ENFIERRADOR');
INSERT IGNORE INTO cargos (nombre) VALUES ('JORNAL');
INSERT IGNORE INTO cargos (nombre) VALUES ('ARQUITECTO');
INSERT IGNORE INTO cargos (nombre) VALUES ('INFORMATICO');
INSERT IGNORE INTO cargos (nombre) VALUES ('CARPINTERO');
INSERT IGNORE INTO cargos (nombre) VALUES ('OPERADOR GRUA Y BOMBA');
INSERT IGNORE INTO cargos (nombre) VALUES ('DIBUJANTE');
INSERT IGNORE INTO cargos (nombre) VALUES ('MAESTRO CARPINTERO');
INSERT IGNORE INTO cargos (nombre) VALUES ('MAESTRO PRIMERA');
INSERT IGNORE INTO cargos (nombre) VALUES ('JEFE DE OBRA');
INSERT IGNORE INTO cargos (nombre) VALUES ('AYUDANTE MAESTRO');
INSERT IGNORE INTO cargos (nombre) VALUES ('PREVENCIONSTA DE RIESGO');
INSERT IGNORE INTO cargos (nombre) VALUES ('SUPERVISOR DE OBRA');
INSERT IGNORE INTO cargos (nombre) VALUES ('GERENTE OPERACIONES');
INSERT IGNORE INTO cargos (nombre) VALUES ('MAESTRO ELECTRICO');
INSERT IGNORE INTO cargos (nombre) VALUES ('AYUDANTE ELECTRICO');
INSERT IGNORE INTO cargos (nombre) VALUES ('ASISTENTE ADMINISTRATIVA');
INSERT IGNORE INTO cargos (nombre) VALUES ('ENCARGA DE ADMINISTRACION Y FINANZAS');
INSERT IGNORE INTO cargos (nombre) VALUES ('CONDUCTOR-PEONETA');
INSERT IGNORE INTO cargos (nombre) VALUES ('ASISTENTE ADMINISTRATIVO');
INSERT IGNORE INTO cargos (nombre) VALUES ('SOLDADOR');
INSERT IGNORE INTO cargos (nombre) VALUES ('CERAMISTA');
INSERT IGNORE INTO cargos (nombre) VALUES ('AYUDANTE ENFIERRADOR');
INSERT IGNORE INTO cargos (nombre) VALUES ('MAESTRO TRAZADOR');
INSERT IGNORE INTO cargos (nombre) VALUES ('AYUDANTE TRAZADOR');
INSERT IGNORE INTO cargos (nombre) VALUES ('MAESTRO SEGUNDA CARPINTERIA');
INSERT IGNORE INTO cargos (nombre) VALUES ('SUPERVISOR OBRA');
INSERT IGNORE INTO cargos (nombre) VALUES ('BODEGUERO');
INSERT IGNORE INTO cargos (nombre) VALUES ('JEFE BODEGA');
INSERT IGNORE INTO cargos (nombre) VALUES ('ADMINISTRADOR DE OBRA');

-- 3. Asegurar Obras
INSERT IGNORE INTO obras (nombre, direccion, empresa_id) VALUES ('ABATE 676', 'Sin Dirección', @emp_id);
INSERT IGNORE INTO obras (nombre, direccion, empresa_id) VALUES ('RIVAS VICUÑA', 'Sin Dirección', @emp_id);
INSERT IGNORE INTO obras (nombre, direccion, empresa_id) VALUES ('CONFERENCIA', 'Sin Dirección', @emp_id);
INSERT IGNORE INTO obras (nombre, direccion, empresa_id) VALUES ('OFICINA', 'Sin Dirección', @emp_id);
INSERT IGNORE INTO obras (nombre, direccion, empresa_id) VALUES ('BASCUÑAN 661', 'Sin Dirección', @emp_id);
INSERT IGNORE INTO obras (nombre, direccion, empresa_id) VALUES ('CERRILLOS', 'Sin Dirección', @emp_id);
INSERT IGNORE INTO obras (nombre, direccion, empresa_id) VALUES ('ABATE 80', 'Sin Dirección', @emp_id);
INSERT IGNORE INTO obras (nombre, direccion, empresa_id) VALUES ('DOMEYKO', 'Sin Dirección', @emp_id);
INSERT IGNORE INTO obras (nombre, direccion, empresa_id) VALUES ('ELECTRICO', 'Sin Dirección', @emp_id);

-- 4. Insertar Trabajadores

INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '9.043.462-4', 'JOEL BENITO', 'ACUÑA', 'TRALMA', @emp_id, o.id, c.id, '2019-03-04', 1
FROM obras o, cargos c
WHERE o.nombre = 'ABATE 676' AND c.nombre = 'MAESTRO PINTOR' LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '19745003-7', 'FABIAN MAXIMILIANO', 'AGUILERA', 'SANDOVAL', @emp_id, o.id, c.id, '2025-08-26', 1
FROM obras o, cargos c
WHERE o.nombre = 'RIVAS VICUÑA' AND c.nombre = 'ENFIERRADOR' LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '18193111-6', 'CRISTIAN RODRIGO', 'AGUIRRE', 'BRAVO', @emp_id, o.id, c.id, '2026-01-27', 1
FROM obras o, cargos c
WHERE o.nombre = 'CONFERENCIA' AND c.nombre = 'JORNAL' LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '10823372-9', 'EULOGIO', 'ALTAMIRANO', 'MUÑOZ', @emp_id, o.id, c.id, '2025-05-12', 1
FROM obras o, cargos c
WHERE o.nombre = 'OFICINA' AND c.nombre = 'ARQUITECTO' LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '17611988-8', 'MAURICIO ALEJANDRO', 'ALVAREZ', 'TORRES', @emp_id, o.id, c.id, '2026-02-02', 1
FROM obras o, cargos c
WHERE o.nombre = 'OFICINA' AND c.nombre = 'INFORMATICO' LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '16279325-K', 'CRISTOPHER ANDRES', 'AREVALO', 'CARRASCO', @emp_id, o.id, c.id, '2025-10-07', 1
FROM obras o, cargos c
WHERE o.nombre = 'ABATE 676' AND c.nombre = 'JORNAL' LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '11200477-7', 'RIGOBERTO SEBASTIAN', 'ARIAS', 'ROSALES', @emp_id, o.id, c.id, '2025-10-15', 1
FROM obras o, cargos c
WHERE o.nombre = 'BASCUÑAN 661' AND c.nombre = 'CARPINTERO' LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '15348180-6', 'ALEJANDRO ULISES', 'ASCENCIO', 'JARA A', @emp_id, o.id, c.id, '2025-11-05', 1
FROM obras o, cargos c
WHERE o.nombre = 'CERRILLOS' AND c.nombre = 'OPERADOR GRUA Y BOMBA' LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '25469011-2', 'CRISTHIAN ANDRES', 'ASTUDILLO', 'TIGRE', @emp_id, o.id, c.id, '2024-04-01', 1
FROM obras o, cargos c
WHERE o.nombre = 'ABATE 676' AND c.nombre = 'CARPINTERO' LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '15355616-4', 'GONZALO FELIPE', 'AVALOS', 'AGUILA', @emp_id, o.id, c.id, '2026-01-06', 1
FROM obras o, cargos c
WHERE o.nombre = 'BASCUÑAN 661' AND c.nombre = 'JORNAL' LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '15337129-6', 'SEBASTIAN ENRIQUE', 'AVILA', 'MATURANA', @emp_id, o.id, c.id, '2024-08-26', 1
FROM obras o, cargos c
WHERE o.nombre = 'OFICINA' AND c.nombre = 'DIBUJANTE' LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '17833562-6', 'ALDO LEONEL', 'AVILA', 'SEPULVEDA', @emp_id, o.id, c.id, '2026-01-12', 1
FROM obras o, cargos c
WHERE o.nombre = 'RIVAS VICUÑA' AND c.nombre = 'ENFIERRADOR' LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '20102395-5', 'CAMILO ENRIQUE', 'BENAVIDES', 'JARA', @emp_id, o.id, c.id, '2025-08-11', 1
FROM obras o, cargos c
WHERE o.nombre = 'CERRILLOS' AND c.nombre = 'MAESTRO CARPINTERO' LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '10188490-2', 'OSCAR ENRIQUE', 'BRAVO', 'MUÑOZ', @emp_id, o.id, c.id, '2026-02-01', 1
FROM obras o, cargos c
WHERE o.nombre = 'RIVAS VICUÑA' AND c.nombre = 'ENFIERRADOR' LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '11327823-4', 'CRISTIAN HERNAN', 'CALDERON', 'CALDERON', @emp_id, o.id, c.id, '2025-03-01', 0
FROM obras o, cargos c
WHERE o.nombre = 'ABATE 80' AND c.nombre = 'JORNAL' LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '12647778-3', 'MANUEL ALBERTO', 'CAMPOS', 'PEÑA', @emp_id, o.id, c.id, '2025-05-19', 1
FROM obras o, cargos c
WHERE o.nombre = 'DOMEYKO' AND c.nombre = 'JORNAL' LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '16057732-0', 'CESAR ANTONIO', 'CAMPOS', 'SALVO', @emp_id, o.id, c.id, '2026-01-07', 1
FROM obras o, cargos c
WHERE o.nombre = 'CONFERENCIA' AND c.nombre = 'CARPINTERO' LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '21155036-8', 'BENJAMIN EXQUIEL', 'CARILAO', 'GUERRERO', @emp_id, o.id, c.id, '2025-12-01', 1
FROM obras o, cargos c
WHERE o.nombre = 'CERRILLOS' AND c.nombre = 'JORNAL' LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '19384630-0', 'NICOLAS ESTEBAN', 'CARRASCO', 'LLANOS', @emp_id, o.id, c.id, '2026-01-27', 0
FROM obras o, cargos c
WHERE o.nombre = 'BASCUÑAN 661' AND c.nombre = 'JORNAL' LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '15670419-9', 'JULIO LABERTO', 'CIENFUEGOS', 'FIGUEROA', @emp_id, o.id, c.id, '2026-01-06', 1
FROM obras o, cargos c
WHERE o.nombre = 'BASCUÑAN 661' AND c.nombre = 'JORNAL' LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '15748379-K', 'RODRIGO ANDRES', 'CONEJEROS', 'LAVIN', @emp_id, o.id, c.id, '2026-02-16', 1
FROM obras o, cargos c
WHERE o.nombre = 'RIVAS VICUÑA' AND c.nombre = 'ENFIERRADOR' LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '5879457-0', 'LUIS HUGO', 'CONTRERAS', 'MILLAO', @emp_id, o.id, c.id, '2025-05-12', 1
FROM obras o, cargos c
WHERE o.nombre = 'BASCUÑAN 661' AND c.nombre = 'JORNAL' LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '11639250-K', 'JUAN CARLOS', 'CURIFIL', 'AÑICOY', @emp_id, o.id, c.id, '2025-07-01', 1
FROM obras o, cargos c
WHERE o.nombre = 'ABATE 80' AND c.nombre = 'JORNAL' LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '19499220-3', 'LUIS ARTURO', 'DIAZ', 'BACHSMANN', @emp_id, o.id, c.id, '2025-07-01', 1
FROM obras o, cargos c
WHERE o.nombre = 'ABATE 676' AND c.nombre = 'JORNAL' LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '26615235-3', 'HERNE SLY', 'FAN', 'FAN', @emp_id, o.id, c.id, '2025-12-16', 1
FROM obras o, cargos c
WHERE o.nombre = 'ABATE 676' AND c.nombre = 'MAESTRO PINTOR' LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '9531609-3', 'RICARDO ARMANDO', 'FIGUEROA', 'ARAYA', @emp_id, o.id, c.id, '2025-10-15', 1
FROM obras o, cargos c
WHERE o.nombre = 'CERRILLOS' AND c.nombre = 'CARPINTERO' LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '11.301.761-9', 'VICTOR MANUEL', 'FIGUEROA', 'MUÑOZ', @emp_id, o.id, c.id, '2005-03-01', 1
FROM obras o, cargos c
WHERE o.nombre = 'BASCUÑAN 661' AND c.nombre = 'MAESTRO PRIMERA' LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '22941855-6', 'LUIS ENRIQUE', 'FIGUEROA', 'SALAZAR', @emp_id, o.id, c.id, '2016-10-18', 1
FROM obras o, cargos c
WHERE o.nombre = 'DOMEYKO' AND c.nombre = 'JORNAL' LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '13394499-0', 'JOSE ALEJANDRO', 'FIGUEROA', 'SEGUEL', @emp_id, o.id, c.id, '2023-09-01', 1
FROM obras o, cargos c
WHERE o.nombre = 'BASCUÑAN 661' AND c.nombre = 'JEFE DE OBRA' LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '16907393-7', 'FRANCO ROBERTO', 'FLORES', 'BERRIOS', @emp_id, o.id, c.id, '2025-10-20', 1
FROM obras o, cargos c
WHERE o.nombre = 'BASCUÑAN 661' AND c.nombre = 'JORNAL' LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '13297583-3', 'MIKE NELSON', 'GALVEZ', 'TRIPAINAO', @emp_id, o.id, c.id, '2025-07-22', 0
FROM obras o, cargos c
WHERE o.nombre = 'ABATE 676' AND c.nombre = 'AYUDANTE MAESTRO' LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '14.033.502-9', 'MANUEL ANTONIO', 'GHINELLI', 'FIGUEROA', @emp_id, o.id, c.id, '2025-12-01', 1
FROM obras o, cargos c
WHERE o.nombre = 'CERRILLOS' AND c.nombre = 'CARPINTERO' LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '16925173-8', 'HECTOR OMAR', 'GOMEZ', 'BRAVO', @emp_id, o.id, c.id, '2025-03-01', 0
FROM obras o, cargos c
WHERE o.nombre = 'CERRILLOS' AND c.nombre = 'PREVENCIONSTA DE RIESGO' LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '8516824-K', 'CRISTIAN ROLANDO', 'GONZALEZ', 'BRITO', @emp_id, o.id, c.id, '2025-10-15', 1
FROM obras o, cargos c
WHERE o.nombre = 'CERRILLOS' AND c.nombre = 'JORNAL' LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '9220748-K', 'OMAR ENRIQUE', 'GONZALEZ', 'LAGOS', @emp_id, o.id, c.id, '2025-08-01', 1
FROM obras o, cargos c
WHERE o.nombre = 'ABATE 80' AND c.nombre = 'JORNAL' LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '11993546-6', 'JOSE ORLANDO', 'GUILITRARO', 'ALVARADO', @emp_id, o.id, c.id, '2025-09-01', 1
FROM obras o, cargos c
WHERE o.nombre = 'ABATE 80' AND c.nombre = 'CARPINTERO' LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '18196704-8', 'FRANCO ELIAS', 'GUTIERREZ', 'GUTIERREZ', @emp_id, o.id, c.id, '2025-11-03', 1
FROM obras o, cargos c
WHERE o.nombre = 'BASCUÑAN 661' AND c.nombre = 'SUPERVISOR DE OBRA' LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '15229685-1', 'LUIS COILLA', 'GUZMAN', 'COILLA', @emp_id, o.id, c.id, '2025-10-06', 1
FROM obras o, cargos c
WHERE o.nombre = 'BASCUÑAN 661' AND c.nombre = 'CARPINTERO' LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '10671093-7', 'PATRICIO PABLO', 'GUZMAN', 'NEIRA', @emp_id, o.id, c.id, '2025-06-01', 1
FROM obras o, cargos c
WHERE o.nombre = 'BASCUÑAN 661' AND c.nombre = 'CARPINTERO' LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '17709144-8', 'MARCO ANTONIO', 'HUILCALEO', 'RIOBO', @emp_id, o.id, c.id, '2026-02-25', 1
FROM obras o, cargos c
WHERE o.nombre = 'BASCUÑAN 661' AND c.nombre = 'AYUDANTE MAESTRO' LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '25.445.541-5', 'ALEXANDER', 'JEAN', '', @emp_id, o.id, c.id, '2017-03-01', 1
FROM obras o, cargos c
WHERE o.nombre = 'BASCUÑAN 661' AND c.nombre = 'JORNAL' LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '11480769-9', 'MANUEL ANTONIO ', 'JOFRE', 'ARRIOLA', @emp_id, o.id, c.id, '2026-01-01', 1
FROM obras o, cargos c
WHERE o.nombre = 'BASCUÑAN 661' AND c.nombre = 'JORNAL' LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '17377382-K', 'PAUL DANIEL', 'LARA', 'JARA', @emp_id, o.id, c.id, '2026-02-16', 1
FROM obras o, cargos c
WHERE o.nombre = 'RIVAS VICUÑA' AND c.nombre = 'ENFIERRADOR' LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '7907220-6', 'LUIS OSCAR', 'LAZCANO', 'SILVA', @emp_id, o.id, c.id, '2023-10-01', 1
FROM obras o, cargos c
WHERE o.nombre = 'OFICINA' AND c.nombre = 'GERENTE OPERACIONES' LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '19793611-8', 'RUBEN ALEJANDRI ANDRES', 'LAZO', 'BRIONES', @emp_id, o.id, c.id, '2026-01-13', 0
FROM obras o, cargos c
WHERE o.nombre = 'BASCUÑAN 661' AND c.nombre = 'JORNAL' LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '13.927.862-3', 'JAIME WALTER', 'LEVIO', 'PORMA', @emp_id, o.id, c.id, '2025-11-01', 1
FROM obras o, cargos c
WHERE o.nombre = 'ELECTRICO' AND c.nombre = 'MAESTRO ELECTRICO' LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '15477383-5', 'JUAN BRUNO', 'LEVIO', 'PORMA', @emp_id, o.id, c.id, '2025-08-01', 1
FROM obras o, cargos c
WHERE o.nombre = 'ELECTRICO' AND c.nombre = 'AYUDANTE ELECTRICO' LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '17667650-7', 'DAVID ANTONIO', 'LUNA', 'CAÑETE', @emp_id, o.id, c.id, '2025-07-22', 1
FROM obras o, cargos c
WHERE o.nombre = 'BASCUÑAN 661' AND c.nombre = 'JORNAL' LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '24448573-1', 'JOSE WILSON', 'LLANOS', 'RODRIGUEZ', @emp_id, o.id, c.id, '2025-07-01', 1
FROM obras o, cargos c
WHERE o.nombre = 'ABATE 676' AND c.nombre = 'JORNAL' LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '12305028-2', 'MARCO ANTONIO', 'LLANOS', 'JIMENEZ', @emp_id, o.id, c.id, '2026-01-27', 0
FROM obras o, cargos c
WHERE o.nombre = 'CONFERENCIA' AND c.nombre = 'JORNAL' LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '9096668-5', 'IRENE DEL ROSARIO', 'MARTINEZ', 'OLATE', @emp_id, o.id, c.id, '2023-07-01', 1
FROM obras o, cargos c
WHERE o.nombre = 'OFICINA' AND c.nombre = 'ASISTENTE ADMINISTRATIVA' LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '14.164.758-K', 'PAULA ANDREA', 'MARTINEZ', 'LANDEROS', @emp_id, o.id, c.id, '2014-08-04', 1
FROM obras o, cargos c
WHERE o.nombre = 'OFICINA' AND c.nombre = 'ENCARGA DE ADMINISTRACION Y FINANZAS' LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '19418589-8', 'VICTOR MANUEL', 'MATUS', 'PACHECO', @emp_id, o.id, c.id, '2026-02-10', 1
FROM obras o, cargos c
WHERE o.nombre = 'RIVAS VICUÑA' AND c.nombre = 'CONDUCTOR-PEONETA' LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '22357118-2', 'JOSE MATIAS', 'MILLANAO', 'CAMPOS', @emp_id, o.id, c.id, '2025-11-01', 1
FROM obras o, cargos c
WHERE o.nombre = 'OFICINA' AND c.nombre = 'ASISTENTE ADMINISTRATIVO' LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '9.706.009-6', 'JUAN GERARDO', 'MILLAQUEO', 'RECABAL', @emp_id, o.id, c.id, '2025-08-01', 1
FROM obras o, cargos c
WHERE o.nombre = 'RIVAS VICUÑA' AND c.nombre = 'ENFIERRADOR' LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '8.860.798-8', 'MANUEL JESUS', 'MOLINA', 'HENRIQUEZ', @emp_id, o.id, c.id, '2016-05-23', 1
FROM obras o, cargos c
WHERE o.nombre = 'CERRILLOS' AND c.nombre = 'SOLDADOR' LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '17349836-5', 'LUCIANO DE LA CRUZ', 'MONSALVE', 'MEDINA', @emp_id, o.id, c.id, '2025-12-01', 1
FROM obras o, cargos c
WHERE o.nombre = 'ELECTRICO' AND c.nombre = 'MAESTRO ELECTRICO' LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '26.025.087-6', 'FRANCISCO ANTONIO', 'MONTES', 'GONZALEZ', @emp_id, o.id, c.id, '2019-08-05', 1
FROM obras o, cargos c
WHERE o.nombre = 'OFICINA' AND c.nombre = 'DIBUJANTE' LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '10414868-9', 'VICTOR MANUEL', 'MORALES', 'ALARCON', @emp_id, o.id, c.id, '2026-01-01', 1
FROM obras o, cargos c
WHERE o.nombre = 'BASCUÑAN 661' AND c.nombre = 'CARPINTERO' LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '16647195-8', 'GUILLERMO NIBALDO', 'MORALES', 'MOYA', @emp_id, o.id, c.id, '2025-06-01', 1
FROM obras o, cargos c
WHERE o.nombre = 'RIVAS VICUÑA' AND c.nombre = 'ENFIERRADOR' LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '25.885.554-K', 'VICTOR RAUL', 'MORALES', 'TASAYCO', @emp_id, o.id, c.id, '2017-08-28', 1
FROM obras o, cargos c
WHERE o.nombre = 'ABATE 80' AND c.nombre = 'CERAMISTA' LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '25.216.938-5', 'VICENTE MIGUEL', 'MORENO', 'DORADO', @emp_id, o.id, c.id, '2015-12-09', 1
FROM obras o, cargos c
WHERE o.nombre = 'ABATE 80' AND c.nombre = 'JORNAL' LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '9497152-7', 'CARLOS MARTIN', 'MUÑOZ', 'ALMARZA', @emp_id, o.id, c.id, '2025-07-21', 0
FROM obras o, cargos c
WHERE o.nombre = 'BASCUÑAN 661' AND c.nombre = 'JORNAL' LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '21506773-4', 'JOSE MIGUEL', 'MUÑOZ', 'GONZALEZ', @emp_id, o.id, c.id, '2026-01-27', 1
FROM obras o, cargos c
WHERE o.nombre = 'CONFERENCIA' AND c.nombre = 'JORNAL' LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '12123521-8', 'CRISTIAN ALEJANDRO', 'MUÑOZ', 'MUÑOZ', @emp_id, o.id, c.id, '2026-02-17', 1
FROM obras o, cargos c
WHERE o.nombre = 'RIVAS VICUÑA' AND c.nombre = 'ENFIERRADOR' LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '7986893-0', 'RICARDO ARTURO', 'MUÑOZ', 'SALAZAR', @emp_id, o.id, c.id, '2026-01-28', 1
FROM obras o, cargos c
WHERE o.nombre = 'BASCUÑAN 661' AND c.nombre = 'JORNAL' LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '20992881-7', 'DIEGO ALEJANDRO', 'NAVARRO', 'BUSTAMANTE', @emp_id, o.id, c.id, '2025-06-23', 1
FROM obras o, cargos c
WHERE o.nombre = 'DOMEYKO' AND c.nombre = 'JORNAL' LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '17544889-6', 'HERNAN JAVIER', 'NUÑEZ', 'CASTILLO', @emp_id, o.id, c.id, '2026-02-10', 1
FROM obras o, cargos c
WHERE o.nombre = 'CERRILLOS' AND c.nombre = 'JORNAL' LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '20047513-5', 'KEVIN ARIEL', 'ÑANCANAHUEL', 'GODOY', @emp_id, o.id, c.id, '2026-01-06', 1
FROM obras o, cargos c
WHERE o.nombre = 'RIVAS VICUÑA' AND c.nombre = 'AYUDANTE ENFIERRADOR' LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '16241719-3', 'FABIAN HERALDO', 'ORTEGA', 'MOLINA', @emp_id, o.id, c.id, '2025-08-26', 0
FROM obras o, cargos c
WHERE o.nombre = 'RIVAS VICUÑA' AND c.nombre = 'ENFIERRADOR' LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '16692446-4', 'MANUEL ALFREDO', 'PACHECO', 'OLIVARES', @emp_id, o.id, c.id, '2025-08-06', 1
FROM obras o, cargos c
WHERE o.nombre = 'BASCUÑAN 661' AND c.nombre = 'MAESTRO TRAZADOR' LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '18906245-1', 'ALEXIS EDGARDO', 'PALOMINO', 'LEAL', @emp_id, o.id, c.id, '2025-10-06', 1
FROM obras o, cargos c
WHERE o.nombre = 'CERRILLOS' AND c.nombre = 'AYUDANTE TRAZADOR' LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '12364266-k', 'DAVID LEONARDO', 'PARRA', 'PEREZ', @emp_id, o.id, c.id, '2025-06-01', 1
FROM obras o, cargos c
WHERE o.nombre = 'BASCUÑAN 661' AND c.nombre = 'MAESTRO CARPINTERO' LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '15296378-5', 'JOSE LUIS', 'PERALTA', 'PACHECO', @emp_id, o.id, c.id, '2026-02-02', 1
FROM obras o, cargos c
WHERE o.nombre = 'CONFERENCIA' AND c.nombre = 'MAESTRO CARPINTERO' LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '18907866-8', 'NICOLAS ADONIS', 'PEREIRA', 'GODOY', @emp_id, o.id, c.id, '2026-01-13', 0
FROM obras o, cargos c
WHERE o.nombre = 'CERRILLOS' AND c.nombre = 'JORNAL' LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '25315632-5', 'ELDONER', 'PIERRE', '', @emp_id, o.id, c.id, '2025-08-16', 1
FROM obras o, cargos c
WHERE o.nombre = 'BASCUÑAN 661' AND c.nombre = 'MAESTRO SEGUNDA CARPINTERIA' LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '15357519-3', 'MARCOS FABIAN', 'PINELA', 'PARRA', @emp_id, o.id, c.id, '2025-08-19', 1
FROM obras o, cargos c
WHERE o.nombre = 'ABATE 676' AND c.nombre = 'MAESTRO CARPINTERO' LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '18059925-8', 'JUAN DE DIOS', 'PIZARRO', 'GALLARDO', @emp_id, o.id, c.id, '2026-02-09', 1
FROM obras o, cargos c
WHERE o.nombre = 'CERRILLOS' AND c.nombre = 'MAESTRO CARPINTERO' LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '12155236-1', 'JOSE EMILIO', 'PONCE', 'ACEVEDO', @emp_id, o.id, c.id, '2025-04-16', 1
FROM obras o, cargos c
WHERE o.nombre = 'BASCUÑAN 661' AND c.nombre = 'CARPINTERO' LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '16071933-8', 'RICARDO ANDRES', 'RAMIREZ', 'GUTIERREZ', @emp_id, o.id, c.id, '2026-01-14', 1
FROM obras o, cargos c
WHERE o.nombre = 'CONFERENCIA' AND c.nombre = 'AYUDANTE TRAZADOR' LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '14.131.250-2', 'RODRIGO HERNAN', 'RIQUELME', 'PRIETO', @emp_id, o.id, c.id, '2013-06-01', 1
FROM obras o, cargos c
WHERE o.nombre = 'OFICINA' AND c.nombre = 'SUPERVISOR OBRA' LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '7.454.802-9', 'RENANTO AURELIO', 'ROMERO', 'GONZALEZ', @emp_id, o.id, c.id, '2016-10-18', 1
FROM obras o, cargos c
WHERE o.nombre = 'BASCUÑAN 661' AND c.nombre = 'BODEGUERO' LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '26038459-7', 'RAFAEL EDUARDO', 'RUFIN', 'MOREIRA', @emp_id, o.id, c.id, '2026-01-01', 1
FROM obras o, cargos c
WHERE o.nombre = 'BASCUÑAN 661' AND c.nombre = 'CARPINTERO' LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '13914800-2', 'MAURICIO ENRIQUE', 'RUIZ', 'FLORES', @emp_id, o.id, c.id, '2025-06-01', 1
FROM obras o, cargos c
WHERE o.nombre = 'BASCUÑAN 661' AND c.nombre = 'JEFE BODEGA' LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '19088654-2', 'RUBEN GABRIEL', 'RUIZ', 'VARGAS', @emp_id, o.id, c.id, '2025-10-15', 1
FROM obras o, cargos c
WHERE o.nombre = 'CERRILLOS' AND c.nombre = 'AYUDANTE TRAZADOR' LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '21332766-6', 'CRISTOPHER ALEXANDER', 'SALAZAR', 'CAMPOS', @emp_id, o.id, c.id, '2026-02-17', 1
FROM obras o, cargos c
WHERE o.nombre = 'RIVAS VICUÑA' AND c.nombre = 'AYUDANTE ENFIERRADOR' LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '9516824-K', 'JOSE DANIEL', 'SALAZAR', 'ROJAS', @emp_id, o.id, c.id, '2025-10-15', 1
FROM obras o, cargos c
WHERE o.nombre = 'CERRILLOS' AND c.nombre = 'JORNAL' LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '10565866-4', 'OSVALDO FRANCISCO', 'SALDIVIA', 'MANSILLA', @emp_id, o.id, c.id, '2026-01-28', 1
FROM obras o, cargos c
WHERE o.nombre = 'BASCUÑAN 661' AND c.nombre = 'CARPINTERO' LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '19574129-8', 'ESTEBAN ALEJANDRO', 'SANCHEZ', 'CAMPOS', @emp_id, o.id, c.id, '2026-01-27', 0
FROM obras o, cargos c
WHERE o.nombre = 'CONFERENCIA' AND c.nombre = 'JORNAL' LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '16904128-8', 'HERNAN PATRICIO', 'SANDOVAL', 'NAVARRETE', @emp_id, o.id, c.id, '2026-01-01', 1
FROM obras o, cargos c
WHERE o.nombre = 'BASCUÑAN 661' AND c.nombre = 'CARPINTERO' LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '12891395-5', 'GERMÁN ANDRÉS', 'SANTIBÁÑEZ', 'GONZÁLEZ', @emp_id, o.id, c.id, '2025-06-01', 1
FROM obras o, cargos c
WHERE o.nombre = 'CERRILLOS' AND c.nombre = 'ADMINISTRADOR DE OBRA' LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '19343361-8', 'FABIAN IGNACIO', 'SEGUEL', 'CARRASCO', @emp_id, o.id, c.id, '2026-01-06', 1
FROM obras o, cargos c
WHERE o.nombre = 'BASCUÑAN 661' AND c.nombre = 'CARPINTERO' LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '16.560.371-0', 'IVAN PATRICIO', 'SILVA', 'SANTIBAÑEZ', @emp_id, o.id, c.id, '2026-02-09', 1
FROM obras o, cargos c
WHERE o.nombre = 'CONFERENCIA' AND c.nombre = 'JEFE DE OBRA' LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '12702758-7', 'RODRIGO ADRIAN', 'URRUTIA', 'CARILAO', @emp_id, o.id, c.id, '2026-02-10', 1
FROM obras o, cargos c
WHERE o.nombre = 'CONFERENCIA' AND c.nombre = 'CARPINTERO' LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '9.324.855-3', 'CARLOS HECTOR', 'VALENZUELA', 'PEÑA', @emp_id, o.id, c.id, '2026-01-01', 1
FROM obras o, cargos c
WHERE o.nombre = 'CONFERENCIA' AND c.nombre = 'MAESTRO CARPINTERO' LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '13911181-8', 'LUIS FELIPE', 'VEGA', 'ALMARZA', @emp_id, o.id, c.id, '2026-02-23', 1
FROM obras o, cargos c
WHERE o.nombre = 'CONFERENCIA' AND c.nombre = 'CARPINTERO' LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '17904128-8', 'JUAN CARLOS', 'VELASQUEZ', 'ESPINOLA', @emp_id, o.id, c.id, '2025-12-01', 1
FROM obras o, cargos c
WHERE o.nombre = 'ABATE 676' AND c.nombre = 'JEFE DE OBRA' LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '11.301.761-9', 'JOSE LUIS', 'VELOSO', 'PINILLA', @emp_id, o.id, c.id, '2025-11-01', 1
FROM obras o, cargos c
WHERE o.nombre = 'CERRILLOS' AND c.nombre = 'JEFE DE OBRA' LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '19343361-8', 'NICOLAS ALBERTO', 'VERGARA', 'CIFUENTES', @emp_id, o.id, c.id, '2026-01-06', 1
FROM obras o, cargos c
WHERE o.nombre = 'BASCUÑAN 661' AND c.nombre = 'JORNAL' LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '8.316.281-9', 'OSVALDO ENRIQUE', 'VILLAGRA', 'VILLAGRA', @emp_id, o.id, c.id, '2024-05-01', 1
FROM obras o, cargos c
WHERE o.nombre = 'ABATE 80' AND c.nombre = 'MAESTRO CARPINTERO' LIMIT 1;

SET FOREIGN_KEY_CHECKS = 1;
