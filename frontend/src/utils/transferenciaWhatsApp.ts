import type { Transferencia, TransferenciaItem } from '../types/entities';
import { fmtFechaHora } from './fechas';

/**
 * Ítem personalizado (no-catálogo) — subconjunto de campos que necesita el
 * mensaje de WhatsApp. No comparte interfaz con TransferenciaItem (no tiene
 * item_id ni splits).
 */
export interface WhatsappCustomItem {
    descripcion: string;
    cantidad: number;
    unidad?: string | null;
    observacion?: string | null;
    cantidad_aprobada?: number | null;
    aprobado?: boolean;
    nota_aprobador?: string | null;
    fuente?: 'comprar' | 'obra';
    origen_obra_nombre?: string | null;
}

export interface BuildWhatsappParams {
    t: Transferencia;
    items: TransferenciaItem[];
    itemsCustom: WhatsappCustomItem[];
    /** Etiqueta legible del estado (de statusConfig/estadoConfig). */
    estadoLabel: string;
    origen: string;
    destino: string;
}

/**
 * Construye el texto del mensaje de WhatsApp de una transferencia.
 *
 * Función PURA (sin efectos): el envío lo maneja `utils/whatsappShare.ts`.
 * Extraída textualmente de TransferenciaDetail.tsx (refactor Fase 1) — el
 * formato del mensaje NO cambió. Emojis con String.fromCodePoint para blindar
 * el encoding (algunos canales corrompen los SMP en el redirect).
 */
export function buildTransferenciaWhatsappText({
    t, items, itemsCustom, estadoLabel, origen, destino,
}: BuildWhatsappParams): string {
    const TRUCK = String.fromCodePoint(0x1F69B);
    const PIN = String.fromCodePoint(0x1F4CD);
    const TARGET = String.fromCodePoint(0x1F3AF);
    const BOX = String.fromCodePoint(0x1F4E6);
    const CART = String.fromCodePoint(0x1F6D2);
    const MEMO = String.fromCodePoint(0x1F4DD);
    const SPEECH = String.fromCodePoint(0x1F4AC);
    const WARN = String.fromCodePoint(0x26A0, 0xFE0F);
    const PERSON = String.fromCodePoint(0x1F464);
    const CHECK = String.fromCodePoint(0x2705);
    const CALENDAR = String.fromCodePoint(0x1F4C5);

    const lines: string[] = [];
    lines.push(`${TRUCK} *TRANSFERENCIA ${t.codigo}*`);
    lines.push(`Estado: ${estadoLabel}`);
    // Fecha de solicitud — requerimiento jefatura para notificación de pendientes.
    if (t.fecha_solicitud) {
        lines.push(`${CALENDAR} Solicitada: ${fmtFechaHora(t.fecha_solicitud)}`);
    }
    lines.push('');
    lines.push(`${PIN} *Retirar en:* ${origen}`);
    lines.push(`${TARGET} *Entregar en:* ${destino}`);
    lines.push('');
    if (items.length > 0) {
        // Etiqueta y cantidad dependen del estado para reflejar la columna real
        // (Solicit / Enviada / Recibida). recepcion_parcial: muestra acumulado + pendiente.
        const itemsLabel =
            t.estado === 'recibida' ? 'Items recibidos' :
            t.estado === 'recepcion_parcial' ? 'Items con entrega en curso' :
            t.estado === 'aprobada' || t.estado === 'en_transito' ? 'Items enviados' :
            'Items solicitados';
        lines.push(`${BOX} *${itemsLabel} (${items.length}):*`);
        items.forEach((it) => {
            let cant: number;
            if (t.estado === 'recibida') {
                cant = Number(it.cantidad_recibida) || Number(it.cantidad_enviada) || Number(it.cantidad_solicitada);
            } else if (t.estado === 'recepcion_parcial') {
                cant = Number(it.cantidad_enviada) || Number(it.cantidad_solicitada);
            } else if (t.estado === 'aprobada' || t.estado === 'en_transito') {
                cant = Number(it.cantidad_enviada) || Number(it.cantidad_solicitada);
            } else {
                cant = Number(it.cantidad_solicitada);
            }
            const unidad = it.unidad ? ` ${it.unidad}` : '';
            const desc = it.item_descripcion || `Item #${it.item_id}`;
            lines.push(`• ${cant}${unidad} — ${desc}`);
            // recepcion_parcial: lo ya recibido y lo pendiente (qué viaje queda).
            if (t.estado === 'recepcion_parcial' && it.cantidad_enviada != null) {
                const recibida = Number(it.cantidad_recibida) || 0;
                const pendiente = Number(it.cantidad_enviada) - recibida;
                lines.push(`   _Recibidas: ${recibida} · Faltan: ${pendiente}_`);
            }
            // recibida con discrepancia vs enviado → anótala bajo el item.
            if (
                t.estado === 'recibida' &&
                it.cantidad_enviada != null &&
                it.cantidad_recibida != null &&
                Number(it.cantidad_enviada) !== Number(it.cantidad_recibida)
            ) {
                const diff = Number(it.cantidad_recibida) - Number(it.cantidad_enviada);
                const signo = diff > 0 ? '+' : '';
                lines.push(`   _Enviadas: ${Number(it.cantidad_enviada)} (${signo}${diff})_`);
            }
            if (it.observacion) lines.push(`   _${it.observacion}_`);
        });
        lines.push('');
    }
    // Items personalizados (a comprar): sección separada. Omitir los que el
    // aprobador quitó (aprobado===false); usar cantidad aprobada cuando exista.
    const customVisibles = itemsCustom.filter(it => it.aprobado !== false);
    const fmtCustom = (it: WhatsappCustomItem) => {
        const cant = it.cantidad_aprobada != null ? it.cantidad_aprobada : it.cantidad;
        const unidad = it.unidad ? ` ${it.unidad}` : '';
        return `• ${cant}${unidad} — ${it.descripcion}`;
    };
    const aComprar = customVisibles.filter(it => it.fuente !== 'obra');
    const deObra = customVisibles.filter(it => it.fuente === 'obra');
    if (aComprar.length > 0) {
        lines.push(`${CART} *Por comprar (${aComprar.length}):*`);
        aComprar.forEach((it) => {
            lines.push(fmtCustom(it));
            if (it.observacion) lines.push(`   _${it.observacion}_`);
            if (it.nota_aprobador) lines.push(`   _Aprobador: ${it.nota_aprobador}_`);
        });
        lines.push('');
    }
    if (deObra.length > 0) {
        lines.push(`📍 *Traer de otra obra (${deObra.length}):*`);
        deObra.forEach((it) => {
            const origenObra = it.origen_obra_nombre ? ` → traer de ${it.origen_obra_nombre}` : '';
            lines.push(`${fmtCustom(it)}${origenObra}`);
            if (it.nota_aprobador) lines.push(`   _${it.nota_aprobador}_`);
            else if (it.observacion) lines.push(`   _${it.observacion}_`);
        });
        lines.push('');
    }
    if (t.motivo) lines.push(`${MEMO} *Motivo:* ${t.motivo}`);
    if (t.observaciones) lines.push(`${SPEECH} *Observaciones:* ${t.observaciones}`);
    if (t.requiere_pionetas) {
        lines.push(`${WARN} *Requiere ${t.cantidad_pionetas || ''} pionetas*`);
    }
    lines.push('');
    const solicitante = t.solicitante_nombre || '—';
    const aprobador = t.aprobador_nombre || '—';
    lines.push(`${PERSON} Solicitante: ${solicitante}`);
    lines.push(`${CHECK} Aprobador: ${aprobador}`);
    lines.push('');
    lines.push(`_Bóveda LOLS_`);

    return lines.join('\n');
}
