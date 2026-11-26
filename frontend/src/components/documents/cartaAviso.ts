/**
 * Carta de aviso de término de contrato (mig 160; Marcos 2026-11-26: «necesidades de la empresa, vencimiento de plazo
 * y no concurrencia… esas tres cartas… y que solo Matías pueda imprimir»). Lógica pura del modal (jest en node).
 * Backend: plantilla `cartaAviso.plantilla.js`, POST /documentos-laborales/emitir/:tid { codigo: 'CARTA_AVISO', … }.
 */
/** Permiso propio: emitir, descargar e imprimir la carta (no basta el de documentos laborales). */
export const PERMISO_CARTAS_AVISO = 'documentos.cartas_aviso';

export type CausalCarta = 'NECESIDADES_EMPRESA' | 'VENCIMIENTO_PLAZO' | 'INASISTENCIA';
export const CAUSALES_CARTA: CausalCarta[] = ['NECESIDADES_EMPRESA', 'VENCIMIENTO_PLAZO', 'INASISTENCIA'];

export const NOMBRE_CAUSAL_CARTA: Record<CausalCarta, string> = {
    NECESIDADES_EMPRESA: 'Necesidades de la empresa (art. 161 N° 1)',
    VENCIMIENTO_PLAZO: 'Vencimiento del plazo (art. 159 N° 4)',
    INASISTENCIA: 'No concurrencia a sus labores (art. 160 N° 3)',
};

export const esCausalCarta = (c: string | null | undefined): c is CausalCarta => !!c && (CAUSALES_CARTA as string[]).includes(c);

/**
 * Qué causal lleva la carta según la baja: la registrada si es una de las tres; `elegir` si la baja es operativa LOLS
 * (sin artículo: se elige una de las tres); `otra` si la baja tiene OTRA causal legal (no hay carta para ella).
 */
export function causalDeLaBaja(baja: { causal_codigo?: string | null; articulo_texto?: string | null } | null | undefined):
    { tipo: 'fija'; causal: CausalCarta } | { tipo: 'elegir' } | { tipo: 'otra' } {
    const c = baja?.causal_codigo ?? null;
    if (esCausalCarta(c)) return { tipo: 'fija', causal: c };
    return baja?.articulo_texto ? { tipo: 'otra' } : { tipo: 'elegir' };
}

export interface CartaAvisoForm {
    causal: CausalCarta | '';
    /** Solo cuando la baja no tiene artículo (operativa LOLS). */
    elegida: boolean;
    fechaCarta: string;
    lugar: string;
    /** Días de falta (YYYY-MM-DD) para la no concurrencia. */
    dias: string[];
    hechos: string;
}

/** Primer error para el usuario, o null. */
export function validarCarta(f: CartaAvisoForm): string | null {
    if (!f.causal) return 'Elige la causal de la carta.';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.fechaCarta)) return 'Pon la fecha de la carta.';
    if (f.causal === 'INASISTENCIA' && f.dias.length === 0) return 'Marca al menos un día de inasistencia.';
    if (f.causal === 'NECESIDADES_EMPRESA' && !f.hechos.trim()) return 'Escribe los hechos: por qué la empresa necesita poner término al contrato.';
    return null;
}

export function buildCartaPayload(f: CartaAvisoForm) {
    const base: Record<string, unknown> = { codigo: 'CARTA_AVISO', fecha_carta: f.fechaCarta };
    if (f.lugar.trim()) base.lugar = f.lugar.trim();
    if (f.elegida && f.causal) base.causal_codigo = f.causal;
    if (f.causal === 'INASISTENCIA') base.dias_inasistencia = [...new Set(f.dias)].sort();
    // Sin montos: la carta es solo texto (Marcos 2026-11-26: «lo referido a dinero… sacarlo»).
    if (f.hechos.trim()) base.hechos = f.hechos.trim();
    return base;
}
