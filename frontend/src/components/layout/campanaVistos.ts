/**
 * Campana «Importante» para quienes la ven por CONTROL (Marcos 2026-11-26: «a mí y a Mauricio nos llegan esas
 * solicitudes pero no tiene que quedarse a vivir el número… nosotros creamos el dashboard, programamos pero no usamos
 * el sistema»). Al Super Administrador el número rojo se le va al abrir la campana y vuelve solo con algo NUEVO: otro
 * día sin lista en una obra, otra obra, u otra obra en preparación. Para RR.HH. y don Luis no cambia nada: se queda
 * hasta que la lista se guarde. Lógica pura (jest en node); lo «visto» vive en el navegador de cada uno.
 */
import type { EnPreparacionData, SinListaData } from '../dashboard/widgets/resumenSinLista';

export const claveVistos = (usuarioId: number | string) => `boveda_importante_vistos_${usuarioId}`;

/** Una clave por aviso: la obra sin lista con su día más reciente; la obra en preparación. */
export function clavesAvisos(sinLista: SinListaData | null, prep: EnPreparacionData | null): string[] {
    return [
        ...(sinLista?.obras ?? []).map(o => `sl:${o.obra_id}:${o.dias[0]?.fecha ?? ''}`),
        ...(prep?.obras ?? []).map(o => `pr:${o.obra_id}`),
    ];
}

/** Cuántos avisos no se han visto todavía. */
export const contarNuevos = (claves: string[], vistos: string[]) => {
    const v = new Set(vistos);
    return claves.filter(k => !v.has(k)).length;
};

export function leerVistos(clave: string): string[] {
    try {
        const v = JSON.parse(localStorage.getItem(clave) || '[]');
        return Array.isArray(v) ? v.map(String) : [];
    } catch { return []; }
}

/** Guarda solo lo que hoy está en la campana (lo que ya se resolvió no se acumula). */
export function guardarVistos(clave: string, claves: string[]) {
    try { localStorage.setItem(clave, JSON.stringify(claves)); } catch { /* sin marca: el número vuelve al recargar */ }
}
