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

/** Burbuja con la cifra sobre el ícono de la barra: sólida, para que se lea en un vistazo. */
const BURBUJA: Record<TonoTarjeta, string> = {
    rojo: 'bg-red-600 text-white',
    ambar: 'bg-amber-400 text-amber-950',
    azul: 'bg-blue-600 text-white',
    verde: 'bg-muted text-foreground',
    neutro: 'bg-muted text-foreground',
};

export interface AccesoModulo {
    clave: string;
    icon: React.ElementType;
    tono: TonoTarjeta;
    titulo: string;
    /** null = cargando: sin burbuja. */
    cifra: number | null;
}

/**
 * Barra de accesos rápidos del Inicio en el CELULAR (dueño 2026-10-20): con un detalle abierto, las cuatro
 * tarjetas apiladas se ocultan y quedan como botones fijos abajo —ícono, nombre y su cifra en una burbuja—.
 * El del detalle abierto va en verde; tocar otro cambia de detalle y tocar el verde lo cierra (vuelven las
 * tarjetas). Desde 640 px no existe: ahí siguen las franjas con su cola de gota. Entra desde abajo
 * (keyframes `barra-sube`, sin «reducir movimiento») y respeta el área segura del teléfono.
 */
export const BarraModulos: React.FC<{ items: AccesoModulo[]; activo: string | null; onElegir: (clave: string) => void }> = ({
    items, activo, onElegir,
}) => (
    <nav aria-label="Módulos del Inicio"
        className="barra-modulos fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 px-2 pt-1.5 pb-[calc(0.375rem+env(safe-area-inset-bottom))] shadow-[0_-4px_16px_rgba(0,0,0,0.08)] backdrop-blur sm:hidden">
        <ul className="grid gap-1" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
            {items.map(({ clave, icon: Icon, tono, titulo, cifra }) => {
                const elegido = clave === activo;
                return (
                    <li key={clave}>
                        {/* eslint-disable-next-line no-restricted-syntax -- botón de la barra (pestaña) */}
                        <button type="button" onClick={() => onElegir(clave)} aria-expanded={elegido} aria-controls={ID_DETALLE_INICIO}
                            className={cn('flex w-full flex-col items-center gap-1 rounded-2xl px-1 py-1.5 transition-colors duration-200 motion-reduce:transition-none',
                                'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40',
                                elegido ? 'bg-green-700 text-white dark:bg-green-900' : 'text-foreground active:bg-muted')}>
                            <span className="relative">
                                <span className={cn('flex h-9 w-9 items-center justify-center rounded-full transition-colors duration-200',
                                    elegido ? ICONO_SOBRE_VERDE[tono] : CIRCULO_TARJETA[tono])}>
                                    <Icon className="h-4 w-4" aria-hidden />
                                </span>
                                {cifra != null && cifra > 0 && (
                                    <span className={cn('absolute -right-2.5 -top-1.5 min-w-5 rounded-full px-1 text-center text-label font-bold leading-5 tabular-nums ring-2',
                                        elegido ? 'bg-yellow-300 text-green-950 ring-green-700 dark:ring-green-900' : cn(BURBUJA[tono], 'ring-card'))}>
                                        {cifra > 99 ? '99+' : cifra}
                                    </span>
                                )}
                            </span>
                            <span className="max-w-full truncate text-label font-semibold leading-tight">{titulo}</span>
                        </button>
                    </li>
                );
            })}
        </ul>
    </nav>
);
