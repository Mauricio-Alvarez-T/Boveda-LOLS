import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * Tamaños tipográficos propios del `@theme` de index.css (`--text-<n>`).
 * tailwind-merge no lee el CSS: sin registrarlos toma `text-caption` & cía.
 * por COLORES de texto y los borra cuando aparece un `text-<color>` después
 * en la misma llamada (`cn('text-caption', 'text-muted-foreground')` perdía
 * el tamaño y la etiqueta caía a los 16px heredados). Al agregar un token
 * `--text-*` en index.css, sumarlo aquí (cn.test.ts lo vigila).
 */
export const TAMANOS_TEXTO_PROPIOS = [
    // escala diminuta (F2): metadata terciaria
    'micro', 'caption', 'label', 'section',
    // escala grande (F5): jerarquía de página
    'display', 'display-sm', 'headline', 'title', 'title-sm', 'body-lg', 'body', 'ui',
] as const;

const twMerge = extendTailwindMerge({
    extend: {
        theme: {
            text: [...TAMANOS_TEXTO_PROPIOS],
        },
    },
});

/**
 * Merges tailwind classes cleanly, handling conflicts.
 */
export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}
