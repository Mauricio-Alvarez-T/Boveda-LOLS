import React from 'react';
import { ArrowRight } from 'lucide-react';
import { cn } from '../../../utils/cn';
import { PestanasElasticas } from '../../ui/PestanasElasticas';
import { BarraPaginada } from '../../ui/BarraPaginada';
import type { TonoTarjeta } from './tarjetaActiva';
import { CIFRA, PILDORA, ROTULO_FICHAS } from './fichasInicio';

/**
 * Piezas de las fichas del detalle de Inventario y Vehículos en el Inicio (2026-10-22). Mismas clases que las
 * fichas de Asistencia de Mauricio (`FichasReiterados.tsx`): ficha blanca `rounded-[20px]` con sombra chica,
 * círculo + nombre + bajada y cifra grande a la derecha, frase, píldoras, mini dibujo y pie con enlaces.
 */

export const Pildora: React.FC<{ tono: TonoTarjeta; children: React.ReactNode }> = ({ tono, children }) => (
    <span className={cn('rounded-full px-2 py-0.5 text-label font-semibold', PILDORA[tono])}>{children}</span>
);

/** «REQUIERE ACCIÓN · …» con la nota a la derecha (baja a otra línea si no cabe). */
export const RotuloFichas: React.FC<{ titulo: string; nota?: string }> = ({ titulo, nota }) => (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className={ROTULO_FICHAS}>{titulo}</h3>
        {nota && <span className="text-xs text-muted-foreground">{nota}</span>}
    </div>
);

/** Cabeza de ficha: círculo, nombre y bajada, y la cifra grande a la derecha. */
export const CabezaFicha: React.FC<{
    circulo: React.ReactNode; tonoCirculo: TonoTarjeta; titulo: React.ReactNode; bajada: string;
    cifra: number; etiqueta: string; tonoCifra: TonoTarjeta;
}> = ({ circulo, tonoCirculo, titulo, bajada, cifra, etiqueta, tonoCifra }) => (
    <div className="flex items-center gap-3">
        <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-section font-bold', PILDORA[tonoCirculo])} aria-hidden>
            {circulo}
        </span>
        <div className="min-w-0 flex-1">
            <p className="truncate text-base font-semibold">{titulo}</p>
            <p className="truncate text-xs text-muted-foreground">{bajada}</p>
        </div>
        <div className="shrink-0 text-right">
            <span className={cn('block text-headline font-bold leading-none tracking-tight tabular-nums', CIFRA[tonoCifra])}>{cifra}</span>
            <span className="mt-0.5 block text-label text-muted-foreground">{etiqueta}</span>
        </div>
    </div>
);

/** Enlace del pie: verde con flecha (la acción) o gris (secundario, con su propio ícono). */
export const EnlaceFicha: React.FC<{
    children: React.ReactNode; onClick: () => void; apagado?: boolean; icono?: React.ReactNode; 'aria-expanded'?: boolean;
}> = ({ children, onClick, apagado, icono, ...aria }) => (
    // eslint-disable-next-line no-restricted-syntax -- enlace de la ficha (igual que «Ver en asistencia» de FichasReiterados)
    <button type="button" onClick={onClick} {...aria}
        className={cn('inline-flex min-h-9 items-center gap-1.5 rounded-lg px-1 text-section font-semibold hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40',
            apagado ? 'text-zinc-700 dark:text-zinc-300' : 'text-green-700 dark:text-green-300')}>
        {icono}{children}{!apagado && !icono && <ArrowRight className="h-3.5 w-3.5" aria-hidden />}
    </button>
);

export const PieFicha: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2.5">{children}</div>
);

/** Ficha blanca (va dentro de una `<ul>` en grilla de 1/2/3 columnas). */
export const Ficha: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
    <li className={cn('flex flex-col gap-3.5 rounded-[20px] bg-card p-5 text-foreground shadow-[var(--shadow-sm)]', className)}>
        {children}
    </li>
);

/** Grilla de fichas: una columna en el celular, dos desde 768 px y tres desde 1280 px (como Asistencia). */
export const GrillaFichas: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <ul className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">{children}</ul>
);

/**
 * Filtro por estado con el indicador elástico de la app. Si no cabe (celular), va de a páginas con flechas
 * (ui/BarraPaginada, diseno.md §9.6): nunca un nombre cortado.
 */
export function FiltroFichas<K extends string>({ opciones, activa, onCambiar, etiqueta }: {
    opciones: { key: K; texto: string; n: number }[]; activa: K; onCambiar: (k: K) => void; etiqueta: string;
}) {
    return (
        <div className="flex w-fit min-w-0 max-w-full items-center rounded-2xl bg-card p-1 shadow-[var(--shadow-sm)]">
            <BarraPaginada>{p => (
                <PestanasElasticas opciones={opciones} activa={activa} onCambiar={onCambiar} aria-label={etiqueta}
                    claseFila="gap-1" radio={12}
                    claseOpcion="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-1.5 text-sm font-semibold"
                    claseInactiva="text-zinc-600 hover:text-foreground dark:text-zinc-300"
                    estiloOpcion={p.estiloOpcion}
                    revelar={p.revelar}
                    render={(o, sobre) => (
                        <>
                            {o.texto}
                            <span className={cn('tabular-nums', sobre ? 'text-white/80' : 'text-muted-foreground')}>{o.n}</span>
                        </>
                    )} />
            )}</BarraPaginada>
        </div>
    );
}
