/**
 * Tarjeta «Documentos físicos» del Inicio (pedido del dueño 2026-10-20: reemplaza a «Asistencia
 * pendiente», que repetía lo que ya dice la tarjeta verde). Lógica PURA, sin DOM, para poder testearla.
 *
 * Junta en una tarjeta lo que RRHH mira primero en Gestiones → Documentos físicos: cuántos documentos
 * pasaron su plazo sin firmar (y cuántos en rojo), en qué etapa se atascan, y dónde están los papeles
 * ahora (impresos sin lote, lotes esperando retiro en oficina, lotes en terreno).
 */
import { ETAPA_LABEL, type AlertasDocumentos, type EtapaDocumento } from '../../documentos-fisicos/documentosAlertas';
import type { PendientesLotes } from '../../documentos-fisicos/documentosFisicos';

/** Subconjunto de `TonoTarjeta` (EncabezadoTarjeta.tsx): se repite aquí porque el jest del front no compila .tsx. */
export type TonoDocumentos = 'rojo' | 'ambar' | 'verde' | 'neutro';

export interface EtapaAtrasada {
    clave: EtapaDocumento | 'lotes';
    texto: string;
    total: number;
    critico: boolean;
}

export interface ResumenDocumentosInicio {
    tono: TonoDocumentos;
    /** Documentos sin firmar fuera de plazo; null = todavía cargando (se pinta «—», nunca un 0 falso). */
    fueraDePlazo: number | null;
    /** Documentos y lotes en rojo (mismo total que la franja de Gestiones). */
    criticos: number;
    /** Dónde se atascan, en el orden del flujo; solo las etapas con algo. */
    etapas: EtapaAtrasada[];
    /** Documentos impresos que todavía no van en ningún lote. */
    impresosSinAsignar: number | null;
    /** Lotes armados para un portador que aún no pasa a buscarlos. */
    lotesEnOficina: number | null;
    /** Lotes que el portador tiene en obra, firmándose. */
    lotesEnTerreno: number | null;
}

const ORDEN_ETAPAS: EtapaDocumento[] = ['sin_imprimir', 'por_retirar', 'por_confirmar', 'en_terreno'];

export function resumenDocumentosInicio(
    alertas: AlertasDocumentos | null,
    lotes: PendientesLotes | null,
    impresosSinAsignar: number | null,
): ResumenDocumentosInicio {
    const lotesAtascados = alertas ? alertas.lotes.sin_confirmar.total + alertas.lotes.en_terreno.total : 0;
    const lotesCriticos = alertas ? alertas.lotes.sin_confirmar.criticos + alertas.lotes.en_terreno.criticos : 0;
    const criticos = alertas ? alertas.criticos + lotesCriticos : 0;

    const etapas: EtapaAtrasada[] = alertas
        ? ORDEN_ETAPAS
            .filter(e => alertas.por_etapa[e].total > 0)
            .map(e => ({ clave: e, texto: ETAPA_LABEL[e], total: alertas.por_etapa[e].total, critico: alertas.por_etapa[e].criticos > 0 }))
        : [];
    if (lotesAtascados > 0) {
        etapas.push({
            clave: 'lotes',
            texto: lotesAtascados === 1 ? 'Lote atascado' : 'Lotes atascados',
            total: lotesAtascados,
            critico: lotesCriticos > 0,
        });
    }

    const tono: TonoDocumentos = !alertas
        ? 'neutro'
        : criticos > 0 ? 'rojo'
            : alertas.total > 0 || lotesAtascados > 0 ? 'ambar'
                : 'verde';

    return {
        tono,
        fueraDePlazo: alertas ? alertas.total : null,
        criticos,
        etapas,
        impresosSinAsignar,
        lotesEnOficina: lotes ? lotes.por_confirmar : null,
        lotesEnTerreno: lotes ? lotes.en_terreno : null,
    };
}
