/**
 * Búsqueda del Centro de Ayuda (lógica pura, testeable sin DOM).
 * Indexa título, descripción, módulo y `alias` (nombres ANTERIORES del módulo): así, tras
 * renombrar "Consultas" → "Gestiones" (2026-09-11), quien escribe "consultas" sigue
 * encontrando los 4 tutoriales del módulo.
 *
 * Subconjunto estructural de `JourneyDef` (journeys.tsx) declarado aparte para que el test
 * puro no arrastre lucide-react ni el JSX de los journeys.
 */
export interface JourneyBuscable {
    titulo: string;
    descripcion: string;
    modulo: string;
    alias?: string[];
}

export function textoBusqueda(j: JourneyBuscable): string {
    return [j.titulo, j.descripcion, j.modulo, ...(j.alias ?? [])].join(' ').toLowerCase();
}

/** true si el journey coincide con la consulta (vacía = coincide siempre). */
export function coincideBusqueda(j: JourneyBuscable, query: string): boolean {
    const q = query.trim().toLowerCase();
    return q === '' || textoBusqueda(j).includes(q);
}
