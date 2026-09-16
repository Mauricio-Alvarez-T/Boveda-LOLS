/**
 * Alertas de documentos sin firmar (plan Gestiones B7, mig 115) — lógica PURA para la Bandeja del Día, la
 * pestaña Documentos físicos y Configuración → Alertas de Documentos. Sin DOM.
 * Espejo de backend/src/services/documentosAlertas.service.js.
 */

export type EtapaDocumento = 'sin_imprimir' | 'por_retirar' | 'por_confirmar' | 'en_terreno';

export interface AlertaDocumentoItem {
    documento_id: number;
    tipo_codigo: string;
    tipo_nombre: string;
    etapa: EtapaDocumento;
    dias: number;
    critical: boolean;
    dias_aviso: number;
    dias_critico: number;
    trabajador: { id: number; nombre: string; rut: string | null };
    obra_nombre: string | null;
    lote_id: number | null;
    portador_nombre: string | null;
}

export interface AlertaLoteItem { lote_id: number; portador_id: number | null; portador_nombre: string | null; documentos: number; dias: number; critical: boolean }

export interface Conteo { total: number; criticos: number }

export interface AlertasDocumentos {
    total: number;
    criticos: number;
    por_tipo: { tipo_codigo: string; tipo_nombre: string; total: number; criticos: number }[];
    por_etapa: Record<EtapaDocumento, Conteo>;
    lotes: { sin_confirmar: Conteo & { items: AlertaLoteItem[] }; en_terreno: Conteo & { items: AlertaLoteItem[] } };
    items: AlertaDocumentoItem[];
}

/** Fila de GET /documentos-alertas/config. */
export interface AlertaConfig {
    id: number;
    categoria: string;
    etiqueta: string;
    activo: boolean | number;
    dias_aviso: number;
    dias_critico: number;
    orden: number;
}

/**
 * Estas etiquetas se pintan DENTRO del tablero (AlertasDocumentosStrip), así que tienen que hablar el
 * mismo idioma que los carriles: dónde está el papel y quién lo tiene (ver documentosFisicos.ts).
 */
export const ETAPA_LABEL: Record<EtapaDocumento, string> = {
    sin_imprimir: 'Sin imprimir',
    por_retirar: 'Impreso, sin portador',
    por_confirmar: 'En oficina, esperando retiro',
    en_terreno: 'En terreno',
};

/** Qué tiene que hacer RRHH en cada etapa (texto corto para la fila). */
export const ETAPA_ACCION: Record<EtapaDocumento, string> = {
    sin_imprimir: 'Imprimir desde la ficha del trabajador',
    por_retirar: 'Prepararle un lote a un portador',
    por_confirmar: 'El portador aún no pasa a buscarlos',
    en_terreno: 'Esperando que vuelva firmado',
};

export const CATEGORIAS_LOTE = ['LOTE_SIN_CONFIRMAR', 'LOTE_EN_TERRENO'] as const;
export const esCategoriaLote = (categoria: string) => (CATEGORIAS_LOTE as readonly string[]).includes(categoria);

export interface FilaBandeja { severity: 'critical' | 'warning' | 'info'; title: string; description: string; ruta: string }

const plural = (n: number, s: string, p: string) => (n === 1 ? s : p);
/** 'Contrato de Trabajo (Bóveda)' → 'contratos de trabajo' (sin el sufijo de sistema, en minúsculas). */
export function nombreCortoTipo(tipoNombre: string): string {
    return tipoNombre.replace(/\s*\(Bóveda\)\s*$/i, '').trim().toLowerCase();
}

/**
 * Filas para la Bandeja del Día (RRHH): UNA por tipo de documento ("3 contratos de trabajo sin firmar · 1
 * crítico"), tope `maxFilas` con "+N tipos más", y una por categoría de lote. Todo aterriza en la pestaña
 * Documentos físicos. Sin datos → [].
 */
export function filasBandejaAlertas(a: AlertasDocumentos | null | undefined, { maxFilas = 4, ruta = '/consultas?tab=fisicos' } = {}): FilaBandeja[] {
    if (!a) return [];
    const out: FilaBandeja[] = [];
    const tipos = [...a.por_tipo].sort((x, y) => y.criticos - x.criticos || y.total - x.total);
    for (const t of tipos.slice(0, maxFilas)) {
        const nombre = nombreCortoTipo(t.tipo_nombre);
        out.push({
            severity: t.criticos > 0 ? 'critical' : 'warning',
            title: `${t.total} ${nombre} sin firmar${t.criticos > 0 ? ` · ${t.criticos} crítico${plural(t.criticos, '', 's')}` : ''}`,
            description: t.criticos > 0 ? 'Superan los días críticos configurados' : 'Superan los días de aviso configurados',
            ruta,
        });
    }
    if (tipos.length > maxFilas) {
        const resto = tipos.slice(maxFilas);
        const total = resto.reduce((acc, t) => acc + t.total, 0);
        const criticos = resto.reduce((acc, t) => acc + t.criticos, 0);
        out.push({ severity: criticos > 0 ? 'critical' : 'warning', title: `+${resto.length} tipos más (${total} documento${plural(total, '', 's')})`, description: 'Ver el detalle en Documentos físicos', ruta });
    }
    if (a.lotes.sin_confirmar.total > 0) {
        const l = a.lotes.sin_confirmar;
        out.push({ severity: l.criticos > 0 ? 'critical' : 'warning', title: `${l.total} lote${plural(l.total, '', 's')} que el portador no confirmó`, description: 'Pídele que confirme el retiro en Bóveda (doble llave)', ruta });
    }
    if (a.lotes.en_terreno.total > 0) {
        const l = a.lotes.en_terreno;
        out.push({ severity: l.criticos > 0 ? 'critical' : 'warning', title: `${l.total} lote${plural(l.total, '', 's')} demasiado tiempo en terreno`, description: 'Documentos que aún no vuelven firmados', ruta });
    }
    return out;
}

/** Validación de un cambio de umbrales antes del PUT (el backend la repite). Mensaje o null. */
export function validarUmbrales(aviso: number | string, critico: number | string): string | null {
    const a = Number(aviso), c = Number(critico);
    if (!Number.isInteger(a) || a < 0) return 'Los días de aviso deben ser un entero ≥ 0';
    if (!Number.isInteger(c) || c < 0) return 'Los días para crítico deben ser un entero ≥ 0';
    if (c < a) return `Crítico (${c}) no puede ser menor que aviso (${a})`;
    return null;
}

/** Documentos agrupados por etapa, ordenados por días (peor arriba), para la pestaña Documentos físicos. */
export function agruparPorEtapa(items: AlertaDocumentoItem[]): { etapa: EtapaDocumento; items: AlertaDocumentoItem[] }[] {
    const orden: EtapaDocumento[] = ['en_terreno', 'por_confirmar', 'por_retirar', 'sin_imprimir'];
    return orden
        .map(etapa => ({ etapa, items: items.filter(i => i.etapa === etapa).sort((a, b) => b.dias - a.dias) }))
        .filter(g => g.items.length > 0);
}
