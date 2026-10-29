import React from 'react';
import { ArrowRight, MapPin, Package } from 'lucide-react';
import { cn } from '../../utils/cn';
import { Cargando, Skeleton, SkeletonCirculo } from '../ui/Skeleton';

/**
 * Siluetas de carga de Inventario (diseno.md §9.17): la forma de cada tabla, tarjeta o detalle mientras llegan sus
 * datos. Lo que no depende del servidor (encabezados verdes, rótulos) se dibuja de verdad; lo demás va en gris.
 * Sobre una superficie `bg-muted` la silueta usa `bg-muted/40`: el gris de la silueta es el mismo `muted` y no se vería.
 */

/** Largos de una descripción, fila a fila (para que no parezcan bloques iguales). */
const ANCHOS_TEXTO =['w-3/4', 'w-1/2', 'w-2/3', 'w-2/5'];

/**
 * Filas grises de una tabla cuyo `<thead>` (verde) se dibuja de verdad. `anchos` = la barra de cada columna, con su
 * alineación (`ml-auto`, `mx-auto`) o alto propio; `'texto'` = una descripción, de largo variable.
 */
export const FilasTablaSilueta: React.FC<{ anchos: string[]; filas?: number; celda?: string }> = ({ anchos, filas = 8, celda = 'px-2 py-2' }) => (
    <tbody>
        {Array.from({ length: filas }).map((_, f) => (
            <tr key={f} className="border-t border-border">
                {anchos.map((a, c) => (
                    <td key={c} className={celda}>
                        <Skeleton className={cn('h-3', a === 'texto' ? ANCHOS_TEXTO[f % ANCHOS_TEXTO.length] : a)} />
                    </td>
                ))}
            </tr>
        ))}
    </tbody>
);

/**
 * Una columna del encabezado verde: su rótulo (texto o ícono), o `nombre` = el título también viene del servidor (obra
 * o bodega), en su color (`tono`). `subs` = la segunda fila del encabezado (Resumen: «Cant» / «Total»), cada uno una
 * columna de datos. `barra` vacía = la celda va vacía (la de imagen, que parte oculta).
 */
export interface ColumnaSilueta {
    texto?: React.ReactNode;
    nombre?: boolean;
    tono?: 'obra' | 'bodega';
    subs?: string[];
    clase?: string;
    barra: string;
}

const FONDO_TONO = { obra: 'bg-blue-50 dark:bg-blue-950', bodega: 'bg-amber-50 dark:bg-amber-950' } as const;

/**
 * Resumen y Obra/Bodega mientras llegan. Computador: la tabla con el encabezado verde de verdad, dos categorías y sus
 * filas en gris. Teléfono: la tarjeta de arriba con sus rótulos de verdad y las categorías plegables.
 */
export const SiluetaTablaStock: React.FC<{
    que: string;
    columnas: ColumnaSilueta[];
    /** Rótulo de la tarjeta de arriba en el teléfono («Resumen General», «Obra», «Bodega»). */
    rotulo: string;
    /** Rótulos de las cifras de esa tarjeta («Unidades», «Facturación»…), que son fijos; vacío = solo el nombre. */
    cifras: string[];
    /** Grilla de las cifras del Resumen: la misma clase que la tarjeta real (cambia con el permiso de valores). */
    claseCifras?: string;
    /** Tarjeta de Obra/Bodega (ícono del lugar, nombre y recuadros); sin esto, la del Resumen con «Exportar a Excel». */
    conLugar?: boolean;
    /** Buscador y filtros del Resumen (la barra de arriba). */
    conBarra?: boolean;
}> = ({ que, columnas, rotulo, cifras, claseCifras = 'grid-cols-3 gap-3', conLugar = false, conBarra = false }) => (
    <Cargando que={que} className="flex flex-col gap-3 flex-1 min-h-0 overflow-hidden">
        {/* ── Teléfono ── */}
        <div className="md:hidden flex flex-col gap-3" aria-hidden="true">
            {conBarra && (
                <>
                    <Skeleton className="h-11 w-full rounded-2xl" />
                    <Skeleton className="h-11 w-full rounded-2xl" />
                </>
            )}
            {conLugar ? (
                <div className="bg-card border border-border rounded-2xl p-4 shadow-[var(--shadow-md)]">
                    <div className="flex items-center gap-2 mb-3">
                        <div className="w-8 h-8 rounded-xl bg-muted text-muted-foreground flex items-center justify-center shrink-0">
                            <MapPin className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-caption text-muted-foreground uppercase tracking-wider">{rotulo}</p>
                            <div className="flex h-5 items-center"><Skeleton className="h-4 w-40 max-w-full" /></div>
                        </div>
                    </div>
                    {cifras.length > 0 && (
                        <div className="grid grid-cols-3 gap-2">
                            {cifras.map(r => (
                                <div key={r} className="bg-muted/40 rounded-xl p-2.5 min-w-0">
                                    <p className="text-micro text-muted-foreground uppercase tracking-wider mb-0.5">{r}</p>
                                    <div className="flex h-5 items-center"><Skeleton className="h-4 w-16 max-w-full" /></div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            ) : (
                <div className="bg-card border border-border rounded-2xl p-3">
                    <p className="text-caption font-medium uppercase tracking-wider text-muted-foreground mb-1.5">{rotulo}</p>
                    {cifras.length > 0 && (
                        <div className={cn('grid', claseCifras)}>
                            {cifras.map(r => (
                                <div key={r} className="flex items-center gap-2 sm:block min-w-0">
                                    <div className="flex h-6 sm:h-7 items-center"><Skeleton className="h-4 sm:h-5 w-16 max-w-full" /></div>
                                    <p className="text-caption text-muted-foreground">{r}</p>
                                </div>
                            ))}
                        </div>
                    )}
                    {/* El botón «Exportar a Excel» de ancho completo (Button sm). */}
                    <Skeleton className="mt-2.5 h-9 w-full rounded-full" />
                </div>
            )}
            {[0, 1, 2].map(g => (
                <div key={g} className="rounded-2xl border border-border overflow-hidden bg-card">
                    <div className="flex items-center justify-between gap-3 px-4 py-3 bg-muted/40">
                        <Skeleton className="h-3.5 w-28" />
                        <Skeleton className="h-3 w-16" />
                    </div>
                    <div className="divide-y divide-border">
                        {[0, 1].map(f => (
                            <div key={f} className="flex items-center gap-3 px-4 py-3">
                                <Skeleton className="h-10 w-10 shrink-0 rounded-xl" />
                                <div className="flex-1 min-w-0 space-y-1.5">
                                    <Skeleton className={cn('h-3.5', ANCHOS_TEXTO[(g + f) % ANCHOS_TEXTO.length])} />
                                    <Skeleton className="h-3 w-1/3" />
                                </div>
                                <Skeleton className="h-6 w-10 shrink-0 rounded-full" />
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </div>

        {/* ── Computador ── */}
        {conBarra && (
            <div className="hidden md:flex items-center gap-2 shrink-0" aria-hidden="true">
                <Skeleton className="h-9 w-64 rounded-xl" />
                <Skeleton className="h-9 w-44 rounded-xl" />
            </div>
        )}
        <div className="hidden md:block flex-1 min-h-0 overflow-hidden rounded-xl border border-border" aria-hidden="true">
            <table className="w-full text-label border-collapse">
                <thead>
                    <tr>
                        {columnas.map((c, i) => (
                            <th
                                key={i}
                                colSpan={c.subs?.length ?? 1}
                                className={cn(
                                    'py-2 font-bold border-b border-r border-border last:border-r-0',
                                    c.nombre ? cn('px-1', FONDO_TONO[c.tono ?? 'obra']) : 'px-2 bg-brand-primary text-white',
                                    c.clase ?? 'text-left',
                                )}
                            >
                                {/* El nombre del lugar va entre los botones de arrastrar y ocultar (h-8). */}
                                {c.nombre ? <div className="flex h-8 items-center justify-center"><Skeleton className="h-3 w-16" /></div> : c.texto}
                            </th>
                        ))}
                    </tr>
                    {columnas.some(c => c.subs) && (
                        <tr>
                            {columnas.map((c, i) => c.subs ? c.subs.map(s => (
                                <th key={`${i}-${s}`} className={cn('px-1 py-1 text-center text-micro text-muted-foreground font-semibold border-b border-r border-border uppercase tracking-wider', FONDO_TONO[c.tono ?? 'obra'])}>
                                    {s}
                                </th>
                            )) : (
                                <th key={i} className="bg-muted border-b border-r border-border last:border-r-0" />
                            ))}
                        </tr>
                    )}
                </thead>
                <tbody>
                    {[0, 1].map(g => (
                        <React.Fragment key={g}>
                            <tr className="bg-muted/40">
                                <td colSpan={columnas.reduce((n, c) => n + (c.subs?.length ?? 1), 0)} className="px-3 py-2">
                                    <Skeleton className="h-3 w-32" />
                                </td>
                            </tr>
                            {[0, 1, 2, 3, 4].map(f => (
                                <tr key={f} className="border-b border-border">
                                    {columnas.flatMap((c, i) => (c.subs ?? ['']).map(s => (
                                        <td key={`${i}-${s}`} className="px-2 py-1.5 border-r border-border last:border-r-0">
                                            {c.barra && <Skeleton className={cn('h-3', c.barra === 'texto' ? ANCHOS_TEXTO[(g + f) % ANCHOS_TEXTO.length] : c.barra)} />}
                                        </td>
                                    )))}
                                </tr>
                            ))}
                        </React.Fragment>
                    ))}
                </tbody>
            </table>
        </div>
    </Cargando>
);

/**
 * Un movimiento en tarjeta (detalle del ítem; Movimientos en el teléfono): tipo y lugar, «Saldo antes → diferencia →
 * Saldo actual» con sus rótulos de verdad, y quién. `conItem` = también la fecha y el ítem (lista general).
 */
export const TarjetaMovimientoSilueta: React.FC<{ i: number; conItem?: boolean }> = ({ i, conItem = false }) => (
    <li className={cn('px-3', conItem ? 'py-3' : 'py-2.5')}>
        <div className="flex items-center gap-1.5 min-w-0">
            <Skeleton className={cn('h-5 w-20 shrink-0', conItem ? 'rounded-md' : 'rounded-full')} />
            <Skeleton className={cn('h-3.5', i % 2 ? 'w-1/3' : 'w-2/5')} />
            {conItem && <Skeleton className="ml-auto h-2.5 w-20 shrink-0" />}
        </div>
        {conItem && <Skeleton className={cn('mt-2 h-3.5', ANCHOS_TEXTO[i % ANCHOS_TEXTO.length])} />}
        <div className="mt-2 grid grid-cols-3 items-center rounded-lg bg-muted/40 px-2 py-1.5 text-center">
            <div>
                <span className="block text-micro font-semibold uppercase tracking-wide text-muted-foreground">Saldo antes</span>
                <Skeleton className="mx-auto mt-1 h-4 w-10" />
            </div>
            <Skeleton className="mx-auto h-6 w-10" />
            <div>
                <span className="block text-micro font-semibold uppercase tracking-wide text-muted-foreground">Saldo actual</span>
                <Skeleton className="mx-auto mt-1 h-4 w-10" />
            </div>
        </div>
        <Skeleton className="mt-2 h-2.5 w-32 max-w-full" />
    </li>
);

/**
 * Detalle de una solicitud mientras llega (Inventario → Solicitudes y «Aprobar o rechazar» del Inicio): código y
 * ruta, estado y «Acciones», los pasos y los ítems (tarjetas en el teléfono, tabla con su encabezado verde desde md).
 */
export const SiluetaDetalleSolicitud: React.FC<{ className?: string }> = ({ className }) => (
    <Cargando que="la solicitud" className={cn('flex flex-col flex-1 min-h-0 overflow-hidden p-3 md:p-6', className)}>
        <div aria-hidden="true">
            {/* El «Volver» del teléfono (Button sm): su lugar en gris, sin un botón que todavía no haría nada. */}
            <Skeleton className="md:hidden mb-3 h-9 w-24 rounded-full" />
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between mb-4">
                <div className="min-w-0 space-y-2">
                    <Skeleton className="h-6 w-36" />
                    <div className="flex items-center gap-1.5">
                        <Skeleton className="h-3 w-24" />
                        <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground/40" />
                        <Skeleton className="h-3 w-28" />
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Skeleton className="h-8 w-28 rounded-full" />
                    <Skeleton className="h-9 w-28 rounded-full" />
                </div>
            </div>

            {/* Pasos: los nodos dependen del tipo de solicitud, así que van en gris. */}
            <div className="flex items-center justify-between px-1 md:px-4 mb-5">
                {[0, 1, 2, 3].map(i => (
                    <React.Fragment key={i}>
                        {i > 0 && <div className="flex-1 h-0.5 mx-1 md:mx-2 bg-muted" />}
                        <div className="flex flex-col items-center gap-1.5">
                            <SkeletonCirculo className="h-8 w-8 md:h-10 md:w-10" />
                            <Skeleton className="h-2.5 w-12" />
                        </div>
                    </React.Fragment>
                ))}
            </div>

            <h4 className="text-xs font-bold text-brand-dark mb-2 flex items-center gap-1.5">
                <Package className="h-3.5 w-3.5" />
                Items
            </h4>
            <div className="md:hidden flex flex-col gap-2">
                {[0, 1, 2].map(i => (
                    <div key={i} className="border border-border rounded-xl p-3 bg-card">
                        <Skeleton className={cn('h-3.5', ANCHOS_TEXTO[i])} />
                        <div className="grid grid-cols-3 gap-2 mt-2 text-center">
                            {['Solicit.', 'Enviada', 'Recibida'].map(r => (
                                <div key={r}>
                                    <div className="text-micro text-muted-foreground uppercase tracking-wider">{r}</div>
                                    <Skeleton className="mx-auto mt-1 h-4 w-8" />
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
            <div className="hidden md:block border border-border rounded-xl overflow-hidden">
                <table className="w-full text-label">
                    <thead>
                        <tr className="bg-brand-primary">
                            <th className="text-left px-3 py-2 font-bold text-white">Item</th>
                            <th className="text-center px-2 py-2 font-bold text-white w-16">Solicit.</th>
                            <th className="text-center px-2 py-2 font-bold text-white w-16">Enviada</th>
                            <th className="text-center px-2 py-2 font-bold text-white w-16">Recibida</th>
                            <th className="text-center px-2 py-2 font-bold text-white w-24">Progreso</th>
                        </tr>
                    </thead>
                    <FilasTablaSilueta filas={4} anchos={['texto', 'w-6 mx-auto', 'w-6 mx-auto', 'w-6 mx-auto', 'h-2 w-full rounded-full']} />
                </table>
            </div>
        </div>
    </Cargando>
);
