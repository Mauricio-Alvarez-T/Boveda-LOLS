/**
 * Reingreso de un trabajador finiquitado (mig 152) — lógica pura del modal, testeable sin DOM.
 * Espejo de backend/src/schemas/trabajadores.schema.js `reactivar` + desvinculacion.service
 * `_reingresarEnConn`: la fecha de reingreso es obligatoria, posterior al último egreso y hasta hoy+30;
 * empresa/obra/cargo/categoría solo viajan si hay valor (el backend nunca los pisa con null); término
 * vacío = indefinido (null).
 */
import * as z from 'zod';

export const reingresoSchema = z.object({
    fecha_ingreso: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Indica la fecha de reingreso'),
    empresa_id: z.number().int().nonnegative(),
    obra_id: z.number().int().nonnegative(),
    cargo_id: z.number().int().nonnegative(),
    categoria_reporte: z.enum(['obra', 'operaciones', 'rotativo']),
    fecha_termino_contrato: z.string().optional(),
    quitar_marca: z.boolean(),
});
export type ReingresoFormData = z.infer<typeof reingresoSchema>;

/** Respuesta de PUT /trabajadores/:id/reactivar. */
export interface ReingresoResultado {
    trabajador_id: number;
    fecha_ingreso: string;
    fecha_ingreso_anterior: string | null;
    fecha_termino_contrato: string | null;
    tenia_marca: boolean;
    marca_conservada: boolean;
    historial_cerrado: boolean;
}

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const aYmd = (v?: string | null) => (v ? String(v).slice(0, 10) : null);

/** Mínimo del input: el día siguiente al último egreso (null si no se conoce). */
export function fechaMinReingreso(ultimoEgreso?: string | null): string | null {
    const f = aYmd(ultimoEgreso);
    if (!f || !/^\d{4}-\d{2}-\d{2}$/.test(f)) return null;
    const [y, m, d] = f.split('-').map(Number);
    return ymd(new Date(y, m - 1, d + 1));
}

/** Máximo del input: hoy + 30 días (misma regla que el backend). */
export function fechaMaxReingreso(hoy: Date = new Date()): string {
    return ymd(new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + 30));
}

/** Error de negocio legible, o null. */
export function validarReingreso(d: ReingresoFormData, ultimoEgreso?: string | null, hoy: Date = new Date()): string | null {
    const min = fechaMinReingreso(ultimoEgreso);
    if (min && d.fecha_ingreso < min) return `La fecha de reingreso debe ser posterior al último egreso (${aYmd(ultimoEgreso)}).`;
    if (d.fecha_ingreso > fechaMaxReingreso(hoy)) return 'La fecha de reingreso no puede superar 30 días desde hoy.';
    const term = (d.fecha_termino_contrato || '').trim();
    if (term && term < d.fecha_ingreso) return 'El término del contrato no puede ser anterior a la fecha de reingreso.';
    return null;
}

/** Body del PUT: solo lo que tiene valor; término vacío = null (indefinido). */
export function buildReingresoPayload(d: ReingresoFormData, teniaMarca: boolean): Record<string, unknown> {
    const out: Record<string, unknown> = {
        fecha_ingreso: d.fecha_ingreso,
        categoria_reporte: d.categoria_reporte,
        fecha_termino_contrato: (d.fecha_termino_contrato || '').trim() || null,
        quitar_marca_no_recontratar: teniaMarca && d.quitar_marca,
    };
    if (d.empresa_id > 0) out.empresa_id = d.empresa_id;
    if (d.obra_id > 0) out.obra_id = d.obra_id;
    if (d.cargo_id > 0) out.cargo_id = d.cargo_id;
    return out;
}
