/**
 * Mensaje WhatsApp de aviso "solicitud de ingreso pendiente de revisión".
 * Función PURA (sin efectos): el envío lo maneja `utils/whatsappShare.ts`.
 *
 * Pedido del dueño (2026-09-08): al terminar la solicitud, poder avisar por
 * WhatsApp que hay una ficha pendiente, con nombre, obra y fecha de contratación.
 * Convenciones del repo: `*negrita*`, `_cursiva_`, guiones, sin emojis
 * (encoding en el redirect), footer "Generado con Bóveda LOLS".
 */
import { fmtFechaCorta } from '../../utils/format';

export interface SolicitudIngresoMensajeInput {
    nombres: string;
    apellido_paterno: string;
    apellido_materno?: string | null;
    obra_nombre?: string | null;
    fecha_ingreso?: string | Date | null;
    solicitante_nombre?: string | null;
}

export function nombreCompletoSolicitud(s: Pick<SolicitudIngresoMensajeInput, 'nombres' | 'apellido_paterno' | 'apellido_materno'>): string {
    return [s.nombres, s.apellido_paterno, s.apellido_materno]
        .map(p => (p ?? '').trim())
        .filter(Boolean)
        .join(' ');
}

/** Fecha legible dd-mm-aaaa desde 'YYYY-MM-DD', ISO con hora o Date. */
export function fechaContratacion(f: string | Date | null | undefined): string {
    if (!f) return '';
    const s = f instanceof Date ? f.toISOString().slice(0, 10) : String(f).slice(0, 10);
    return fmtFechaCorta(s) || s;
}

export function buildSolicitudIngresoMessage(s: SolicitudIngresoMensajeInput): string {
    const lines: string[] = [];
    lines.push('*Solicitud de ingreso de trabajador*');
    lines.push('Pendiente de revisión por administración.');
    lines.push('');
    lines.push(`- Trabajador: ${nombreCompletoSolicitud(s)}`);
    lines.push(`- Obra: ${(s.obra_nombre ?? '').trim() || '(sin obra)'}`);
    lines.push(`- Fecha de contratación: ${fechaContratacion(s.fecha_ingreso) || '(sin fecha)'}`);
    const solicitante = (s.solicitante_nombre ?? '').trim();
    if (solicitante) lines.push(`- Solicitado por: ${solicitante}`);
    lines.push('');
    lines.push('_Generado con Bóveda LOLS_');
    return lines.join('\n');
}
