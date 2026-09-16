/**
 * Grilla de Trabajadores de Gestiones (rediseño 2026-09-15): tabla real con encabezados en desktop y
 * tarjetas en móvil. Una fila = una persona: clic en la fila abre la ficha (quick view); la casilla
 * selecciona para acciones masivas (Enviar / Exportar), que aparecen en una barra que reemplaza la
 * cabecera mientras haya selección. Las acciones por fila son iconos siempre visibles (los tutoriales
 * de Ayuda resaltan «Editar trabajador» por su aria-label) y usan verbos del dominio: Desvincular, no
 * Eliminar. Sin numeración de filas ni barra de estado: la cabecera lleva el botón de filtros, los
 * atajos y el conteo de resultados.
 */
import React from 'react';
import { Mail, FileDown, FileText, UserPen, UserMinus, UserCheck, Eraser, Search, X, Building2, CalendarPlus, AlertTriangle } from 'lucide-react';

import type { TrabajadorAvanzado } from '../../hooks/consultas/useConsultasData';
import type { Trabajador } from '../../types/entities';
import { cn } from '../../utils/cn';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import { Chip } from '../ui/Chip';
import { EmptyState } from '../ui/EmptyState';

interface Props {
    workers: TrabajadorAvanzado[];
    loading: boolean;
    activeFilterCount: number;
    hasPermission: (perm: string) => boolean;
    selected: Set<number>;
    onToggle: (id: number) => void;
    onClearSelection: () => void;
    onOpen: (id: number) => void;
    onEditar: (w: Trabajador) => void;
    onConstancia: (w: Trabajador) => void;
    onDesvincular: (w: Trabajador) => void;
    onReactivar: (w: Trabajador) => void;
    onDepurar: (w: Trabajador) => void;
    onEnviar: () => void;
    onExportar: (ids: number[]) => void;
    exporting: boolean;
    onClearFilters: () => void;
    formatFecha: (f?: string | null) => string | null;
    /** Botón que abre el panel de filtros: primer elemento de la barra, pegado al borde por donde sale. */
    filtros?: React.ReactNode;
    /** Chips de atajos: van dentro de la barra de la cabecera, no en una fila propia. */
    atajos?: React.ReactNode;
}

const iniciales = (w: Trabajador) => `${(w.apellido_paterno || '')[0] || ''}${(w.nombres || '')[0] || ''}`.toUpperCase();

const DocsBar: React.FC<{ pct: number; compact?: boolean }> = ({ pct, compact }) => {
    const p = Math.max(0, Math.min(100, pct));
    const completo = p === 100;
    return (
        <div className={cn('flex items-center gap-2', compact ? 'w-full' : 'w-32')}>
            <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
                <div className={cn('h-full rounded-full transition-all duration-500', completo ? 'bg-brand-primary' : p >= 50 ? 'bg-amber-500' : 'bg-red-500')} style={{ width: `${p}%` }} />
            </div>
            <span className={cn('w-9 text-right text-caption font-semibold tabular-nums', completo ? 'text-brand-primary' : p >= 50 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400')}>{p}%</span>
        </div>
    );
};

export const TrabajadoresGrilla: React.FC<Props> = ({
    workers, loading, activeFilterCount, hasPermission, selected, onToggle, onClearSelection, onOpen,
    onEditar, onConstancia, onDesvincular, onReactivar, onDepurar, onEnviar, onExportar, exporting, onClearFilters, formatFecha, filtros, atajos,
}) => {
    const haySel = selected.size > 0;

    // Render helpers (no componentes: crearlos dentro del render rompe la regla react-hooks y pierde estado).
    const casilla = (checked: boolean, onChange: () => void, label: string) => (
        <input type="checkbox" checked={checked} onChange={onChange} onClick={e => e.stopPropagation()} aria-label={label}
            className="h-4 w-4 shrink-0 cursor-pointer rounded border-input accent-brand-primary" />
    );

    const acciones = (w: TrabajadorAvanzado) => (
        <div className="flex items-center gap-0.5" onClick={e => e.stopPropagation()}>
            <IconButton variant="ghost" size="sm" aria-label="Constancia"
                title={hasPermission('documentos.laborales.emitir') ? 'Carta de amonestación' : 'Requiere "Emitir Documentos Laborales"'}
                disabled={!hasPermission('documentos.laborales.emitir') || !w.activo}
                onClick={() => onConstancia(w)} icon={<FileText className="h-4 w-4" />} />
            <IconButton variant="ghost" size="sm" aria-label="Editar trabajador" title="Editar trabajador"
                disabled={!hasPermission('trabajadores.editar')}
                onClick={() => onEditar(w)} icon={<UserPen className="h-4 w-4" />} />
            {w.activo ? (
                <IconButton variant="danger" size="sm" aria-label="Desvincular trabajador" title="Desvincular"
                    disabled={!hasPermission('trabajadores.eliminar')}
                    onClick={() => onDesvincular(w)} icon={<UserMinus className="h-4 w-4" />} />
            ) : (<>
                <IconButton variant="ghost" size="sm" aria-label="Reactivar trabajador" title="Reactivar"
                    disabled={!hasPermission('trabajadores.reactivar')}
                    onClick={() => onReactivar(w)} icon={<UserCheck className="h-4 w-4" />} />
                {hasPermission('trabajadores.depurar') && (
                    <IconButton variant="danger" size="sm" aria-label="Depurar trabajador" title="Depurar (borrado definitivo)"
                        onClick={() => onDepurar(w)} icon={<Eraser className="h-4 w-4" />} />
                )}
            </>)}
        </div>
    );

    const estado = (w: TrabajadorAvanzado) => (
        <>
            {!w.activo && <Chip tone="danger" label="Desvinculado" />}
            {!!w.no_recontratar && <Chip tone="danger" icon={<AlertTriangle className="h-3 w-3" />} label="No recontratar" />}
            {!!w.es_prueba && <Chip tone="warning" label="Prueba" />}
        </>
    );

    return (
        <div className="flex-1 min-h-0 min-w-0 flex flex-col bg-card border border-border rounded-3xl shadow-[var(--shadow-md)] overflow-hidden relative">
            {/* Cabecera: filtros + atajos, o barra de selección */}
            <div className={cn('h-14 shrink-0 border-b border-border px-3 sm:px-4 flex items-center gap-3 transition-colors', haySel && 'bg-brand-primary/5')}>
                {/* Ancla fija: el control de filtros abre un panel que aparece PEGADO al borde izquierdo
                    de esta card, así que vive acá, el único punto de la pantalla adyacente a donde entra.
                    Queda FUERA del ternario a propósito: durante una selección los filtros siguen
                    alcanzables (solo se esconde su rótulo para no estorbar a las acciones masivas). */}
                {filtros && (
                    <div className={cn('shrink-0', haySel && '[&_[data-rotulo]]:hidden')}>{filtros}</div>
                )}

                {haySel ? (<>
                    <IconButton variant="ghost" size="sm" aria-label="Quitar selección" onClick={onClearSelection} icon={<X className="h-4 w-4" />} />
                    <span className="text-ui font-bold text-brand-dark tabular-nums">{selected.size} seleccionado{selected.size === 1 ? '' : 's'}</span>
                    <div className="ml-auto flex items-center gap-2">
                        <Button variant="glass" size="sm" onClick={onEnviar} leftIcon={<Mail className="h-4 w-4" />}><span className="hidden sm:inline">Enviar por correo</span><span className="sm:hidden">Enviar</span></Button>
                        <Button variant="primary" size="sm" onClick={() => onExportar(Array.from(selected))} disabled={exporting || !hasPermission('reportes.exportar')} leftIcon={<FileDown className="h-4 w-4" />}>Exportar</Button>
                    </div>
                </>) : (<>
                    {/* Botón de filtros · atajos · conteo. «Seleccionar todos» se quitó (2026-09-16):
                        el dueño confirmó que no se usa nunca, y su sitio es el que mejor le queda al
                        número de resultados — al final de la barra, donde termina de leerse el filtro que
                        acabas de aplicar. La selección múltiple sigue existiendo casilla por casilla.
                        El anuncio para lectores de pantalla NO va acá: esta rama se desmonta al marcar la
                        primera casilla, y una región viva tiene que estar siempre montada para anunciar. */}
                    {atajos && <div className="min-w-0 flex-1">{atajos}</div>}
                    <span className={cn('shrink-0 text-ui font-bold text-brand-dark tabular-nums', !atajos && 'ml-auto')}>
                        {loading ? 'Buscando…' : `${workers.length} trabajador${workers.length === 1 ? '' : 'es'}`}
                    </span>
                </>)}

                {/* Región viva permanente: el número de arriba cambia solo (al filtrar o al buscar) y
                    desaparece mientras hay selección, así que el anuncio vive en un nodo que nunca se
                    desmonta. `sr-only` es absolute: no ocupa sitio en la barra. */}
                <span className="sr-only" aria-live="polite">
                    {loading ? 'Buscando trabajadores' : `${workers.length} trabajador${workers.length === 1 ? '' : 'es'}`}
                </span>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                {loading ? (
                    <div className="p-3 flex flex-col gap-2">
                        {[1, 2, 3, 4, 5, 6].map(i => (
                            <div key={i} className="h-16 w-full rounded-2xl border border-border bg-card flex items-center px-4 gap-4 animate-pulse">
                                <div className="h-4 w-4 rounded bg-muted" /><div className="h-10 w-10 rounded-xl bg-muted" />
                                <div className="flex-1 space-y-2"><div className="h-3.5 w-1/3 rounded bg-muted" /><div className="h-3 w-1/5 rounded bg-muted" /></div>
                                <div className="hidden md:block h-3 w-1/6 rounded bg-muted" /><div className="hidden md:block h-1.5 w-32 rounded bg-muted" />
                            </div>
                        ))}
                    </div>
                ) : workers.length === 0 ? (
                    <EmptyState icon={Search} title="Sin resultados" description="No se encontraron trabajadores que coincidan con los filtros aplicados." className="h-full justify-center"
                        action={activeFilterCount > 0 ? <Button variant="outline" size="sm" onClick={onClearFilters}>Limpiar Búsqueda</Button> : undefined} />
                ) : (<>
                    {/* Desktop: tabla */}
                    <table className="hidden md:table w-full border-separate border-spacing-0">
                        <thead className="sticky top-0 z-10 bg-card">
                            <tr className="text-left text-caption font-semibold uppercase tracking-wider text-muted-foreground [&>th]:border-b [&>th]:border-border [&>th]:px-3 [&>th]:py-2.5">
                                <th className="w-10" />
                                <th>Trabajador</th>
                                <th>Empresa · Obra</th>
                                <th className="hidden xl:table-cell">Cargo</th>
                                <th>Ingreso</th>
                                <th>Documentación</th>
                                <th className="w-32 text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {workers.map(w => {
                                const sel = selected.has(w.id);
                                return (
                                    <tr key={w.id} onClick={() => onOpen(w.id)}
                                        className={cn('group cursor-pointer transition-colors [&>td]:border-b [&>td]:border-border/70 [&>td]:px-3 [&>td]:py-2.5',
                                            sel ? 'bg-brand-primary/5' : 'hover:bg-muted/60', !w.activo && 'text-muted-foreground')}>
                                        <td>{casilla(sel, () => onToggle(w.id), `Seleccionar ${w.apellido_paterno} ${w.nombres}`)}</td>
                                        <td>
                                            <div className="flex items-center gap-3 min-w-0">
                                                <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-section font-bold',
                                                    w.activo ? 'bg-brand-primary/10 text-brand-primary' : 'bg-muted text-muted-foreground')}>{iniciales(w)}</span>
                                                <div className="min-w-0">
                                                    <p className={cn('text-ui font-bold leading-tight truncate group-hover:text-brand-primary transition-colors', w.activo ? 'text-brand-dark' : 'text-muted-foreground')}>
                                                        {w.apellido_paterno} {w.apellido_materno} {w.nombres}
                                                    </p>
                                                    <p className="mt-0.5 flex items-center gap-1.5 text-caption text-muted-foreground tabular-nums">{w.rut}{estado(w)}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td>
                                            <p className="text-section font-semibold text-brand-dark truncate max-w-56">{w.obra_nombre || 'Sin obra'}</p>
                                            <p className="text-caption text-muted-foreground truncate max-w-56">{w.empresa_nombre || '—'}</p>
                                        </td>
                                        <td className="hidden xl:table-cell text-section text-brand-dark truncate max-w-40">{w.cargo_nombre || '—'}</td>
                                        <td className="text-section tabular-nums text-brand-dark whitespace-nowrap">{formatFecha(w.fecha_ingreso) || '—'}</td>
                                        <td><DocsBar pct={w.docs_porcentaje} /></td>
                                        <td><div className="flex justify-end">{acciones(w)}</div></td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>

                    {/* Móvil: tarjetas */}
                    <div className="md:hidden p-2 flex flex-col gap-2">
                        {workers.map(w => {
                            const sel = selected.has(w.id);
                            return (
                                <div key={w.id} onClick={() => onOpen(w.id)}
                                    className={cn('rounded-2xl border bg-card p-3 shadow-sm', sel ? 'border-brand-primary bg-brand-primary/5' : 'border-border', !w.activo && 'opacity-80')}>
                                    <div className="flex items-start gap-3">
                                        {casilla(sel, () => onToggle(w.id), `Seleccionar ${w.apellido_paterno} ${w.nombres}`)}
                                        <div className="min-w-0 flex-1">
                                            <p className="text-ui font-bold text-brand-dark leading-tight">{w.apellido_paterno} {w.apellido_materno} {w.nombres}</p>
                                            <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-caption text-muted-foreground tabular-nums">{w.rut}{estado(w)}</p>
                                            <p className="mt-1.5 flex items-center gap-1.5 text-caption text-brand-dark"><Building2 className="h-3 w-3 text-muted-foreground shrink-0" /><span className="truncate">{w.obra_nombre || 'Sin obra'} · {w.empresa_nombre || '—'}</span></p>
                                            <p className="mt-0.5 flex items-center gap-1.5 text-caption text-muted-foreground"><CalendarPlus className="h-3 w-3 shrink-0" />Ingreso {formatFecha(w.fecha_ingreso) || '—'}</p>
                                            <div className="mt-2"><DocsBar pct={w.docs_porcentaje} compact /></div>
                                        </div>
                                    </div>
                                    <div className="mt-2 flex justify-end border-t border-border/60 pt-1.5">{acciones(w)}</div>
                                </div>
                            );
                        })}
                    </div>
                </>)}
            </div>
        </div>
    );
};
