/**
 * Estado de vencimiento de una fecha — lógica compartida por el módulo Vehículos.
 *
 * Función PURA y testeada porque de acá salen tres cosas que tienen que decir lo
 * mismo: el chip de la ficha del vehículo, el panel de vencimientos y el número
 * del menú lateral. El backend usa el MISMO umbral (30 días) en
 * `vehiculos.service.getVencimientos`.
 *
 * ⚠️ Las fechas de la API llegan como 'YYYY-MM-DD' o ISO con hora. Se parsea a
 * mano el tramo YYYY-MM-DD en vez de `new Date(s)`: `new Date('2026-09-01')` se
 * interpreta como UTC y en Chile (UTC−3/−4) cae el día anterior, corriendo todos
 * los cálculos un día.
 */

/** Días de anticipación con los que algo se considera "por vencer". */
export const DIAS_AVISO_VENCIMIENTO = 30;

export type EstadoVenc = 'vencido' | 'por_vencer' | 'vigente';

/** Convierte 'YYYY-MM-DD' (o ISO) a Date local a medianoche. null si no hay fecha. */
export const parseFechaLocal = (s?: string | null): Date | null => {
    if (!s) return null;
    const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
};

/**
 * Días que faltan para la fecha. Negativo si ya pasó (−3 = venció hace 3 días),
 * 0 = vence hoy. null si no hay fecha válida.
 */
export const diasHastaVencimiento = (fecha?: string | null, hoy: Date = new Date()): number | null => {
    const f = parseFechaLocal(fecha);
    if (!f) return null;
    const h = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
    return Math.round((f.getTime() - h.getTime()) / 86_400_000);
};

/** Vencido (< 0) · por vencer (0…30) · vigente (> 30). Hoy cuenta como POR VENCER, no vencido. */
export const estadoVencimiento = (dias: number | null, umbral = DIAS_AVISO_VENCIMIENTO): EstadoVenc | null => {
    if (dias == null) return null;
    if (dias < 0) return 'vencido';
    return dias <= umbral ? 'por_vencer' : 'vigente';
};

/** Texto corto para el chip: "Venció hace 3d" · "Vence hoy" · "Vence en 12d" · "Vigente". */
export const textoVencimiento = (dias: number | null): string => {
    if (dias == null) return 'Sin fecha';
    if (dias < 0) return `Venció hace ${Math.abs(dias)}d`;
    if (dias === 0) return 'Vence hoy';
    if (dias <= DIAS_AVISO_VENCIMIENTO) return `Vence en ${dias}d`;
    return 'Vigente';
};

/** Nombres legibles de los subtipos que se guardan como clave (documentos y revisiones). */
export const SUBTIPOS_VENCIMIENTO: Record<string, string> = {
    permiso_circulacion: 'Permiso de circulación',
    seguro_terceros: 'Seguro contra terceros',
    primera_inscripcion: 'Primera inscripción',
    certificado_primera_inscripcion: 'Certificado de primera inscripción',
    poliza: 'Póliza (seguro)',
    tecnica: 'Revisión técnica',
    gases: 'Revisión de gases',
    mecanica: 'Revisión mecánica',
    fin_leasing: 'Fin de leasing',
};

/** Etiqueta por categoría cuando el subtipo no dice nada útil. */
export const CATEGORIAS_VENCIMIENTO: Record<string, string> = {
    documento: 'Documento',
    revision: 'Revisión',
    mantencion: 'Mantención',
    seguro: 'Seguro',
    permiso: 'Permiso de circulación',
    leasing: 'Fin de leasing',
};

/** "Revisión de gases" a partir de (categoria, subtipo). Compartido por el panel y los tooltips. */
export const etiquetaVencimiento = (categoria: string, subtipo?: string | null) =>
    SUBTIPOS_VENCIMIENTO[subtipo || ''] || subtipo || CATEGORIAS_VENCIMIENTO[categoria] || 'Vencimiento';
