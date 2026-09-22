/**
 * Desvinculación con causal (plan Gestiones B4) — lógica pura del modal, testeable sin DOM.
 * Espejo de backend/src/schemas/trabajadores.schema.js + reglas de negocio del service.
 */
import * as z from 'zod';

/** Fila del catálogo GET /trabajadores/catalogos/causales-desvinculacion. */
export interface CausalDesvinculacion {
    codigo: string;
    articulo: string | null;
    inciso: string | null;
    articulo_texto: string | null;
    nombre: string;
    grupo: string;
    sugiere_no_recontratar: boolean;
    requiere_detalle: boolean;
}

/** Última desvinculación resumida (GET /:id/resumen, check-rut de oficina). */
export interface UltimaDesvinculacion {
    /** id de la fila del historial (solo en modo resumen/completa). */
    id?: number;
    fecha: string | null;
    articulo: string | null;
    no_recontratar: boolean;
    /** true si la ficha del trabajador fue depurada: el antecedente se conserva por RUT (mig 113). */
    trabajador_depurado?: boolean;
    /** Nombre guardado al momento de la baja (para el aviso cuando ya no hay ficha). */
    nombre?: string | null;
    causal_codigo?: string;
    causal_nombre?: string;
    articulo_texto?: string | null;
    fecha_ingreso_periodo?: string | null;
    desvinculado_por_nombre?: string | null;
    desvinculado_en?: string | null;
    reactivado_en?: string | null;
    /** documentos.id del finiquito emitido para esta baja (B5); null si aún no se emitió. */
    finiquito_documento_id?: number | null;
    /** Antecedente interno; el backend solo lo envía a quien tiene trabajadores.eliminar / .reactivar. */
    detalle?: string | null;
}

export const desvincularSchema = z.object({
    fecha_desvinculacion: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Indica la fecha de desvinculación'),
    causal_codigo: z.string().min(1, 'Selecciona la causal'),
    detalle: z.string().max(2000, 'Máximo 2000 caracteres').optional(),
    no_recontratar: z.boolean(),
});
export type DesvincularFormData = z.infer<typeof desvincularSchema>;

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Hoy en formato YYYY-MM-DD (hora local). */
export function hoyYmd(hoy: Date = new Date()): string { return ymd(hoy); }

/** Tope del input de fecha: hoy + 30 días (misma regla que el backend). */
export function fechaMaxDesvinculacion(hoy: Date = new Date()): string {
    const d = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + 30);
    return ymd(d);
}

export function getCausal(catalogo: CausalDesvinculacion[], codigo: string | undefined): CausalDesvinculacion | undefined {
    return catalogo.find(c => c.codigo === codigo);
}

export function requiereDetalle(catalogo: CausalDesvinculacion[], codigo: string | undefined): boolean {
    return !!getCausal(catalogo, codigo)?.requiere_detalle;
}

/** Opciones planas para <Select>, agrupadas por `grupo` en el orden del catálogo. */
export function opcionesCausales(catalogo: CausalDesvinculacion[]): { value: string; label: string }[] {
    return catalogo.map(c => ({
        value: c.codigo,
        label: c.articulo ? `${c.nombre} — Art. ${c.articulo}${c.inciso ? ` N°${c.inciso}` : ''}` : `${c.nombre} — ${c.grupo}`,
    }));
}

/** Validación de negocio previa al envío (el backend la repite). Devuelve mensaje o null. */
export function validarDesvinculacion(
    d: DesvincularFormData,
    catalogo: CausalDesvinculacion[],
    fechaIngreso: string | null | undefined,
    hoy: Date = new Date()
): string | null {
    if (fechaIngreso && d.fecha_desvinculacion < fechaIngreso.slice(0, 10)) {
        return `La fecha no puede ser anterior al ingreso (${fechaIngreso.slice(0, 10)})`;
    }
    if (d.fecha_desvinculacion > fechaMaxDesvinculacion(hoy)) return 'La fecha no puede superar 30 días desde hoy';
    if (requiereDetalle(catalogo, d.causal_codigo) && !(d.detalle ?? '').trim()) {
        return 'Esta causal requiere detallar el antecedente';
    }
    return null;
}

export function buildDesvincularPayload(d: DesvincularFormData) {
    const detalle = (d.detalle ?? '').trim();
    return {
        fecha_desvinculacion: d.fecha_desvinculacion,
        causal_codigo: d.causal_codigo,
        detalle: detalle === '' ? undefined : detalle,
        no_recontratar: !!d.no_recontratar,
    };
}

/** Texto del aviso al reintentar contratar/reactivar: "desvinculado el dd-mm-aaaa · causal[ · marcado NO recontratar]". */
export function avisoDesvinculacion(u: UltimaDesvinculacion | null | undefined): string | null {
    if (!u) return null;
    const partes: string[] = [];
    if (u.fecha) {
        const [y, m, d] = u.fecha.slice(0, 10).split('-');
        partes.push(`desvinculado el ${d}-${m}-${y}`);
    } else {
        partes.push('desvinculado');
    }
    if (u.causal_nombre) partes.push(u.causal_nombre);
    else if (u.articulo) partes.push(`Art. ${u.articulo}`);
    if (u.no_recontratar) partes.push('marcado NO recontratar');
    const texto = partes.join(' · ');
    return u.trabajador_depurado ? `ficha depurada${u.nombre ? ` (${u.nombre})` : ''}: ${texto}` : texto;
}

/** Detalle interno de la baja (solo llega a oficina), recortado; null si no viene o está vacío. */
export function detalleDesvinculacion(u: UltimaDesvinculacion | null | undefined): string | null {
    const d = (u?.detalle ?? '').trim();
    return d === '' ? null : d;
}

/** Lo que devuelve PUT /trabajadores/:id/desvincular (data). */
export interface DesvincularResultado {
    trabajador_id: number;
    desvinculacion_id: number;
    fecha_desvinculacion: string;
    causal: { codigo: string; nombre: string; articulo_texto: string | null };
    no_recontratar: boolean;
    asistencias_posteriores: number;
}

/**
 * Baja recién registrada → forma de `UltimaDesvinculacion`, para abrir el finiquito (B5) desde el éxito
 * del modal sin volver a consultar el resumen. `fecha_ingreso_periodo` = fecha de ingreso vigente del
 * trabajador (es lo que el backend guardó en la fila).
 */
export function bajaDesdeResultado(r: DesvincularResultado, fechaIngreso?: string | null): UltimaDesvinculacion {
    const art = (r.causal.articulo_texto || '').match(/Artículo (\d+)/);
    return {
        id: r.desvinculacion_id,
        fecha: r.fecha_desvinculacion,
        articulo: art ? art[1] : null,
        no_recontratar: r.no_recontratar,
        causal_codigo: r.causal.codigo,
        causal_nombre: r.causal.nombre,
        articulo_texto: r.causal.articulo_texto,
        fecha_ingreso_periodo: fechaIngreso ? String(fechaIngreso).slice(0, 10) : null,
        finiquito_documento_id: null,
    };
}
