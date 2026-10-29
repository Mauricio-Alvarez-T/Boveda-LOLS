import React from 'react';
import { cn } from '../../../utils/cn';
import { Cargando, Skeleton } from '../../ui/Skeleton';
import { EncabezadoTarjeta } from './EncabezadoTarjeta';

/**
 * Piezas de silueta de carga del Inicio (diseno.md §9.17): la forma de las tarjetas y detalles mientras llegan sus
 * datos. El encabezado (ícono, título, subtítulo) y los rótulos fijos van de verdad; el círculo, en neutro (su color
 * dice qué pasa y eso todavía no se sabe); cifras y filas, en gris con el brillo.
 */

/** La cifra grande de `CifraTarjeta` (text-5xl, una línea de 48 px) en gris; la etiqueta, de verdad si es fija. */
export const CifraTarjetaSilueta: React.FC<{ etiqueta?: string; className?: string }> = ({ etiqueta, className }) => (
    <div className={cn('mb-4 flex items-end gap-2', className)} aria-hidden="true">
        <Skeleton className="h-12 w-16" />
        {etiqueta ? <span className="text-sm text-muted-foreground">{etiqueta}</span> : <Skeleton className="mb-1 h-3.5 w-24" />}
    </div>
);

/**
 * Las filas de una tarjeta del Inicio (borde arriba, py-2.5): ícono chico opcional, una o dos líneas y una píldora
 * opcional a la derecha.
 */
export const FilasTarjetaSilueta: React.FC<{ filas?: number; icono?: boolean; dosLineas?: boolean; pildora?: boolean }> = ({
    filas = 3, icono = false, dosLineas = true, pildora = false,
}) => (
    <div aria-hidden="true">
        {Array.from({ length: filas }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 border-t border-border py-2.5">
                {icono && <Skeleton className="h-4 w-4 shrink-0 rounded" />}
                <div className="min-w-0 flex-1 space-y-1.5">
                    <Skeleton className={cn('h-4', i % 3 === 1 ? 'w-1/2' : 'w-3/4')} />
                    {dosLineas && <Skeleton className={cn('h-3', i % 2 ? 'w-2/5' : 'w-3/5')} />}
                </div>
                {pildora && <Skeleton className="h-6 w-20 shrink-0 rounded-full" />}
            </div>
        ))}
    </div>
);

/**
 * Una tarjeta del Inicio mientras llegan sus datos: encabezado de verdad, cifra y filas en gris, y abajo el pie de
 * verdad (el «Ver más», que no depende de los datos).
 */
export const TarjetaInicioSilueta: React.FC<{
    icon: React.ElementType;
    titulo: string;
    subtitulo?: string;
    /** Lo de la derecha del encabezado, si es fijo («Hoy»). */
    extra?: React.ReactNode;
    /** Etiqueta de la cifra si es fija; sin ella va en gris. `false` = la tarjeta no lleva cifra. */
    etiqueta?: string | false;
    filas?: number;
    icono?: boolean;
    dosLineas?: boolean;
    pildora?: boolean;
    que: string;
    pie?: React.ReactNode;
}> = ({ icon, titulo, subtitulo, extra, etiqueta, filas = 3, icono, dosLineas, pildora, que, pie }) => (
    <div className="flex h-full flex-col">
        <EncabezadoTarjeta icon={icon} titulo={titulo} subtitulo={subtitulo} extra={extra} />
        <Cargando que={que}>
            {etiqueta !== false && <CifraTarjetaSilueta etiqueta={etiqueta || undefined} />}
            <FilasTarjetaSilueta filas={filas} icono={icono} dosLineas={dosLineas} pildora={pildora} />
        </Cargando>
        {pie && <div className="mt-auto flex items-center justify-end gap-3 pt-3">{pie}</div>}
    </div>
);
