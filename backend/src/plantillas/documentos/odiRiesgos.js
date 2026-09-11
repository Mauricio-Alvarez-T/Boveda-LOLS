/**
 * Tabla de riesgos del ODI (Obligación de Informar, DS 44 / ex D.S. 40) — plantilla ODI_D40.
 * Contenido casi estático portado del formato en papel de LOLS (27 riesgos, dos columnas).
 * Es DATO: RRHH/Prevención lo corrige acá sin tocar lógica.
 */
module.exports = [
    { n: 1,  titulo: 'TRABAJOS EN ALTURA', bullets: [
        'Cumplir procedimientos de trabajo seguro y/o instrucciones del supervisor.',
        'Obligatoriedad de uso del arnés de seguridad con su respectivo cabo de vida.',
        'Acceder a sitios altos por escalas seguras y con doble cabo de vida si es necesario.' ] },
    { n: 2,  titulo: 'ELEMENTOS DE PROTECCIÓN PERSONAL', bullets: [
        'Uso obligatorio, permanente y correcto, y mantención de los E.P.P.',
        'Obligatoriedad de solicitar E.P.P. específicos (protectores auditivos, máscaras, arnés, etc.).',
        'Sanciones en caso de no cumplimiento.' ] },
    { n: 3,  titulo: 'EXPOSICIÓN A RIESGOS DE POLVOS Y GASES', bullets: [
        'En trabajos de mezcla de mortero seco y corte de ladrillos debe usar máscara.',
        'En trabajos de picado de hormigón y barridos debe usar mascarillas protectoras.',
        'En ambiente saturado con peligro de inhalación de gases es obligatorio el uso de máscaras de 2 vías con filtro para gases.' ] },
    { n: 4,  titulo: 'MANEJO MANUAL DE MATERIALES', bullets: [
        'Al levantar materiales se deben doblar las rodillas y mantener la espalda lo más recta posible.',
        'Si es necesario se deberán complementar los métodos manuales con elementos auxiliares de apoyo.',
        'Se deberán utilizar los equipos de protección personal, como guantes y calzado de seguridad.' ] },
    { n: 5,  titulo: 'RIESGOS EN FAENAS DE COLOCACIÓN Y DESCIMBRE DE MOLDAJES', bullets: [
        'Acatar instrucciones de trabajo seguro para colocación y descimbre de moldajes.',
        'Delimitar y señalizar las zonas de colocación y descimbre de moldajes.',
        'Disposición de espacios despejados para dejar ordenados los elementos del moldaje.',
        'Usar arnés y líneas de vida el personal que realiza descimbre próximo a vacíos.' ] },
    { n: 6,  titulo: 'TRABAJOS DE MAQUINARIA PESADA Y MOVIMIENTO DE TIERRA', bullets: [
        'Cuando un camión retrocede tramos largos debe haber señalero.',
        'Respete al señalero al guiar maquinarias o camiones en maniobras de retroceso.',
        'Manténgase permanentemente alerta; advierta a sus compañeros cuando vea un equipo en retroceso.',
        'Haga siempre uso de sus EPP, especialmente el chaleco reflectante.' ] },
    { n: 7,  titulo: 'SUPERFICIES DE TRABAJO', bullets: [
        'Riesgos asociados a las distintas superficies de trabajo.',
        'Formas de evitar caídas a un mismo o distinto nivel.',
        'Importancia de inspeccionar constantemente las áreas de trabajo.',
        'Medidas de seguridad en el uso de escalas de mano.',
        'Prohibición de IMPROVISAR superficies de trabajo.' ] },
    { n: 8,  titulo: 'MANEJO DE MATERIALES: MANIOBRAS Y TRABAJOS CON EQUIPOS DE LEVANTE (TIRFOR, TECLES, ESTROBOS, ETC.)', bullets: [
        'Conocer el procedimiento de trabajo seguro para izamiento y elevación.',
        'Conocimiento de las capacidades de los elementos de maniobra: estrobos, grilletes.',
        'Uso seguro de equipos de levante.',
        'Inspección de aparejos antes de iniciar las maniobras.' ] },
    { n: 9,  titulo: 'TRABAJOS DE SOLDADURA', bullets: [
        'Medidas generales de seguridad.',
        'Protección del entorno para evitar incendios.',
        'Conocer y aplicar el procedimiento de trabajo seguro.' ] },
    { n: 10, titulo: 'ESMERIL ANGULAR: USO SEGURO', bullets: [
        'Forma correcta de uso del esmeril angular (discos adecuados a las RPM del equipo y uso de protección).',
        'Formas de control de la proyección de partículas.',
        'Adopción de posturas correctas para realizar operaciones de corte o desbaste.' ] },
    { n: 11, titulo: 'OXICORTE: USO, RIESGOS Y MEDIDAS PREVENTIVAS', bullets: [
        'Operación del equipo solo por personal autorizado.',
        'Medidas preventivas en caso de incendio.' ] },
    { n: 12, titulo: 'HORMIGONADO', bullets: [
        'Conocer y cumplir el procedimiento sobre hormigonado.',
        'Verificar que los vibradores estén conectados a protectores diferenciales.' ] },
    { n: 13, titulo: 'EXCAVACIONES, FORTIFICACIONES, ENTIBACIONES Y TALUDES', bullets: [
        'Aplicar el procedimiento tanto en pilas de socalzado como en cortes.',
        'Reconocimiento del terreno y avisar si observa riesgo de derrumbe.',
        'Mantener las vías de evacuación despejadas.',
        'Nunca provocar socavamientos y evitar la acumulación de material en los bordes de la excavación.',
        'Taludes, entibaciones y accesos.' ] },
    { n: 14, titulo: 'RIESGO ELÉCTRICO', bullets: [
        'Efectos del choque eléctrico.',
        'Recomendaciones para evitar el choque eléctrico.',
        'Importancia de notificar deficiencias de las instalaciones o herramientas eléctricas.',
        'Verificación de que el tablero tenga operativo el protector diferencial.',
        'Prohibición de realizar manipulaciones y/o reparaciones eléctricas si no está capacitado.' ] },
    { n: 15, titulo: 'ORDEN Y ASEO', bullets: [
        'Mantención permanente de la limpieza en las distintas áreas de trabajo.',
        'Resguardar el orden y aseo en las instalaciones de faena.' ] },
    { n: 16, titulo: 'PROCEDIMIENTO OPERACIONAL DE EQUIPOS, MAQUINARIAS Y HERRAMIENTAS', bullets: [
        'Instrucción en los equipos, maquinarias y herramientas a utilizar en la obra.',
        'Empleo de herramientas solo en buen estado.' ] },
    { n: 17, titulo: 'EXPOSICIÓN A RUIDOS', bullets: [
        'Definición de ruidos.',
        'Ruidos peligrosos.',
        'Recomendaciones generales sobre protección auditiva.' ] },
    { n: 18, titulo: 'DESPLAZAMIENTO POR ÁREAS DE TRABAJO', bullets: [
        'Identificar zonas de acceso restringido.',
        'Prohibición de acceso a áreas no autorizadas.',
        'Precaución ante vehículos en movimiento.',
        'Respetar cintas, barreras y señalizaciones de peligro.' ] },
    { n: 19, titulo: 'HIGIENE PERSONAL: RECOMENDACIONES', bullets: [
        'Importancia del aseo personal para evitar enfermedades infectocontagiosas.',
        'Aseo de la ropa de trabajo.' ] },
    { n: 20, titulo: 'SEÑALES Y SEÑALEROS DE ADVERTENCIA', bullets: [
        'Obligación de respetar las señales y a los señaleros.',
        'Cuidado de la señalización existente.' ] },
    { n: 21, titulo: 'COMBUSTIBLE: MANEJO, ALMACENAMIENTO Y TRANSPORTE', bullets: [
        'Características de los combustibles.',
        'Lugar de almacenamiento.',
        'Medidas de seguridad.' ] },
    { n: 22, titulo: 'CAMBIOS DE CONDUCTA, AUTOCUIDADO', bullets: [
        'Definición de autocuidado.',
        'Rol del trabajador en su autoprotección.',
        'Beneficios de una conducta segura.' ] },
    { n: 23, titulo: 'PROHIBICIÓN DEL INGRESO DE TRABAJADORES BAJO LA INFLUENCIA DEL ALCOHOL Y DROGAS', bullets: [
        'Efectos de las drogas en el organismo.',
        'Consecuencias del abuso del alcohol y las drogas.',
        'Sanciones al ingresar a obra en estado de ebriedad o bajo consumo de drogas.' ] },
    { n: 24, titulo: 'IDENTIFICAR ASPECTOS AMBIENTALES', bullets: [
        'Definición de RISES y RILES y su manejo.',
        'Control del ruido.',
        'Uso adecuado del agua.',
        'Protección de flora y fauna.' ] },
    { n: 25, titulo: 'RIESGOS AMBIENTALES: MANEJO DE DESECHOS', bullets: [
        'Medidas de prevención para evitar la contaminación del suelo, agua y aire.',
        'Identificar áreas de acopio.',
        'Importancia del reciclaje.' ] },
    { n: 26, titulo: 'LEY DEL SACO (20.001)', bullets: [
        'Carga máxima de 25 kg para mayores de 18 años.' ] },
    { n: 27, titulo: 'LEY 20.096: PROTECCIÓN A RAYOS UV', bullets: [
        'Obligación de uso de bloqueador solar.' ] },
];
