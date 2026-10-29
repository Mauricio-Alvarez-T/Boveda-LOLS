import React from 'react';
import { cn } from '../../utils/cn';
import { Button } from '../ui/Button';
import { Cargando, Skeleton } from '../ui/Skeleton';
import { COLOR_BARRA, semaforo } from './costosConfig';

/** Cifra de cabecera: neutra, el número manda (design system: KPI). El dinero no se anima (§9.4). */
export const Kpi: React.FC<{
    icon: React.ElementType;
    label: string;
    valor: string;
    nota?: React.ReactNode;
    tono?: 'neutro' | 'peligro' | 'aviso';
    /** La nota es la que avisa (ej.: lo vencido dentro de lo por pagar): el número queda neutro. */
    notaPeligro?: boolean;
    /** Tarjeta cliqueable: lleva al detalle de dónde sale el número («Ver ›» abajo a la derecha). */
    onClick?: () => void;
    /** Texto del enlace (por defecto «Ver»). */
    accion?: string;
    /** Algo visual a la derecha de la cifra (el estanque del gastado). */
    visual?: React.ReactNode;
}> = ({ icon: Icon, label, valor, nota, tono = 'neutro', notaPeligro, onClick, accion = 'Ver', visual }) => {
    const clase = cn('flex min-w-0 flex-col gap-1 rounded-card border bg-card p-4 text-left',
        tono === 'peligro' ? 'border-destructive/40' : tono === 'aviso' ? 'border-warning/50' : 'border-border',
        onClick && 'transition-colors hover:border-muted-foreground/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40');
    const cuerpo = (
        <>
            <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                <Icon className="h-3.5 w-3.5 shrink-0" /> {label}
            </span>
            {visual ? (
                <span className="flex items-center justify-between gap-2">
                    <span className={cn('min-w-0 text-lg md:text-xl font-bold tracking-headline tabular-nums leading-tight break-all',
                        tono === 'peligro' && !notaPeligro ? 'text-destructive' : 'text-brand-dark')}>
                        {valor}
                    </span>
                    {visual}
                </span>
            ) : (
                <span className={cn('text-lg md:text-xl font-bold tracking-headline tabular-nums leading-tight break-all',
                    tono === 'peligro' && !notaPeligro ? 'text-destructive' : 'text-brand-dark')}>
                    {valor}
                </span>
            )}
            {nota && <span className={cn('text-caption', notaPeligro ? 'font-semibold text-destructive' : 'text-muted-foreground')}>{nota}</span>}
            {onClick && <span className="mt-auto self-end pt-1 text-xs font-semibold text-brand-primary">{accion} ›</span>}
        </>
    );
    return onClick
        // eslint-disable-next-line no-restricted-syntax -- tarjeta KPI cliqueable (ícono, cifra, nota y enlace); Button no soporta este layout
        ? <button type="button" onClick={onClick} className={clase}>{cuerpo}</button>
        : <div className={clase}>{cuerpo}</div>;
};

/** La tarjeta de cifra mientras carga (diseno.md §9.17): ícono y rótulo de verdad, la cifra en gris; la nota, si es fija, también de verdad. */
export const KpiSilueta: React.FC<{ icon: React.ElementType; label: string; nota?: React.ReactNode }> = ({ icon: Icon, label, nota }) => (
    <div className="flex min-w-0 flex-col gap-1 rounded-card border border-border bg-card p-4" aria-hidden="true">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <Icon className="h-3.5 w-3.5 shrink-0" /> {label}
        </span>
        <Skeleton className="my-0.5 h-6 w-28 max-w-full md:h-7" />
        {nota ? <span className="text-caption text-muted-foreground">{nota}</span> : <Skeleton className="mt-0.5 h-3 w-3/4" />}
    </div>
);

/** Una columna de `TablaSilueta` cuando no es un monto a la derecha: su lado, su ancho mínimo y su celda en gris. */
export type ColumnaSilueta = { label: string; alinear?: 'izq' | 'der'; className?: string; celda?: React.ReactNode };

/**
 * Una tabla mientras carga: el encabezado verde con sus columnas de verdad y filas en gris. Por defecto la primera
 * columna va a la izquierda (nombre) y las demás a la derecha (montos), como en las tablas de Presupuestos; una
 * columna distinta se pasa como objeto (`alinear`, `className` de la celda real, `celda` con su forma). `pie` = la
 * nota fija bajo la tabla, de verdad.
 */
export const TablaSilueta: React.FC<{ columnas: (string | ColumnaSilueta)[]; filas?: number; que?: string; pie?: React.ReactNode }> = ({ columnas, filas = 5, que, pie }) => {
    const cols = columnas.map((c, i): ColumnaSilueta & { izq: boolean } => {
        const col = typeof c === 'string' ? { label: c } : c;
        return { ...col, izq: (col.alinear ?? (i === 0 ? 'izq' : 'der')) === 'izq' };
    });
    const pad = (i: number) => (i === 0 ? 'px-4' : cn('px-3', i === cols.length - 1 && 'pr-4'));
    return (
        <Cargando que={que} className="overflow-hidden rounded-card border border-border bg-card">
            <div className="overflow-x-auto">
                <table className="w-full text-sm" aria-hidden="true">
                    <thead className="bg-brand-primary text-white">
                        <tr>
                            {cols.map((c, i) => (
                                <th key={c.label} className={cn('py-2.5 font-semibold', pad(i), c.izq ? 'text-left' : 'text-right')}>{c.label}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {Array.from({ length: filas }).map((_, f) => (
                            <tr key={f} className="border-t border-border">
                                {cols.map((c, i) => (
                                    <td key={c.label} className={cn('py-3', pad(i), c.className)}>
                                        {c.celda ?? <Skeleton className={cn('h-3.5', i === 0 ? (f % 2 ? 'w-28' : 'w-36') : c.izq ? 'w-20' : 'ml-auto w-16')} />}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {pie && <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground" aria-hidden="true">{pie}</p>}
        </Cargando>
    );
};

/** Barra gastado / presupuestado con el color del semáforo (verde, ámbar ≥ 85 %, rojo > 100 %). */
export const BarraAvance: React.FC<{ presupuestado: number; gastado: number; className?: string }> = ({ presupuestado, gastado, className }) => {
    const s = semaforo(presupuestado, gastado);
    const ancho = presupuestado > 0 ? Math.min(100, (gastado / presupuestado) * 100) : gastado > 0 ? 100 : 0;
    return (
        <div className={cn('h-2 w-full overflow-hidden rounded-full bg-muted', className)}
            role="img" aria-label={presupuestado > 0 ? `Gastado ${Math.round((gastado / presupuestado) * 100)} % de lo presupuestado` : 'Sin presupuesto'}>
            <div className={cn('h-full rounded-full transition-[width] duration-300', COLOR_BARRA[s])} style={{ width: `${ancho}%` }} />
        </div>
    );
};

/** Porcentaje gastado como texto, con el color del semáforo solo cuando avisa algo. */
export const PctGastado: React.FC<{ presupuestado: number; gastado: number; className?: string }> = ({ presupuestado, gastado, className }) => {
    if (!presupuestado) return <span className={cn('text-caption text-muted-foreground', className)}>{gastado > 0 ? 'sin presupuesto' : '—'}</span>;
    const p = Math.round((gastado / presupuestado) * 100);
    const s = semaforo(presupuestado, gastado);
    return (
        <span className={cn('text-caption font-semibold tabular-nums',
            s === 'pasado' ? 'text-destructive' : s === 'cerca' ? 'text-warning' : 'text-muted-foreground', className)}>
            {p} %
        </span>
    );
};

/** Grupo de opciones de un toque dentro de un formulario (respuestas, no menús: §13 no aplica). */
export function Opciones<T extends string>({ valor, opciones, onChange, etiqueta }: {
    valor: T | null; opciones: Record<T, string>; onChange: (v: T) => void; etiqueta: string;
}) {
    return (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={etiqueta}>
            {(Object.keys(opciones) as T[]).map(k => (
                <Button key={k} type="button" size="sm" variant={valor === k ? 'primary' : 'secondary'}
                    className="text-xs" onClick={() => onChange(k)} aria-pressed={valor === k}>
                    {opciones[k]}
                </Button>
            ))}
        </div>
    );
}

/** Aviso en línea (dato poco confiable, algo por completar). Ámbar = por hacer, nunca error. */
export const Aviso: React.FC<{ icon: React.ElementType; children: React.ReactNode; tono?: 'aviso' | 'peligro' | 'neutro' }> = ({ icon: Icon, children, tono = 'aviso' }) => (
    <div className={cn('flex items-start gap-2 rounded-xl border px-3 py-2.5 text-xs leading-relaxed',
        tono === 'peligro' ? 'border-destructive/30 bg-destructive/5 text-brand-dark'
            : tono === 'aviso' ? 'border-warning/40 bg-warning/10 text-brand-dark'
                : 'border-border bg-muted/50 text-muted-foreground')}>
        <Icon className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', tono === 'peligro' ? 'text-destructive' : tono === 'aviso' ? 'text-warning' : 'text-muted-foreground')} />
        <div className="min-w-0">{children}</div>
    </div>
);
