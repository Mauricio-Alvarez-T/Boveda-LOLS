SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- 1. FIX: Mover registros a la empresa correcta LOLS (77.085.560-8) y borrar la errónea (76.000.000-0)
SET @id_ok = (SELECT id FROM empresas WHERE rut = '77.085.560-8' LIMIT 1);
SET @id_err = (SELECT id FROM empresas WHERE rut = '76.000.000-0' LIMIT 1);
UPDATE trabajadores SET empresa_id = @id_ok WHERE empresa_id = @id_err AND @id_ok IS NOT NULL;
UPDATE obras SET empresa_id = @id_ok WHERE empresa_id = @id_err AND @id_ok IS NOT NULL;
DELETE FROM empresas WHERE rut = '76.000.000-0' AND id = @id_err LIMIT 1;

-- 2. Empresa Destino: MIGUEL ANGEL URRUTIA AGUILERA
SET @id_miguel = (SELECT id FROM empresas WHERE razon_social LIKE '%MIGUEL ANGEL URRUTIA AGUILERA%' LIMIT 1);

INSERT IGNORE INTO cargos (nombre) VALUES ('ENFIERRADOR');
INSERT IGNORE INTO cargos (nombre) VALUES ('OPERADOR PLUMA');
INSERT IGNORE INTO cargos (nombre) VALUES ('CARPINTERO');
INSERT IGNORE INTO cargos (nombre) VALUES ('MAESTRO CONSTRUCCION');
INSERT IGNORE INTO cargos (nombre) VALUES ('JORNAL');
INSERT IGNORE INTO cargos (nombre) VALUES ('AYUDANTE ELECTRICO');
INSERT IGNORE INTO cargos (nombre) VALUES ('MOLDAJERO');
INSERT IGNORE INTO cargos (nombre) VALUES ('SUPERVISOR OBRA');
INSERT IGNORE INTO cargos (nombre) VALUES ('MAESTRO CARPINTERO');
INSERT IGNORE INTO cargos (nombre) VALUES ('SUPERVISOR OBRAS');
INSERT IGNORE INTO cargos (nombre) VALUES ('CERAMISTA-ALBAÑIL');
INSERT IGNORE INTO cargos (nombre) VALUES ('SUPERVISOR DE OBRA');
INSERT IGNORE INTO cargos (nombre) VALUES ('JEFE DE OBRA');
INSERT IGNORE INTO cargos (nombre) VALUES ('MAESTRO  ELECTRICO');
INSERT IGNORE INTO cargos (nombre) VALUES ('MAESTRO SEGUNDA');
INSERT IGNORE INTO cargos (nombre) VALUES ('MAESTRO');
INSERT IGNORE INTO cargos (nombre) VALUES ('ALBAÑIL DE SEGUNDA');
INSERT IGNORE INTO cargos (nombre) VALUES ('AYUDANTE ELECTRICO AVANZADO');
INSERT IGNORE INTO cargos (nombre) VALUES ('AYUDANTE ALBAÑIL');
INSERT IGNORE INTO cargos (nombre) VALUES ('ENCARGADO AREA ELECTRCIDAD');
INSERT IGNORE INTO cargos (nombre) VALUES ('ASIS PREV RIESGOS');

INSERT IGNORE INTO obras (nombre, direccion, empresa_id) VALUES ('RIVAS VICUÑA', 'Sin Dirección', @id_miguel);
INSERT IGNORE INTO obras (nombre, direccion, empresa_id) VALUES ('CERRILLOS', 'Sin Dirección', @id_miguel);
INSERT IGNORE INTO obras (nombre, direccion, empresa_id) VALUES ('DOMEYKO', 'Sin Dirección', @id_miguel);
INSERT IGNORE INTO obras (nombre, direccion, empresa_id) VALUES ('ABATE 80', 'Sin Dirección', @id_miguel);
INSERT IGNORE INTO obras (nombre, direccion, empresa_id) VALUES ('ELECTRICO', 'Sin Dirección', @id_miguel);
INSERT IGNORE INTO obras (nombre, direccion, empresa_id) VALUES ('ABATE 676', 'Sin Dirección', @id_miguel);
INSERT IGNORE INTO obras (nombre, direccion, empresa_id) VALUES ('CONFERENCIA', 'Sin Dirección', @id_miguel);
INSERT IGNORE INTO obras (nombre, direccion, empresa_id) VALUES ('BASCUÑAN 661', 'Sin Dirección', @id_miguel);
INSERT IGNORE INTO obras (nombre, direccion, empresa_id) VALUES ('OFICINA', 'Sin Dirección', @id_miguel);
INSERT IGNORE INTO obras (nombre, direccion, empresa_id) VALUES ('LICENCIA', 'Sin Dirección', @id_miguel);

-- 3. Importación de Trabajadores
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '11357871-8', 'JORGE HELIBERTO', 'ANDRADE', 'PARANCAN', @id_miguel, o.id, c.id, '2025-05-01', 1 FROM obras o, cargos c WHERE o.nombre = 'RIVAS VICUÑA' AND c.nombre = 'ENFIERRADOR' AND o.empresa_id = @id_miguel LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '9579454-8', 'MARCO ANTONIO', 'ALFARO', 'LOPEZ', @id_miguel, o.id, c.id, '2025-03-17', 0 FROM obras o, cargos c WHERE o.nombre = 'CERRILLOS' AND c.nombre = 'OPERADOR PLUMA' AND o.empresa_id = @id_miguel LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '13834135-6', 'ARNALDO ANDRES', 'ALTAMIRANO', 'PUGA', @id_miguel, o.id, c.id, '2025-08-01', 1 FROM obras o, cargos c WHERE o.nombre = 'DOMEYKO' AND c.nombre = 'CARPINTERO' AND o.empresa_id = @id_miguel LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '22562980-3', 'SANTOS FRANCISCO', 'ALVAREZ', 'ASTO', @id_miguel, o.id, c.id, '2025-05-01', 1 FROM obras o, cargos c WHERE o.nombre = 'ABATE 80' AND c.nombre = 'MAESTRO CONSTRUCCION' AND o.empresa_id = @id_miguel LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '11475288-6', 'EUGENIO ELIAS', 'ANANIAS', 'CARDENAS', @id_miguel, o.id, c.id, '2025-10-02', 0 FROM obras o, cargos c WHERE o.nombre = 'ABATE 80' AND c.nombre = 'JORNAL' AND o.empresa_id = @id_miguel LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '13556745-0', 'ANTONIO ANGELO', 'ANTILAO', 'MELIHUEN', @id_miguel, o.id, c.id, '2025-06-10', 1 FROM obras o, cargos c WHERE o.nombre = 'CERRILLOS' AND c.nombre = 'CARPINTERO' AND o.empresa_id = @id_miguel LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '19063148-6', 'JUAN ESTEBAN JESUS', 'ARCE', 'MUÑOZ', @id_miguel, o.id, c.id, '2025-10-07', 1 FROM obras o, cargos c WHERE o.nombre = 'ELECTRICO' AND c.nombre = 'AYUDANTE ELECTRICO' AND o.empresa_id = @id_miguel LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '19188367-5', 'PABLO JAVIER', 'ARENAS', 'MOLINA', @id_miguel, o.id, c.id, '2025-10-14', 1 FROM obras o, cargos c WHERE o.nombre = 'ELECTRICO' AND c.nombre = 'AYUDANTE ELECTRICO' AND o.empresa_id = @id_miguel LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '15436675-K', 'MAURICIO ANDRES', 'BAHAMONDES', 'VALDEBENITO', @id_miguel, o.id, c.id, '2025-06-17', 1 FROM obras o, cargos c WHERE o.nombre = 'RIVAS VICUÑA' AND c.nombre = 'ENFIERRADOR' AND o.empresa_id = @id_miguel LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '10579802-4', 'RICARDO PATRICIO', 'BARAHONA', 'MAYORINCA', @id_miguel, o.id, c.id, '2026-01-19', 1 FROM obras o, cargos c WHERE o.nombre = 'ABATE 676' AND c.nombre = 'JORNAL' AND o.empresa_id = @id_miguel LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '10.896.192-9', 'ARMIN NELSON', 'BARRERA', 'AROS', @id_miguel, o.id, c.id, '2019-12-04', 1 FROM obras o, cargos c WHERE o.nombre = 'ABATE 676' AND c.nombre = 'MOLDAJERO' AND o.empresa_id = @id_miguel LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '20832602-3', 'HECTOR MAXIMILIANO', 'BARRUETO', 'GONALEZ', @id_miguel, o.id, c.id, '2026-01-19', 1 FROM obras o, cargos c WHERE o.nombre = 'CERRILLOS' AND c.nombre = 'JORNAL' AND o.empresa_id = @id_miguel LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '13908922-7', 'JORGE ARTURO', 'BEIZA', 'MONSALVE', @id_miguel, o.id, c.id, '2025-10-21', 1 FROM obras o, cargos c WHERE o.nombre = 'CERRILLOS' AND c.nombre = 'CARPINTERO' AND o.empresa_id = @id_miguel LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '9687486-3', 'JUAN SEGUNDO', 'BELTRAN', 'CATALAN', @id_miguel, o.id, c.id, '2025-07-14', 1 FROM obras o, cargos c WHERE o.nombre = 'DOMEYKO' AND c.nombre = 'CARPINTERO' AND o.empresa_id = @id_miguel LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '17917636-K', 'HUGO PABLO', 'BEÑALDO', 'HUENCHUQUEO', @id_miguel, o.id, c.id, '2025-11-11', 1 FROM obras o, cargos c WHERE o.nombre = 'CONFERENCIA' AND c.nombre = 'JORNAL' AND o.empresa_id = @id_miguel LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '13485457-K', 'EDUARDO ANTONIO', 'BRIONES', 'VARGAS', @id_miguel, o.id, c.id, '2026-02-03', 1 FROM obras o, cargos c WHERE o.nombre = 'CONFERENCIA' AND c.nombre = 'JORNAL' AND o.empresa_id = @id_miguel LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '11327823-4', 'CRISTIAN HERNAN', 'CALDERON', 'CALDERON', @id_miguel, o.id, c.id, '2026-02-16', 1 FROM obras o, cargos c WHERE o.nombre = 'ABATE 80' AND c.nombre = 'JORNAL' AND o.empresa_id = @id_miguel LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '16166557-6', 'ANTONIO ALEJANDRO', 'CACERES', 'ORTIZ', @id_miguel, o.id, c.id, '2025-08-27', 1 FROM obras o, cargos c WHERE o.nombre = 'RIVAS VICUÑA' AND c.nombre = 'ENFIERRADOR' AND o.empresa_id = @id_miguel LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '18407467-2', 'EDUARDO FRANCISCO', 'CANIULLAN', 'MERIÑUAN', @id_miguel, o.id, c.id, '2025-11-24', 1 FROM obras o, cargos c WHERE o.nombre = 'RIVAS VICUÑA' AND c.nombre = 'ENFIERRADOR' AND o.empresa_id = @id_miguel LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '15432940-4', 'JUAN JOSE', 'CARRERA', 'ALARCON', @id_miguel, o.id, c.id, '2025-11-06', 1 FROM obras o, cargos c WHERE o.nombre = 'BASCUÑAN 661' AND c.nombre = 'CARPINTERO' AND o.empresa_id = @id_miguel LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '19740733-6', 'ALFONSO TOMAS', 'CASTILLA', 'AVILA', @id_miguel, o.id, c.id, '2025-08-01', 1 FROM obras o, cargos c WHERE o.nombre = 'ABATE 676' AND c.nombre = 'SUPERVISOR OBRA' AND o.empresa_id = @id_miguel LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '19464410-8', 'LUIS ENRIQUE', 'CERDA', 'BENAVIDES', @id_miguel, o.id, c.id, '2025-07-14', 1 FROM obras o, cargos c WHERE o.nombre = 'CERRILLOS' AND c.nombre = 'MAESTRO CARPINTERO' AND o.empresa_id = @id_miguel LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '19843742-5', 'DIEGO MAURICIO', 'COSGROVE', 'FARIAS', @id_miguel, o.id, c.id, '2025-05-05', 1 FROM obras o, cargos c WHERE o.nombre = 'ABATE 676' AND c.nombre = 'JORNAL' AND o.empresa_id = @id_miguel LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '24809473-7', 'MARCO YOBANI', 'COTRINA', 'HERRERA', @id_miguel, o.id, c.id, '2025-04-05', 1 FROM obras o, cargos c WHERE o.nombre = 'DOMEYKO' AND c.nombre = 'JORNAL' AND o.empresa_id = @id_miguel LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '9037708-6', 'RICARDO ALBERTO', 'COVARRUBIAS', 'VENEGAS', @id_miguel, o.id, c.id, '2025-10-02', 0 FROM obras o, cargos c WHERE o.nombre = 'ABATE 80' AND c.nombre = 'JORNAL' AND o.empresa_id = @id_miguel LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '22266844-1', 'CELSO ELI', 'CHUQUIRUNA', 'CABRERA', @id_miguel, o.id, c.id, '2026-01-07', 1 FROM obras o, cargos c WHERE o.nombre = 'CONFERENCIA' AND c.nombre = 'JORNAL' AND o.empresa_id = @id_miguel LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '25963507-1', 'SONY', 'DERATIS', '', @id_miguel, o.id, c.id, '2025-12-01', 1 FROM obras o, cargos c WHERE o.nombre = 'ABATE 80' AND c.nombre = 'JORNAL' AND o.empresa_id = @id_miguel LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '25430925-7', 'JIMMI JORGE', 'DIAZ', 'IBARRA', @id_miguel, o.id, c.id, '2025-04-01', 1 FROM obras o, cargos c WHERE o.nombre = 'BASCUÑAN 661' AND c.nombre = 'CARPINTERO' AND o.empresa_id = @id_miguel LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '15561760-8', 'PABLO ANOTNIO', 'DIAZ', 'ORELLANA', @id_miguel, o.id, c.id, '2026-01-19', 0 FROM obras o, cargos c WHERE o.nombre = 'CERRILLOS' AND c.nombre = 'JORNAL' AND o.empresa_id = @id_miguel LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '26622042-1', 'GASPIN', 'DIOMAITRE', '', @id_miguel, o.id, c.id, '2025-04-01', 1 FROM obras o, cargos c WHERE o.nombre = 'ABATE 676' AND c.nombre = 'JORNAL' AND o.empresa_id = @id_miguel LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '18480810-2', 'PABLO MOISES', 'DONOSO', 'LEPIQUEO', @id_miguel, o.id, c.id, '2026-01-19', 1 FROM obras o, cargos c WHERE o.nombre = 'RIVAS VICUÑA' AND c.nombre = 'ENFIERRADOR' AND o.empresa_id = @id_miguel LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '12482042-1', 'MIGUEL ANGEL', 'ELGUETA', 'NEIRA', @id_miguel, o.id, c.id, '2025-10-02', 1 FROM obras o, cargos c WHERE o.nombre = 'ABATE 80' AND c.nombre = 'JORNAL' AND o.empresa_id = @id_miguel LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '13905762-7', 'FELIPE EDUARDO', 'ESCOBAR', 'TAPIA', @id_miguel, o.id, c.id, '2025-11-01', 1 FROM obras o, cargos c WHERE o.nombre = 'OFICINA' AND c.nombre = 'SUPERVISOR OBRAS' AND o.empresa_id = @id_miguel LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '18121711-1', 'FIDEL IGNACIO', 'ESPINOZA', 'DONAIRE', @id_miguel, o.id, c.id, '2025-11-24', 1 FROM obras o, cargos c WHERE o.nombre = 'RIVAS VICUÑA' AND c.nombre = 'ENFIERRADOR' AND o.empresa_id = @id_miguel LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '7693947-0', 'MAXIMIANO ANDRES', 'FERNANDEZ', 'SANDOVAL', @id_miguel, o.id, c.id, '2025-06-16', 1 FROM obras o, cargos c WHERE o.nombre = 'ABATE 80' AND c.nombre = 'CERAMISTA-ALBAÑIL' AND o.empresa_id = @id_miguel LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '9874042-2', 'LUIS ALBERTO', 'FIGUEROA', 'MUÑOZ', @id_miguel, o.id, c.id, '2025-10-16', 1 FROM obras o, cargos c WHERE o.nombre = 'CERRILLOS' AND c.nombre = 'MAESTRO CARPINTERO' AND o.empresa_id = @id_miguel LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '24840662-3', 'PHANIEL', 'FRANCOIS', '', @id_miguel, o.id, c.id, '2023-08-01', 1 FROM obras o, cargos c WHERE o.nombre = 'RIVAS VICUÑA' AND c.nombre = 'ENFIERRADOR' AND o.empresa_id = @id_miguel LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '19202461-7', 'CARLOS EDUARDO', 'FUENTES', 'ZAPATA', @id_miguel, o.id, c.id, '2025-10-28', 1 FROM obras o, cargos c WHERE o.nombre = 'RIVAS VICUÑA' AND c.nombre = 'ENFIERRADOR' AND o.empresa_id = @id_miguel LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '18066057-7', 'LUIS ANDRES', 'GALVEZ', 'VENEGAS', @id_miguel, o.id, c.id, '2025-11-06', 1 FROM obras o, cargos c WHERE o.nombre = 'ABATE 676' AND c.nombre = 'JORNAL' AND o.empresa_id = @id_miguel LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '13012391-0', 'IGOR ANDRES', 'GARCIA', 'MORALES', @id_miguel, o.id, c.id, '2025-12-01', 0 FROM obras o, cargos c WHERE o.nombre = 'CERRILLOS' AND c.nombre = 'JORNAL' AND o.empresa_id = @id_miguel LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '9537545-6', 'REINALDO ANTONIO', 'GONZALEZ', 'BENAVIDES', @id_miguel, o.id, c.id, '2025-06-01', 1 FROM obras o, cargos c WHERE o.nombre = 'ABATE 80' AND c.nombre = 'CARPINTERO' AND o.empresa_id = @id_miguel LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '15462906-8', 'JORGE LUIS', 'GONZALEZ', 'CAMPOS', @id_miguel, o.id, c.id, '2025-07-28', 1 FROM obras o, cargos c WHERE o.nombre = 'BASCUÑAN 661' AND c.nombre = 'JORNAL' AND o.empresa_id = @id_miguel LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '18794428-7', 'LUIS GERARDO', 'GUANE', 'PRADENAS', @id_miguel, o.id, c.id, '2025-08-07', 0 FROM obras o, cargos c WHERE o.nombre = 'ELECTRICO' AND c.nombre = 'AYUDANTE ELECTRICO' AND o.empresa_id = @id_miguel LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '10568958-6', 'VICTOR HERIBERTO', 'GUERRERO', 'VILLAGRAN', @id_miguel, o.id, c.id, '2026-01-01', 1 FROM obras o, cargos c WHERE o.nombre = 'CERRILLOS' AND c.nombre = 'CARPINTERO' AND o.empresa_id = @id_miguel LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '9900049-K', 'CARLOS OMAR', 'GUIÑEZ', 'LEYTON', @id_miguel, o.id, c.id, '2026-01-07', 0 FROM obras o, cargos c WHERE o.nombre = 'CONFERENCIA' AND c.nombre = 'JORNAL' AND o.empresa_id = @id_miguel LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '16844907-0', 'HECTOR ARIEL', 'HERRERA', 'TORO', @id_miguel, o.id, c.id, '2025-07-21', 1 FROM obras o, cargos c WHERE o.nombre = 'CERRILLOS' AND c.nombre = 'SUPERVISOR DE OBRA' AND o.empresa_id = @id_miguel LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '9.618.004-7', 'ROSENDO JUAN', 'HIDALGO', 'NAVARRO', @id_miguel, o.id, c.id, '2019-07-24', 1 FROM obras o, cargos c WHERE o.nombre = 'BASCUÑAN 661' AND c.nombre = 'JORNAL' AND o.empresa_id = @id_miguel LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '14340401-3', 'JUAN ESTEBAN', 'HUERALAO', 'BUSTOS', @id_miguel, o.id, c.id, '2025-10-13', 1 FROM obras o, cargos c WHERE o.nombre = 'CERRILLOS' AND c.nombre = 'CARPINTERO' AND o.empresa_id = @id_miguel LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '13556233-5', 'RODRIGO EDUARDO', 'HUERALAO', 'BUSTOS', @id_miguel, o.id, c.id, '2025-10-13', 1 FROM obras o, cargos c WHERE o.nombre = 'CERRILLOS' AND c.nombre = 'CARPINTERO' AND o.empresa_id = @id_miguel LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '17709144-8', 'MARCO ANTONIO', 'HUILCALEO', 'RIOBO', @id_miguel, o.id, c.id, '2026-01-01', 0 FROM obras o, cargos c WHERE o.nombre = 'DOMEYKO' AND c.nombre = 'JORNAL' AND o.empresa_id = @id_miguel LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '12038054-0', 'MANUEL ENRQUE', 'ILLANES', 'NAVARRETE', @id_miguel, o.id, c.id, '2026-01-19', 1 FROM obras o, cargos c WHERE o.nombre = 'CERRILLOS' AND c.nombre = 'JORNAL' AND o.empresa_id = @id_miguel LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '16692141-4', 'CARLOS JAVUER', 'JOFRE', 'REYES', @id_miguel, o.id, c.id, '2025-03-25', 0 FROM obras o, cargos c WHERE o.nombre = 'DOMEYKO' AND c.nombre = 'JORNAL' AND o.empresa_id = @id_miguel LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '17485365-7', 'ALEXANDER FLORIDOR', 'KRAULE', 'AYALA', @id_miguel, o.id, c.id, '2026-02-16', 1 FROM obras o, cargos c WHERE o.nombre = 'BASCUÑAN 661' AND c.nombre = 'JORNAL' AND o.empresa_id = @id_miguel LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '11361424-2', 'FERNANDO GIOVANNI', 'LARA', 'VALDENEGRO', @id_miguel, o.id, c.id, '2024-03-01', 1 FROM obras o, cargos c WHERE o.nombre = 'LICENCIA' AND c.nombre = 'ENFIERRADOR' AND o.empresa_id = @id_miguel LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '19832455-8', 'BASTIAN MAURICIO', 'LAVIN', 'CORDOBA', @id_miguel, o.id, c.id, '2025-06-02', 1 FROM obras o, cargos c WHERE o.nombre = 'ABATE 676' AND c.nombre = 'JORNAL' AND o.empresa_id = @id_miguel LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '11728614-2', 'PATRICIO RICHARD', 'LAZO', 'REYES', @id_miguel, o.id, c.id, '2025-12-16', 1 FROM obras o, cargos c WHERE o.nombre = 'BASCUÑAN 661' AND c.nombre = 'CARPINTERO' AND o.empresa_id = @id_miguel LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '18086144-0', 'FRANK IGNACIO', 'LEON', 'LEON', @id_miguel, o.id, c.id, '2025-11-24', 0 FROM obras o, cargos c WHERE o.nombre = 'RIVAS VICUÑA' AND c.nombre = 'ENFIERRADOR' AND o.empresa_id = @id_miguel LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '22281583-5', 'BENJAMIN SALVADOR', 'LIZANA', 'JARA', @id_miguel, o.id, c.id, '2025-09-22', 1 FROM obras o, cargos c WHERE o.nombre = 'DOMEYKO' AND c.nombre = 'JORNAL' AND o.empresa_id = @id_miguel LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '13287541-3', 'JUAN MANUEL', 'LUNA', 'OYARCE', @id_miguel, o.id, c.id, '2025-08-01', 1 FROM obras o, cargos c WHERE o.nombre = 'RIVAS VICUÑA' AND c.nombre = 'ENFIERRADOR' AND o.empresa_id = @id_miguel LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '9674025-5', 'FERNANDO ROBERTO', 'MARAMBIO', 'RODRIGUEZ', @id_miguel, o.id, c.id, '2026-01-20', 1 FROM obras o, cargos c WHERE o.nombre = 'BASCUÑAN 661' AND c.nombre = 'JORNAL' AND o.empresa_id = @id_miguel LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '13808467-1', 'PATRICIO ENRIQUE', 'MEDINA', 'ZAMBRANO', @id_miguel, o.id, c.id, '2025-12-01', 1 FROM obras o, cargos c WHERE o.nombre = 'ABATE 676' AND c.nombre = 'CARPINTERO' AND o.empresa_id = @id_miguel LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '21261945-0', 'LUCAS NICOLAS', 'MENESES', 'CANDIA', @id_miguel, o.id, c.id, '2025-09-01', 1 FROM obras o, cargos c WHERE o.nombre = 'ELECTRICO' AND c.nombre = 'AYUDANTE ELECTRICO' AND o.empresa_id = @id_miguel LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '14.033.330-1', 'JOSE DANIEL', 'MILLANAO', 'QUIDEL', @id_miguel, o.id, c.id, '2019-07-30', 1 FROM obras o, cargos c WHERE o.nombre = 'ABATE 676' AND c.nombre = 'CARPINTERO' AND o.empresa_id = @id_miguel LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '28909083-5', 'HENRY EFRAIN', 'MOLINA', 'AJSARA', @id_miguel, o.id, c.id, '2026-01-13', 1 FROM obras o, cargos c WHERE o.nombre = 'ELECTRICO' AND c.nombre = 'AYUDANTE ELECTRICO' AND o.empresa_id = @id_miguel LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '13054995-0', 'VICTOR ALFREDO', 'MORALES', 'ARRIAGADA', @id_miguel, o.id, c.id, '2026-02-17', 1 FROM obras o, cargos c WHERE o.nombre = 'CONFERENCIA' AND c.nombre = 'CARPINTERO' AND o.empresa_id = @id_miguel LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '13156688-3', 'ROLANDO MARCELO', 'MORENO', 'PAILLALEF', @id_miguel, o.id, c.id, '2025-10-21', 0 FROM obras o, cargos c WHERE o.nombre = 'CONFERENCIA' AND c.nombre = 'CARPINTERO' AND o.empresa_id = @id_miguel LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '13.922.197-4', 'JORGE LUIS', 'MUÑOZ', 'NARVAEZ', @id_miguel, o.id, c.id, '2025-03-01', 0 FROM obras o, cargos c WHERE o.nombre = 'DOMEYKO' AND c.nombre = 'JEFE DE OBRA' AND o.empresa_id = @id_miguel LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '20132415-7', 'ESTEBAN NICOLAS', 'MUÑOZ', 'VILLALOBOS', @id_miguel, o.id, c.id, '2026-02-16', 1 FROM obras o, cargos c WHERE o.nombre = 'CONFERENCIA' AND c.nombre = 'JORNAL' AND o.empresa_id = @id_miguel LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '15844429-1', 'CARLOS EDUARDO', 'NAVARRRO', 'MUÑOZ', @id_miguel, o.id, c.id, '2025-08-01', 1 FROM obras o, cargos c WHERE o.nombre = 'ABATE 80' AND c.nombre = 'CARPINTERO' AND o.empresa_id = @id_miguel LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '26.915.909-K', 'WILFRID', 'NOEL', '', @id_miguel, o.id, c.id, '2019-09-24', 1 FROM obras o, cargos c WHERE o.nombre = 'DOMEYKO' AND c.nombre = 'JORNAL' AND o.empresa_id = @id_miguel LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '19.844.926-1', 'SEBASTIAN ANDRES', 'NUÑEZ', 'MUÑOZ', @id_miguel, o.id, c.id, '2025-07-01', 1 FROM obras o, cargos c WHERE o.nombre = 'ELECTRICO' AND c.nombre = 'MAESTRO  ELECTRICO' AND o.empresa_id = @id_miguel LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '16044233-6', 'PABLO ANRES', 'OLIVOS', 'SALINAS', @id_miguel, o.id, c.id, '2026-01-12', 1 FROM obras o, cargos c WHERE o.nombre = 'CERRILLOS' AND c.nombre = 'JORNAL' AND o.empresa_id = @id_miguel LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '21178718-K', 'OLIVER MATIAS', 'OPTIZ', 'AGUILERA', @id_miguel, o.id, c.id, '2025-09-11', 1 FROM obras o, cargos c WHERE o.nombre = 'ELECTRICO' AND c.nombre = 'AYUDANTE ELECTRICO' AND o.empresa_id = @id_miguel LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '15534118-1', 'MARCELO ENRIQUE', 'ORELLANA', 'POZO', @id_miguel, o.id, c.id, '2024-11-04', 1 FROM obras o, cargos c WHERE o.nombre = 'BASCUÑAN 661' AND c.nombre = 'JORNAL' AND o.empresa_id = @id_miguel LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '186391180-2', 'LUIS FELIPE', 'PALMA', 'LEVIPAN', @id_miguel, o.id, c.id, '2025-10-06', 1 FROM obras o, cargos c WHERE o.nombre = 'RIVAS VICUÑA' AND c.nombre = 'ENFIERRADOR' AND o.empresa_id = @id_miguel LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '20281400-K', 'MATIAS ANDRES', 'PEÑA', 'HERNANDEZ', @id_miguel, o.id, c.id, '2026-01-12', 1 FROM obras o, cargos c WHERE o.nombre = 'BASCUÑAN 661' AND c.nombre = 'JORNAL' AND o.empresa_id = @id_miguel LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '8110054-3', 'JOSE RIGOBERTO', 'PEÑA', 'TAPIA', @id_miguel, o.id, c.id, '2026-01-16', 1 FROM obras o, cargos c WHERE o.nombre = 'RIVAS VICUÑA' AND c.nombre = 'ENFIERRADOR' AND o.empresa_id = @id_miguel LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '7930981-8', 'JUAN ANTONIO', 'PEREZ', 'ZELADA', @id_miguel, o.id, c.id, '2025-08-01', 1 FROM obras o, cargos c WHERE o.nombre = 'ABATE 676' AND c.nombre = 'MAESTRO SEGUNDA' AND o.empresa_id = @id_miguel LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '15399617-2', 'EDUARDO ALEJANDRO', 'POBLETE', 'LIBERONA', @id_miguel, o.id, c.id, '2025-12-01', 0 FROM obras o, cargos c WHERE o.nombre = 'DOMEYKO' AND c.nombre = 'CARPINTERO' AND o.empresa_id = @id_miguel LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '25.075.612-7', 'JOHNNY', 'QUEREVALU', 'GODOS', @id_miguel, o.id, c.id, '2019-05-22', 1 FROM obras o, cargos c WHERE o.nombre = 'BASCUÑAN 661' AND c.nombre = 'MAESTRO' AND o.empresa_id = @id_miguel LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '17926174-K', 'PARIK FERNANDO', 'REYES', 'HENRIQUEZ', @id_miguel, o.id, c.id, '2026-01-20', 1 FROM obras o, cargos c WHERE o.nombre = 'CERRILLOS' AND c.nombre = 'JORNAL' AND o.empresa_id = @id_miguel LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '10546094-5', 'JAIME ANTONIO', 'RIQUELME', 'POLANCO', @id_miguel, o.id, c.id, '2026-02-11', 0 FROM obras o, cargos c WHERE o.nombre = 'ELECTRICO' AND c.nombre = 'AYUDANTE ELECTRICO' AND o.empresa_id = @id_miguel LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '14699315-K', 'LUIS ENRIQUE', 'ROJO', 'GUARNIZ', @id_miguel, o.id, c.id, '2026-02-09', 1 FROM obras o, cargos c WHERE o.nombre = 'BASCUÑAN 661' AND c.nombre = 'ALBAÑIL DE SEGUNDA' AND o.empresa_id = @id_miguel LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '15669600-5', 'MAURICIO ALEJANDRO', 'SAAVEDRA', 'LOYOLA', @id_miguel, o.id, c.id, '2026-01-07', 1 FROM obras o, cargos c WHERE o.nombre = 'CONFERENCIA' AND c.nombre = 'JORNAL' AND o.empresa_id = @id_miguel LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '20043059-K', 'BRIAN ALEJANDRO', 'SAEZ', 'CAÑETE', @id_miguel, o.id, c.id, '2025-10-01', 1 FROM obras o, cargos c WHERE o.nombre = 'CERRILLOS' AND c.nombre = 'JORNAL' AND o.empresa_id = @id_miguel LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '19023096-1', 'FELIPE ALEJANDRO', 'SANDOVAL', 'JORQUERA', @id_miguel, o.id, c.id, '2025-03-18', 0 FROM obras o, cargos c WHERE o.nombre = 'DOMEYKO' AND c.nombre = 'JORNAL' AND o.empresa_id = @id_miguel LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '11755729-4', 'RAUL ANTONIO', 'SEPULVEDA', 'MONTES', @id_miguel, o.id, c.id, '2026-02-03', 0 FROM obras o, cargos c WHERE o.nombre = 'CONFERENCIA' AND c.nombre = 'JORNAL' AND o.empresa_id = @id_miguel LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '19754969-6', 'CRISTIAN EDUARDO', 'TAGLE', 'VIZCARRA', @id_miguel, o.id, c.id, '2026-02-16', 1 FROM obras o, cargos c WHERE o.nombre = 'ELECTRICO' AND c.nombre = 'AYUDANTE ELECTRICO AVANZADO' AND o.empresa_id = @id_miguel LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '9571188-K', 'JUAN GUILLERMO', 'TORO', 'NAVARRO', @id_miguel, o.id, c.id, '2025-12-10', 1 FROM obras o, cargos c WHERE o.nombre = 'ELECTRICO' AND c.nombre = 'AYUDANTE ELECTRICO AVANZADO' AND o.empresa_id = @id_miguel LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '15689506-7', 'DANILO ANDRES', 'TRANAMIL', 'REYES', @id_miguel, o.id, c.id, '2025-06-01', 1 FROM obras o, cargos c WHERE o.nombre = 'CONFERENCIA' AND c.nombre = 'AYUDANTE ALBAÑIL' AND o.empresa_id = @id_miguel LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '7.546.352-9', 'MIGUEL ANGEL', 'URRUTIA', 'AGUILERA', @id_miguel, o.id, c.id, '2019-05-01', 1 FROM obras o, cargos c WHERE o.nombre = 'ABATE 676' AND c.nombre = 'CARPINTERO' AND o.empresa_id = @id_miguel LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '18764855-6', 'RODRIGO ANDRES', 'VALDBENITO', 'TORRES', @id_miguel, o.id, c.id, '2026-02-02', 0 FROM obras o, cargos c WHERE o.nombre = 'ELECTRICO' AND c.nombre = 'ENCARGADO AREA ELECTRCIDAD' AND o.empresa_id = @id_miguel LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '18075341-9', 'JHOAN PATRICIO', 'VASQUEZ', 'SILVA', @id_miguel, o.id, c.id, '2026-01-01', 1 FROM obras o, cargos c WHERE o.nombre = 'BASCUÑAN 661' AND c.nombre = 'JORNAL' AND o.empresa_id = @id_miguel LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '22635372-0', 'CARLOS ALFREDO', 'VILLANUEVA', 'GUTIERREZ', @id_miguel, o.id, c.id, '2025-11-10', 1 FROM obras o, cargos c WHERE o.nombre = 'DOMEYKO' AND c.nombre = 'ASIS PREV RIESGOS' AND o.empresa_id = @id_miguel LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '12749455-K', 'MANUEL PEDRO', 'VILLAR', 'SANGMEISTER', @id_miguel, o.id, c.id, '2026-02-24', 1 FROM obras o, cargos c WHERE o.nombre = 'BASCUÑAN 661' AND c.nombre = 'JORNAL' AND o.empresa_id = @id_miguel LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '15627654-5', 'ROBINSON ANDRES', 'VILLEGAS', 'GODOY', @id_miguel, o.id, c.id, '2026-02-02', 1 FROM obras o, cargos c WHERE o.nombre = 'BASCUÑAN 661' AND c.nombre = 'JORNAL' AND o.empresa_id = @id_miguel LIMIT 1;
INSERT IGNORE INTO trabajadores (rut, nombres, apellido_paterno, apellido_materno, empresa_id, obra_id, cargo_id, fecha_ingreso, activo)
SELECT '12374991-K', 'JAIME ANSELMO', 'YEVENES', 'VERA', @id_miguel, o.id, c.id, '2025-07-14', 1 FROM obras o, cargos c WHERE o.nombre = 'CONFERENCIA' AND c.nombre = 'JORNAL' AND o.empresa_id = @id_miguel LIMIT 1;

SET FOREIGN_KEY_CHECKS = 1;
