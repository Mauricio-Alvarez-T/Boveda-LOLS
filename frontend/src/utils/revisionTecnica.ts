/**
 * Calendario de Revisión Técnica — Ministerio de Transportes y Telecomunicaciones (Chile).
 *
 * Para vehículos particulares livianos, el mes de vencimiento de la revisión
 * técnica se determina por el ÚLTIMO DÍGITO de la patente.
 *
 * Referencia oficial (los meses de marzo y diciembre no tienen dígito asignado):
 *   9 → Enero      0 → Febrero    1 → Abril       2 → Mayo
 *   3 → Junio      4 → Julio      5 → Agosto      6 → Septiembre
 *   7 → Octubre    8 → Noviembre
 */

const MESES_POR_DIGITO: Record<string, { nombre: string; numero: number }> = {
    '9': { nombre: 'Enero',      numero: 1 },
    '0': { nombre: 'Febrero',    numero: 2 },
    '1': { nombre: 'Abril',      numero: 4 },
    '2': { nombre: 'Mayo',       numero: 5 },
    '3': { nombre: 'Junio',      numero: 6 },
    '4': { nombre: 'Julio',      numero: 7 },
    '5': { nombre: 'Agosto',     numero: 8 },
    '6': { nombre: 'Septiembre', numero: 9 },
    '7': { nombre: 'Octubre',    numero: 10 },
    '8': { nombre: 'Noviembre',  numero: 11 },
};

/** Extrae el último dígito numérico de la patente. Devuelve null si no hay dígitos. */
export function ultimoDigitoPatente(patente?: string | null): string | null {
    if (!patente) return null;
    const soloDigitos = patente.replace(/[^0-9]/g, '');
    if (!soloDigitos) return null;
    return soloDigitos[soloDigitos.length - 1];
}

/** Nombre del mes de revisión técnica según la patente, o null si no se puede determinar. */
export function mesRevisionPorPatente(patente?: string | null): string | null {
    const d = ultimoDigitoPatente(patente);
    if (d === null) return null;
    return MESES_POR_DIGITO[d]?.nombre ?? null;
}

/** Número de mes (1-12) de revisión técnica según la patente, o null. */
export function numeroMesRevisionPorPatente(patente?: string | null): number | null {
    const d = ultimoDigitoPatente(patente);
    if (d === null) return null;
    return MESES_POR_DIGITO[d]?.numero ?? null;
}
