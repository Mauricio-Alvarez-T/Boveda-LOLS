/**
 * Mensajes de WhatsApp de las acciones del Inicio (dueño 2026-10-23: la acción va donde se ve el problema).
 * Lógica pura, sin DOM. Todos terminan con el mismo pie y ninguno lleva RUT: van a grupos.
 *
 * En producción va solo lo de «obras que no pasaron la lista» (subida 2026-11-19); el resto de los mensajes del
 * Inicio llega con su propia subida.
 */

export const PIE_WHATSAPP = '\n\n_Mensaje generado desde Bóveda LOLS_';

/** «a», «a y b», «a, b y c». */
export const enumerar = (partes: string[]) =>
    partes.length <= 1 ? (partes[0] ?? '') : `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`;

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** «el 20, 21 y 22 de octubre, y el 3 y 17 de noviembre» (fechas 'YYYY-MM-DD' en orden). */
export function diasPorMes(fechas: string[]): string {
    const grupos: { mes: number; dias: number[] }[] = [];
    for (const f of fechas) {
        const [, m, d] = f.slice(0, 10).split('-').map(Number);
        const ultimo = grupos[grupos.length - 1];
        if (ultimo && ultimo.mes === m) ultimo.dias.push(d);
        else grupos.push({ mes: m, dias: [d] });
    }
    const partes = grupos.map(g => `el ${enumerar(g.dias.map(String))} de ${MESES[g.mes - 1]}`);
    return partes.length <= 1 ? (partes[0] ?? '') : `${partes.slice(0, -1).join(', ')}, y ${partes[partes.length - 1]}`;
}

/** «viernes 23 de octubre» de 'YYYY-MM-DD' (en UTC, para que no se corra por zona horaria). */
export function fechaLarga(iso: string): string {
    const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
    return `${DIAS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d} de ${MESES[m - 1]}`;
}

/**
 * Obra que no pasó la lista en días hábiles anteriores (Marcos 2026-11-18): pedir que la pasen. «Hola, en *DOMEYKO*
 * falta la asistencia del martes 17 de noviembre. ¿Pueden pasarla en Bóveda? …».
 */
export function mensajeSinLista(obra: string, fechas: string[]): string {
    // Hasta 3 días con su nombre; más (el último mes, Marcos 2026-11-18), agrupados por mes para que se lea corto.
    const dias = fechas.length <= 3 ? `del ${enumerar(fechas.map(f => fechaLarga(f)))}` : `de ${fechas.length} días: ${diasPorMes(fechas)}`;
    return `Hola, en *${obra}* falta la asistencia ${dias}. ¿Pueden pasarla en Bóveda? `
        + `Si ese día no hubo faena, avísenme para dejarlo anotado. Gracias.${PIE_WHATSAPP}`;
}
