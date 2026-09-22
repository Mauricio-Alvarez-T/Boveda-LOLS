/**
 * Elimina puntos y guión de un RUT
 */
const cleanRut = (rut) => {
    if (!rut) return '';
    return String(rut).replace(/[^0-9kK]/g, '').toUpperCase();
};

/**
 * Formatea un RUT al estilo XX.XXX.XXX-X
 */
const formatRut = (rut) => {
    const cleaned = cleanRut(rut);
    if (!cleaned) return '';

    let result = cleaned;
    if (cleaned.length > 1) {
        // Separar el dígito verificador
        const dv = cleaned.slice(-1);
        const numbers = cleaned.slice(0, -1);
        
        // Agregar puntos a los números
        const formattedNumbers = numbers.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
        
        // Unir con guión
        result = `${formattedNumbers}-${dv}`;
    }
    
    return result;
};

/**
 * Dígito verificador (Módulo 11) del cuerpo de un RUT, sin el DV.
 * Acepta número o string de dígitos; devuelve '0'-'9' o 'K'. '' si el cuerpo no es válido.
 * Lo usa `validateRut` y el sembrado de datos ficticios de staging (saneoStaging.service).
 */
const dvDeCuerpo = (cuerpo) => {
    const body = String(cuerpo).replace(/\D/g, '');
    if (!body) return '';

    let sum = 0;
    let multiplier = 2;

    for (let i = body.length - 1; i >= 0; i--) {
        sum += parseInt(body[i], 10) * multiplier;
        multiplier = multiplier === 7 ? 2 : multiplier + 1;
    }

    const expectedDvNumeric = 11 - (sum % 11);
    if (expectedDvNumeric === 11) return '0';
    if (expectedDvNumeric === 10) return 'K';
    return expectedDvNumeric.toString();
};

/**
 * Valida un RUT chileno usando el algoritmo de Módulo 11
 */
const validateRut = (rut) => {
    if (!rut || typeof rut !== 'string') return false;

    const cleaned = cleanRut(rut);

    // Un RUT válido en Chile tiene al menos 7 dígitos + 1 verificador (total 8)
    if (cleaned.length < 8 || cleaned.length > 9) return false;

    const dv = cleaned.slice(-1);
    const body = cleaned.slice(0, -1);

    return dv === dvDeCuerpo(body);
};

module.exports = {
    cleanRut,
    formatRut,
    validateRut,
    dvDeCuerpo
};
