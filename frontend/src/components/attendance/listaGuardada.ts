/**
 * ¿El día cargado en Asistencia tiene la lista guardada? (Marcos 2026-11-27: «en el botón de whatsapp generar una
 * advertencia … está enviando una asistencia que no ha sido guardada»). Lógica pura, sin DOM.
 *
 * Misma regla que la campana «Importante» (backend `asistenciaSinLista.paso`): cuenta una fila propia, es decir, una
 * que no puso por adelantado un período (licencia, vacaciones, permiso: `de_periodo`, o la fila que el servidor
 * completa desde el período, sin `id`). Esas filas solas NO son una lista. Si TODA la dotación tiene fila (todos de
 * licencia), también cuenta. Caso real: RIVAS VICUÑA 25-11-2026, 3 filas de licencias y vacaciones y nada más; la
 * pantalla proponía «A» al resto y el WhatsApp salió como si la lista estuviera pasada.
 */
export interface FilaDelDia {
    id?: number | null;
    /** 1 si la fila la cubre un período activo (GET /asistencias/obra/:id). */
    de_periodo?: number | boolean | null;
}

export function listaGuardada(registros: FilaDelDia[], dotacion: number): boolean {
    const propias = registros.filter(r => r.id != null && !Number(r.de_periodo)).length;
    return propias > 0 || (registros.length > 0 && registros.length >= dotacion);
}

/** Primeras líneas del WhatsApp cuando se envía igual una asistencia sin guardar (texto aprobado por Marcos). */
export const AVISO_WHATSAPP_NO_GUARDADA =
    '⚠️ *ASISTENCIA NO GUARDADA EN BÓVEDA*\nLas «A» son las propuestas por defecto: falta pasarla y guardarla.\n\n';

/** Igual, cuando la lista estaba guardada pero se cambió algo y no se volvió a guardar. */
export const AVISO_WHATSAPP_CAMBIOS_SIN_GUARDAR =
    '⚠️ *ASISTENCIA NO GUARDADA EN BÓVEDA*\nTiene cambios que no se guardaron: lo guardado en Bóveda es distinto.\n\n';

/**
 * Color del botón Guardar de Asistencia (Marcos 2026-11-27: «que el botón de pasar asistencia esté en rojo mientras no
 * se guarde y que cuando se guarde cambie a color verde para que en terreno sepan»; sin franjas fijas en la pantalla:
 * «para que el cartel no esté todo el tiempo ahí molestando»). El recordatorio es solo el color:
 * - `sin_guardar` (rojo): el día no tiene la lista guardada, o se cambió algo después de guardar.
 * - `guardada` (verde con visto): lo que se ve es lo que quedó guardado.
 * - `cerrado` (gris con candado): un día que ya pasó y esta persona no puede tocar (`diaCerradoPara`).
 * - `normal`: como siempre (sin obra elegida, cargando, sin trabajadores, fin de semana o feriado, o sin permiso).
 */
export type EstadoBotonGuardar = 'sin_guardar' | 'guardada' | 'cerrado' | 'normal';

export function estadoBotonGuardar(p: {
    conObra: boolean;
    cargando: boolean;
    hayTrabajadores: boolean;
    noLaboral: boolean;
    diaCerrado: boolean;
    puedeGuardar: boolean;
    listaGuardada: boolean;
    hayCambios: boolean;
}): EstadoBotonGuardar {
    if (!p.conObra || p.cargando || !p.hayTrabajadores || p.noLaboral) return 'normal';
    if (p.diaCerrado) return 'cerrado';
    if (!p.puedeGuardar) return 'normal';
    return !p.listaGuardada || p.hayCambios ? 'sin_guardar' : 'guardada';
}
