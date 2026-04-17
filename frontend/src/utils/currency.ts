// Pesos chilenos: sin decimales. Formato "$14.000" (punto miles, prefijo $).
export const formatCLP = (value: number | string | null | undefined): string => {
    if (value === null || value === undefined || value === '') return '';
    const n = typeof value === 'string' ? Number(value) : value;
    if (!Number.isFinite(n)) return '';
    return `$${Math.round(n).toLocaleString('es-CL')}`;
};

// Acepta "$14.000", "14.000", "14000" → 14000. Strip todo lo no-dígito.
export const parseCLP = (str: string): number => {
    const digits = str.replace(/[^\d]/g, '');
    return digits ? Number(digits) : 0;
};
