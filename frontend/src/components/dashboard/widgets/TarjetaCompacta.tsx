import React from 'react';
import { ArrowRight, ChevronDown } from 'lucide-react';
import { cn } from '../../../utils/cn';
import { NumeroRodante } from '../../ui/NumeroRodante';
import { PestanasElasticas } from '../../ui/PestanasElasticas';
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

/** Burbuja con la cifra sobre el ícono de la barra: solo lo que avisa (rojo, ámbar, azul). */
const BURBUJA: Partial<Record<TonoTarjeta, string>> = {
    rojo: 'bg-red-600 text-white',
    ambar: 'bg-amber-400 text-amber-950',
    azul: 'bg-blue-600 text-white',
};

export interface AccesoModulo {
    key: string;
    icon: React.ElementType;
    tono: TonoTarjeta;
    titulo: string;
    /** null = cargando: sin burbuja. */
    cifra: number | null;
}

/**
 * Barra de accesos del Inicio en el CELULAR (dueño 2026-10-20): en el teléfono no hay tarjetas; se entra
 * directo al detalle del primer módulo y esta barra fija abajo cambia entre ellos. Blanca, con íconos y
 * nombres en gris; el módulo en curso en verde LOLS sobre una píldora que viaja con el indicador elástico de
 * `PestanasElasticas` («rubber segment», §9.12; en seco con «reducir movimiento»). La cifra va en una burbuja
 * solo si avisa algo. Desde 640 px no existe: ahí siguen las tarjetas, las franjas y la cola de gota.
 */
export const BarraModulos: React.FC<{ items: AccesoModulo[]; activo: string | null; onElegir: (clave: string) => void }> = ({
    items, activo, onElegir,
}) => (
    <nav aria-label="Accesos rápidos"
        className="barra-modulos fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card px-2 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] shadow-[0_-4px_16px_rgba(0,0,0,0.06)] sm:hidden">
        <PestanasElasticas
            opciones={items}
            activa={activo}
            onCambiar={onElegir}
            aria-label="Módulos del Inicio"
            claseFila="w-full gap-1"
            claseOpcion="flex flex-1 flex-col items-center gap-1 rounded-2xl px-1 py-2 text-label font-semibold"
            claseInactiva="text-zinc-600 dark:text-zinc-300"
            radio={16}
            claseIndicador="bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-300"
            titulo={o => (o.cifra ? `${o.titulo}: ${o.cifra}` : o.titulo)}
            render={o => {
                const Icono = o.icon;
                const burbuja = o.cifra != null && o.cifra > 0 ? BURBUJA[o.tono] : undefined;
                return (
                    <>
                        <span className="relative inline-flex">
                            <Icono className="h-6 w-6" aria-hidden />
                            {burbuja && (
                                <span className={cn('absolute -right-3 -top-1.5 h-[18px] min-w-[18px] rounded-full px-1 text-center text-caption font-bold leading-[18px] tabular-nums ring-2 ring-card', burbuja)}>
                                    {(o.cifra ?? 0) > 99 ? '99+' : o.cifra}
                                </span>
                            )}
                        </span>
                        <span className="max-w-full truncate leading-tight">{o.titulo}</span>
                    </>
                );
            }}
        />
    </nav>
);

/**
 * Módulo en curso, en el centro del encabezado del CELULAR (dueño 2026-10-20): reemplaza al encabezado del
 * detalle («Asistencia» + «Ir a Asistencia») para ganar alto. Una píldora verde LOLS que dice dónde se está
 * y, al tocarla, lleva al módulo completo.
 */
export const ModuloEnCurso: React.FC<{ icon: React.ElementType; titulo: string; onIr: () => void }> = ({ icon: Icon, titulo, onIr }) => (
    // eslint-disable-next-line no-restricted-syntax -- píldora del encabezado
    <button type="button" onClick={onIr} aria-label={`Ir a ${titulo}`}
        className="inline-flex h-9 max-w-full items-center gap-2 rounded-full bg-green-700 pl-3 pr-3.5 text-sm font-semibold text-white shadow-[0_4px_12px_rgba(21,128,61,0.30)] transition-colors duration-200 hover:bg-green-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-700/40 focus-visible:ring-offset-2 motion-reduce:transition-none dark:bg-green-600 dark:hover:bg-green-700">
        <Icon className="h-4 w-4 shrink-0" aria-hidden />
        <span className="truncate">{titulo}</span>
        <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
    </button>
);
