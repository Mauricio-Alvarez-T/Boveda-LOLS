/**
 * Orden de la grilla de Trabajadores (Gestiones). Puro, sin DOM.
 *
 * Pedido de Daphne (idea #6, 2026-11-25): al mirar los ingresos del mes, que los últimos ingresos
 * queden arriba. Con un rango de fecha de ingreso activo («Ingresos de este mes» o «Entró entre»),
 * la grilla se ordena por `fecha_ingreso` descendente; sin él sigue el orden alfabético del backend.
 */

interface ConIngreso { fecha_ingreso?: string | null }

const dia = (v?: string | null): string => (v ? String(v).slice(0, 10) : '');

/**
 * Copia ordenada por fecha de ingreso, la más reciente primero. Estable: a igual fecha se conserva el
 * orden recibido (alfabético). Sin fecha → al final.
 */
export function ordenarPorIngresoReciente<T extends ConIngreso>(lista: T[]): T[] {
    return lista
        .map((w, i) => ({ w, i, f: dia(w.fecha_ingreso) }))
        .sort((a, b) => {
            if (a.f !== b.f) {
                if (!a.f) return 1;
                if (!b.f) return -1;
                return a.f < b.f ? 1 : -1;
            }
            return a.i - b.i;
        })
        .map(x => x.w);
}
