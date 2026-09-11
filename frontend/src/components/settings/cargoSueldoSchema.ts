/**
 * Sueldo por cargo (plan Gestiones B3) — lógica pura del formulario, testeable sin DOM.
 *
 * Espejo del schema backend `schemas/cargoSueldos.schema.js`: enteros CLP ≥ 0, sueldo base
 * hasta $99.999.999, bonos hasta $9.999.999, observaciones ≤ 500. El backend re-valida.
 */
import * as z from 'zod';
import type { CargoSueldo } from '../../types/entities';

export const MAX_SUELDO = 99_999_999;
export const MAX_BONO = 9_999_999;

const monto = (max: number, label: string) =>
    z.number()
        .int(`${label} debe ser un monto entero`)
        .min(0, `${label} no puede ser negativo`)
        .max(max, `${label} excede el máximo permitido`);

export const cargoSueldoSchema = z.object({
    sueldo_base: monto(MAX_SUELDO, 'Sueldo base'),
    bono_colacion: monto(MAX_BONO, 'Colación'),
    bono_movilizacion: monto(MAX_BONO, 'Movilización'),
    observaciones: z.string().max(500, 'Máximo 500 caracteres').optional(),
});

export type CargoSueldoFormData = z.infer<typeof cargoSueldoSchema>;

/** Valores iniciales del formulario a partir del sueldo vigente (o vacío). */
export function sueldoDefaults(s: CargoSueldo | null | undefined): CargoSueldoFormData {
    return {
        sueldo_base: s?.sueldo_base ?? 0,
        bono_colacion: s?.bono_colacion ?? 0,
        bono_movilizacion: s?.bono_movilizacion ?? 0,
        observaciones: s?.observaciones ?? '',
    };
}

/** Payload para PUT /cargo-sueldos/:cargoId (enteros; observaciones vacía → null). */
export function buildSueldoPayload(d: CargoSueldoFormData) {
    const obs = (d.observaciones ?? '').trim();
    return {
        sueldo_base: Math.trunc(d.sueldo_base),
        bono_colacion: Math.trunc(d.bono_colacion ?? 0),
        bono_movilizacion: Math.trunc(d.bono_movilizacion ?? 0),
        observaciones: obs === '' ? null : obs,
    };
}

/** Suma mensual mostrada en el modal (tolera parciales/undefined mientras se tipea). */
export function totalMensual(d: Partial<Pick<CargoSueldoFormData, 'sueldo_base' | 'bono_colacion' | 'bono_movilizacion'>>): number {
    const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
    return n(d.sueldo_base) + n(d.bono_colacion) + n(d.bono_movilizacion);
}
