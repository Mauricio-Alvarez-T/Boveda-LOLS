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
