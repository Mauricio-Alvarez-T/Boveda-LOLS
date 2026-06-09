/**
 * Etiqueta corta de empresa para mostrar junto a cada trabajador.
 * Pedido (Franco Gutiérrez): L = LOLS, M = MAUA, P = Provisorio.
 * Se agrega D = Dedalius (existe en datos) y un fallback genérico (1ª letra).
 *
 * El match es por substring en mayúsculas para tolerar variantes del nombre
 * ('LOLS EMPRESAS DE INGENIERIA LTDA', 'MIGUEL ANGEL URRUTIA AGUILERA', etc.).
 */
export interface EmpresaTag {
    letra: string;
    label: string;
    /** Clases Tailwind para el badge (con variantes dark). */
    color: string;
}

const GREEN = 'bg-brand-primary/15 text-brand-primary';
const BLUE = 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300';
const AMBER = 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300';
const PURPLE = 'bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300';
const GRAY = 'bg-muted text-muted-foreground';

export function empresaTag(nombre?: string | null): EmpresaTag | null {
    if (!nombre || !nombre.trim()) return null;
    const n = nombre.toUpperCase();

    if (n.includes('LOLS')) return { letra: 'LOLS', label: 'LOLS', color: GREEN };
    if (n.includes('URRUTIA') || n.includes('MAUA')) return { letra: 'MAU', label: 'MAUA', color: BLUE };
    if (n.includes('PROVISORI')) return { letra: 'PROV', label: 'Provisorio', color: AMBER };
    if (n.includes('DEDALIUS')) return { letra: 'DED', label: 'Dedalius', color: PURPLE };

    // Fallback: primeras letras del nombre, color neutro. Conserva el nombre
    // completo en el tooltip para que igual se identifique la empresa.
    return { letra: n.trim().slice(0, 4) || '?', label: nombre, color: GRAY };
}
