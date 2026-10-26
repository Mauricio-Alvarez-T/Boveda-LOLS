/**
 * Feriados NACIONALES de Chile ya verificados, guardados en Bóveda (2026-10-26).
 *
 * Es el respaldo de la sincronización cuando ninguna fuente en línea responde (ver feriados.service).
 * Cada año se armó con api.boostr.cl y se contrastó con Nager.Date; el único desacuerdo —el viernes
 * 17-09-2027, que Nager omite— se confirmó contra la Ley 20.983 (si el 18 y el 19 de septiembre caen
 * sábado y domingo, el viernes 17 es feriado). Sin feriados regionales (p. ej. Arica, 7 de junio).
 *
 * Formato: [fecha, nombre, irrenunciable?]. Al agregar un año: mismo contraste de dos fuentes y,
 * ante cualquier diferencia, la ley manda. Las elecciones y feriados extraordinarios por ley especial
 * NO están: se agregan a mano en Configuración → Feriados cuando se publican.
 */
module.exports = Object.freeze({
    2026: [
        ['2026-01-01', 'Año Nuevo', true],
        ['2026-04-03', 'Viernes Santo'],
        ['2026-04-04', 'Sábado Santo'],
        ['2026-05-01', 'Día Nacional del Trabajo', true],
        ['2026-05-21', 'Día de las Glorias Navales'],
        ['2026-06-21', 'Día Nacional de los Pueblos Indígenas'],
        ['2026-06-29', 'San Pedro y San Pablo'],
        ['2026-07-16', 'Día de la Virgen del Carmen'],
        ['2026-08-15', 'Asunción de la Virgen'],
        ['2026-09-18', 'Independencia Nacional', true],
        ['2026-09-19', 'Día de las Glorias del Ejército', true],
        ['2026-10-12', 'Encuentro de Dos Mundos'],
        ['2026-10-31', 'Día de las Iglesias Evangélicas y Protestantes'],
        ['2026-11-01', 'Día de Todos los Santos'],
        ['2026-12-08', 'Inmaculada Concepción'],
        ['2026-12-25', 'Navidad', true],
    ],
    2027: [
        ['2027-01-01', 'Año Nuevo', true],
        ['2027-03-26', 'Viernes Santo'],
        ['2027-03-27', 'Sábado Santo'],
        ['2027-05-01', 'Día Nacional del Trabajo', true],
        ['2027-05-21', 'Día de las Glorias Navales'],
        ['2027-06-21', 'Día Nacional de los Pueblos Indígenas'],
        ['2027-06-28', 'San Pedro y San Pablo'],
        ['2027-07-16', 'Día de la Virgen del Carmen'],
        ['2027-08-15', 'Asunción de la Virgen'],
        ['2027-09-17', 'Feriado Adicional Fiestas Patrias'],
        ['2027-09-18', 'Independencia Nacional', true],
        ['2027-09-19', 'Día de las Glorias del Ejército', true],
        ['2027-10-11', 'Encuentro de Dos Mundos'],
        ['2027-10-31', 'Día de las Iglesias Evangélicas y Protestantes'],
        ['2027-11-01', 'Día de Todos los Santos'],
        ['2027-12-08', 'Inmaculada Concepción'],
        ['2027-12-25', 'Navidad', true],
    ],
});
