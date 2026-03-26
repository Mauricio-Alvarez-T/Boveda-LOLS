/**
 * Elimina puntos y guión de un RUT
 */
export const cleanRut = (rut: string): string => {
    return rut.replace(/[^0-9kK]/g, '').toUpperCase();
};

/**
 * Formatea un RUT al estilo XX.XXX.XXX-X
 */
export const formatRut = (rut: string): string => {
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
 * Valida un RUT chileno usando el algoritmo de Módulo 11
 */
export const validateRut = (rut: string): boolean => {
    if (!rut || typeof rut !== 'string') return false;

    const cleaned = cleanRut(rut);
    
    // Un RUT válido en Chile tiene al menos 7 dígitos + 1 verificador (total 8)
    // El máximo es 8 dígitos + 1 verificador (total 9)
    if (cleaned.length < 8 || cleaned.length > 9) return false;

    const dv = cleaned.slice(-1);
    const body = cleaned.slice(0, -1);

    // Calcular Dígito Verificador esperado
    let sum = 0;
    let multiplier = 2;

    for (let i = body.length - 1; i >= 0; i--) {
        sum += parseInt(body[i], 10) * multiplier;
        multiplier = multiplier === 7 ? 2 : multiplier + 1;
    }

    const expectedDvNumeric = 11 - (sum % 11);
    let expectedDv = expectedDvNumeric.toString();
    
    if (expectedDvNumeric === 11) expectedDv = '0';
    if (expectedDvNumeric === 10) expectedDv = 'K';

    return dv === expectedDv;
};
