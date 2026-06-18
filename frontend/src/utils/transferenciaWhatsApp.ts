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
    cantidad_recibida?: number | null;
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
 * Formato COMPACTO (2026-06): encabezado código+estado en 1 línea, ruta en 1 línea,
 * grupos de ítems sin líneas en blanco intermedias, pie en 1 línea — sin perder info
 * del proceso (ver docs/reglas/inventario-transferencias.md §Respaldo por WhatsApp).
 *
 * REGLA DE CANTIDADES (null-aware: un 0 explícito SE MUESTRA, NO usar `||`):
 *   pendiente→solicitada · aprobada/en_transito→enviada ?? solicitada ·
 *   recepcion_parcial→enviada + "Recibidas/Faltan" · recibida→recibida ?? enviada ?? solicitada + discrepancia ·
 *   rechazada/cancelada→última conocida + bloque motivo/actor.
 * Emojis con String.fromCodePoint para blindar el encoding.
 */
export function buildTransferenciaWhatsappText({
    t, items, itemsCustom, estadoLabel, origen, destino,
}: BuildWhatsappParams): string {
    const TRUCK = String.fromCodePoint(0x1F69B);
    const PIN = String.fromCodePoint(0x1F4CD);
    const BOX = String.fromCodePoint(0x1F4E6);
    const CART = String.fromCodePoint(0x1F6D2);
    const MEMO = String.fromCodePoint(0x1F4DD);
    const SPEECH = String.fromCodePoint(0x1F4AC);
    const WARN = String.fromCodePoint(0x26A0, 0xFE0F);
    const NO_ENTRY = String.fromCodePoint(0x1F6AB);
    const PERSON = String.fromCodePoint(0x1F464);
    const CHECK = String.fromCodePoint(0x2705);
    const CALENDAR = String.fromCodePoint(0x1F4C5);

    const num = (v: unknown): number => Number(v) || 0;

    const lines: string[] = [];
    // Encabezado compacto: código + estado en una línea; ruta en una línea; fecha compacta.
    lines.push(`${TRUCK} *${t.codigo}* · ${estadoLabel}`);
    lines.push(`${PIN} ${origen} → ${destino}`);
    if (t.fecha_solicitud) lines.push(`${CALENDAR} ${fmtFechaHora(t.fecha_solicitud)}`);

    // Estado terminal: motivo/actor arriba (lo más relevante del respaldo).
    if (t.estado === 'rechazada') {
        lines.push('');
        lines.push(`${NO_ENTRY} *RECHAZADA* · Motivo: ${t.observaciones_rechazo || '—'}`);
        if (t.rechazado_por_nombre) lines.push(`   _Rechazada por: ${t.rechazado_por_nombre}_`);
    } else if (t.estado === 'cancelada') {
        lines.push('');
        lines.push(`${NO_ENTRY} *CANCELADA*`);
        if (t.cancelado_por_nombre) lines.push(`   _Cancelada por: ${t.cancelado_por_nombre}_`);
    }

    if (items.length > 0) {
        const itemsLabel =
            t.estado === 'recibida' ? 'Recibidos' :
            t.estado === 'recepcion_parcial' ? 'En curso' :
            (t.estado === 'aprobada' || t.estado === 'en_transito') ? 'Enviados' :
            'Solicitados';
        lines.push('');
        lines.push(`${BOX} *${itemsLabel} (${items.length})*`);
        items.forEach((it) => {
            // Cantidad por estado (null-aware: un 0 explícito SE MUESTRA).
            let cant: number;
            if (t.estado === 'recibida') {
                cant = it.cantidad_recibida != null ? Number(it.cantidad_recibida)
                    : it.cantidad_enviada != null ? Number(it.cantidad_enviada)
                        : Number(it.cantidad_solicitada);
            } else if (t.estado === 'pendiente') {
                cant = Number(it.cantidad_solicitada);
            } else {
                cant = it.cantidad_enviada != null ? Number(it.cantidad_enviada) : Number(it.cantidad_solicitada);
            }
            const unidad = it.unidad ? ` ${it.unidad}` : '';
            const desc = it.item_descripcion || `Item #${it.item_id}`;
            lines.push(`• ${cant}${unidad} · ${desc}`);
            if (t.estado === 'recepcion_parcial' && it.cantidad_enviada != null) {
                const recibida = num(it.cantidad_recibida);
                lines.push(`   _Recibidas: ${recibida} · Faltan: ${Number(it.cantidad_enviada) - recibida}_`);
            }
            if (
                t.estado === 'recibida' &&
                it.cantidad_enviada != null &&
                it.cantidad_recibida != null &&
                Number(it.cantidad_enviada) !== Number(it.cantidad_recibida)
            ) {
                const diff = Number(it.cantidad_recibida) - Number(it.cantidad_enviada);
                lines.push(`   _Enviadas: ${Number(it.cantidad_enviada)} (${diff > 0 ? '+' : ''}${diff})_`);
            }
            if (it.observacion) lines.push(`   _${it.observacion}_`);
        });
    }

    // Items personalizados: omitir los que el aprobador quitó (aprobado===false).
    const customVisibles = itemsCustom.filter(it => it.aprobado !== false);
    const customAprobada = (it: WhatsappCustomItem) =>
        it.cantidad_aprobada != null ? Number(it.cantidad_aprobada) : Number(it.cantidad);
    const customShown = (it: WhatsappCustomItem) =>
        t.estado === 'recibida' && it.cantidad_recibida != null ? Number(it.cantidad_recibida) : customAprobada(it);
    const fmtCustom = (it: WhatsappCustomItem) => {
        const unidad = it.unidad ? ` ${it.unidad}` : '';
        return `• ${customShown(it)}${unidad} · ${it.descripcion}`;
    };
    const pushCustomProgress = (it: WhatsappCustomItem) => {
        if (t.estado !== 'recepcion_parcial') return;
        const recibida = num(it.cantidad_recibida);
        lines.push(`   _Recibidas: ${recibida} · Faltan: ${customAprobada(it) - recibida}_`);
    };
    const pushCustomRecibida = (it: WhatsappCustomItem) => {
        if (t.estado !== 'recibida' || it.cantidad_recibida == null) return;
        const aprobada = customAprobada(it);
        const recibida = Number(it.cantidad_recibida);
        if (recibida !== aprobada) {
            const diff = recibida - aprobada;
            lines.push(`   _Aprobadas: ${aprobada} (${diff > 0 ? '+' : ''}${diff})_`);
        }
    };
    const aComprar = customVisibles.filter(it => it.fuente !== 'obra');
    const deObra = customVisibles.filter(it => it.fuente === 'obra');
    if (aComprar.length > 0) {
        lines.push('');
        lines.push(`${CART} *Comprar (${aComprar.length})*`);
        aComprar.forEach((it) => {
            lines.push(fmtCustom(it));
            pushCustomProgress(it);
            pushCustomRecibida(it);
            if (it.observacion) lines.push(`   _${it.observacion}_`);
            if (it.nota_aprobador) lines.push(`   _Aprobador: ${it.nota_aprobador}_`);
        });
    }
    if (deObra.length > 0) {
        lines.push('');
        lines.push(`${PIN} *De otra obra (${deObra.length})*`);
        deObra.forEach((it) => {
            const origenObra = it.origen_obra_nombre ? ` → ${it.origen_obra_nombre}` : '';
            lines.push(`${fmtCustom(it)}${origenObra}`);
            pushCustomProgress(it);
            pushCustomRecibida(it);
            if (it.nota_aprobador) lines.push(`   _${it.nota_aprobador}_`);
            else if (it.observacion) lines.push(`   _${it.observacion}_`);
        });
    }

    if (t.motivo) lines.push(`${MEMO} ${t.motivo}`);
    if (t.observaciones) lines.push(`${SPEECH} ${t.observaciones}`);
    if (t.requiere_pionetas) lines.push(`${WARN} Requiere ${t.cantidad_pionetas || ''} pionetas`);

    lines.push('');
    lines.push(`${PERSON} Solic: ${t.solicitante_nombre || '—'} · ${CHECK} Aprob: ${t.aprobador_nombre || '—'}`);
    lines.push(`_Bóveda LOLS_`);

    return lines.join('\n');
}
