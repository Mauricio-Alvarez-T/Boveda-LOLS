import React from 'react';
import { cn } from '../../../utils/cn';
import { NumeroRodante } from '../../ui/NumeroRodante';
import { CIFRA_SOBRE_VERDE, CIFRA_TARJETA, CIRCULO_TARJETA, ICONO_SOBRE_VERDE, useTarjetaActiva, type TonoTarjeta } from './tarjetaActiva';

/**
 * Encabezado común de las tarjetas del Inicio (propuesta H, dueño 2026-10-16; diseno.md §9.14):
 * círculo de color SÓLIDO con el ícono en blanco + título, y una cifra grande en el mismo color.
 *
 * El color dice qué pasa (regla 4 del DS): rojo = vencido / con consecuencia, ámbar = pendiente,
 * azul = informativo, verde = al día, neutro = solo dato. Si una tarjeta no tiene nada que avisar,
 * su tono es verde o neutro, nunca rojo "por estilo".
 */
export type { TonoTarjeta };

interface EncabezadoProps {
    icon: React.ElementType;
    tono?: TonoTarjeta;
    titulo: string;
    /** Línea chica bajo el título (umbral, ventana de días, …). */
    subtitulo?: string;
    /** Lo que va a la derecha: selector de semana, "Este mes", contador. */
    extra?: React.ReactNode;
    className?: string;
}

export const EncabezadoTarjeta: React.FC<EncabezadoProps> = ({ icon: Icon, tono = 'neutro', titulo, subtitulo, extra, className }) => {
    const activa = useTarjetaActiva();
    return (
    <div className={cn('flex flex-wrap items-center justify-between gap-3 mb-4', className)}>
        <div className="flex items-center gap-3 min-w-0">
            <span className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors duration-200', activa ? ICONO_SOBRE_VERDE[tono] : CIRCULO_TARJETA[tono])}>
                <Icon className="h-5 w-5" aria-hidden />
            </span>
            {/* Título y subtítulo parten línea, nunca «…» (dueño 2026-10-21: «Documentos físicos fuera de
                plazo» se cortaba en el teléfono). */}
            <div className="min-w-0">
                <h3 className="text-base font-semibold text-foreground break-words">{titulo}</h3>
                {subtitulo && <p className="text-caption text-muted-foreground break-words">{subtitulo}</p>}
            </div>
        </div>
        {extra}
    </div>
    );
};

interface CifraProps {
    /** null = todavía cargando: se muestra «—», nunca un 0 falso (§9.4). */
    valor: number | null;
    etiqueta: string;
    tono?: TonoTarjeta;
    className?: string;
}

/** Cifra grande de la tarjeta con su etiqueta al lado («3 vencidos», «15 obras sin guardar»). */
export const CifraTarjeta: React.FC<CifraProps> = ({ valor, etiqueta, tono = 'neutro', className }) => {
    const activa = useTarjetaActiva();
    return (
    <p className={cn('flex items-baseline gap-2 mb-4', className)}>
        <span className={cn('text-5xl font-bold tracking-tight leading-none tabular-nums', activa ? CIFRA_SOBRE_VERDE[tono] : CIFRA_TARJETA[tono])}>
            {valor === null ? '—' : <NumeroRodante value={valor} />}
        </span>
        <span className="text-sm text-muted-foreground">{etiqueta}</span>
    </p>
    );
};
