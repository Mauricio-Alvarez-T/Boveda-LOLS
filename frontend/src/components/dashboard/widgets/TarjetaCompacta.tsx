import React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../../utils/cn';
import { NumeroRodante } from '../../ui/NumeroRodante';
import { ID_DETALLE_INICIO } from './BotonVerMas';
import { CIFRA_SOBRE_VERDE, CIFRA_TARJETA, CIRCULO_TARJETA, ICONO_SOBRE_VERDE, useTarjetaActiva, type TonoTarjeta } from './tarjetaActiva';

interface Props {
    icon: React.ElementType;
    tono: TonoTarjeta;
    titulo: string;
    /** Qué cuenta la cifra, en dos o tres palabras (la franja es angosta): «faltas reiteradas». */
    detalle: string;
    /** null = todavía cargando («—», nunca un 0 falso). */
    cifra: number | null;
    onClick: () => void;
}

/**
 * Tarjeta del Inicio en su forma COMPACTA (dueño 2026-10-20): con un detalle abierto, las cuatro tarjetas se
 * pliegan a una franja —ícono, título, lo que cuenta y su cifra— para dejar espacio de trabajo, y funcionan
 * como pestañas: pinchar otra cambia el detalle; pinchar la elegida lo cierra y las tarjetas vuelven a
 * crecer. Es un botón de verdad (Tab + Enter) que dice si su detalle está abierto.
 */
export const TarjetaCompacta: React.FC<Props> = ({ icon: Icon, tono, titulo, detalle, cifra, onClick }) => {
    const activa = useTarjetaActiva();
    return (
        // eslint-disable-next-line no-restricted-syntax -- la franja entera es el control (pestaña)
        <button type="button" onClick={onClick} aria-expanded={activa} aria-controls={ID_DETALLE_INICIO}
            className="flex w-full items-center gap-3 rounded-2xl text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40">
            <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors duration-200',
                activa ? ICONO_SOBRE_VERDE[tono] : CIRCULO_TARJETA[tono])}>
                <Icon className="h-4 w-4" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
                <span className="block truncate text-base font-semibold text-foreground">{titulo}</span>
                <span className="block truncate text-caption text-muted-foreground">{detalle}</span>
            </span>
            {cifra == null
                ? <span className="text-headline font-bold leading-none text-muted-foreground">—</span>
                : <NumeroRodante value={cifra} className={cn('text-headline font-bold leading-none tracking-tight',
                    activa ? CIFRA_SOBRE_VERDE[tono] : CIFRA_TARJETA[tono])} />}
            <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none',
                activa && 'rotate-180')} aria-hidden />
        </button>
    );
};

/**
 * «Cola de gota» bajo la tarjeta elegida (dueño 2026-10-20): una punta del mismo verde que baja hacia el
 * detalle y dice de qué tarjeta es lo que se está viendo. Toma `--card`, que dentro de la tarjeta elegida es
 * el verde LOLS (claro y oscuro). Aparece estirándose hacia abajo (keyframes `cola-gota`, sin
 * «reducir movimiento»). `className` decide en qué anchos se ve: solo cuando las tarjetas van en una fila.
 */
export const ColaGota: React.FC<{ className?: string }> = ({ className }) => (
    <svg aria-hidden viewBox="0 0 44 18"
        className={cn('cola-gota pointer-events-none absolute top-full left-[calc(50%-22px)] -mt-px h-[18px] w-11', className)}>
        <path d="M0 0C12 0 18 3 20.5 13.5C21.1 16.2 22.9 16.2 23.5 13.5C26 3 32 0 44 0Z" fill="var(--card)" />
    </svg>
);
