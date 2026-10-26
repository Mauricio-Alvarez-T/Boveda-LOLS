/**
 * Color de una celda de la matriz de roles según su nivel (lo usan la celda y la leyenda).
 * -1 = a medida · 0 = nada · `total` = el escalón más alto de la pantalla.
 */
export function estiloCelda(nivel: number, total: number): string {
    if (nivel === 0) return 'border border-dashed border-border text-muted-foreground';
    if (nivel === -1) return 'border border-warning bg-warning/10 text-brand-dark';
    if (nivel === total) return 'border border-brand-primary bg-brand-primary text-white font-semibold';
    if (nivel === 1) return 'border border-transparent bg-muted text-brand-dark';
    return 'border border-brand-primary bg-brand-primary/15 text-brand-dark';
}
