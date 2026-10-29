import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useAparecer } from '../../hooks/useAparecer';
import { Cargando, Skeleton } from '../ui/Skeleton';
import { FilasTablaSilueta } from './siluetas';
import { Save, Undo2, Search, MapPin, AlertTriangle } from 'lucide-react';
import { cn } from '../../utils/cn';
import { useStockMaestro, type StockRow, type UbicacionRef } from '../../hooks/inventario/useStockMaestro';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { formatBodegaConResponsable } from '../../utils/formatBodega';
import { Button } from '../ui/Button';

interface Bodega { id: number; nombre: string; responsable_nombre?: string | null }
interface Obra { id: number; nombre: string }

interface Props {
    obras: Obra[];
    bodegas: Bodega[];
    hasEditPermission: boolean;
}

interface DirtyValue {
    cantidad?: number;
    valor_arriendo_override?: number | null;
}
type DirtyMap = Record<number, DirtyValue>; // por item_id

// Encabezado verde de la tabla (computador): lo usan la tabla y su silueta de carga.
const ENCABEZADO_TABLA = (
    <thead className="bg-brand-primary sticky top-0 z-10">
        <tr>
            <th className="text-left px-2 py-2 font-bold text-white w-12">Nº</th>
            <th className="text-left px-2 py-2 font-bold text-white min-w-[240px]">Descripción</th>
            <th className="text-left px-2 py-2 font-bold text-white w-28">Categoría</th>
            <th className="text-left px-2 py-2 font-bold text-white w-16">Unidad</th>
            <th className="text-right px-2 py-2 font-bold text-white w-24">Actual</th>
            <th className="text-right px-2 py-2 font-bold text-white w-28">Nueva cant.</th>
            <th className="text-right px-2 py-2 font-bold text-white w-24">Δ</th>
        </tr>
    </thead>
);

/**
 * Editor masivo de stock por ubicación — Ola 3.
 *
 * Flujo:
 *  1. Usuario elige una bodega o una obra.
 *  2. Se carga la lista plana de ítems con su cantidad actual.
 *  3. Edita cantidades en línea; el buffer marca filas dirty.
 *  4. "Guardar cambios (N)" envía un único PUT /inventario/stock/bulk.
 *
 * Cambiar de ubicación con cambios pendientes pide confirmación.
 */
const StockMaestroGrid: React.FC<Props> = ({ obras, bodegas, hasEditPermission }) => {
    const { rows, loading, saving, fetchByUbicacion, bulkAdjust } = useStockMaestro();
    // Fundido de datos solo si antes se vio el contorno (hooks/useAparecer).
    const aparece = useAparecer(loading);
    const [ubi, setUbi] = useState<UbicacionRef | null>(null);
    const [dirty, setDirty] = useState<DirtyMap>({});
    const [search, setSearch] = useState('');
    // En el teléfono, tarjetas: la tabla de 7 columnas dejaba «Nueva cant.» (lo que se edita) fuera de la vista.
    // Tabla O tarjetas, nunca las dos (diseno.md §8.3).
    const esDesktop = useMediaQuery('(min-width: 768px)');

    useEffect(() => {
        fetchByUbicacion(ubi);
        setDirty({});
    }, [ubi, fetchByUbicacion]);

    const ubiOptions = useMemo(() => {
        return [
            ...bodegas.map(b => ({ key: `bodega_${b.id}`, label: `🏭 ${formatBodegaConResponsable(b)}`, ref: { type: 'bodega' as const, id: b.id } })),
            ...obras.map(o => ({ key: `obra_${o.id}`, label: `🏗 ${o.nombre}`, ref: { type: 'obra' as const, id: o.id } })),
        ];
    }, [obras, bodegas]);

    const ubiKey = ubi ? `${ubi.type}_${ubi.id}` : '';

    const handleChangeUbi = (key: string) => {
        if (Object.keys(dirty).length > 0) {
            if (!window.confirm(`Hay ${Object.keys(dirty).length} cambio(s) sin guardar. ¿Descartarlos?`)) return;
        }
        const opt = ubiOptions.find(o => o.key === key);
        setUbi(opt ? opt.ref : null);
    };

    const filteredRows = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return rows;
        return rows.filter(r => `${r.nro_item} ${r.descripcion} ${r.categoria_nombre}`.toLowerCase().includes(q));
    }, [rows, search]);

    const getCantidad = (r: StockRow) => dirty[r.id]?.cantidad ?? r.cantidad;
    const isDirty = (r: StockRow) => dirty[r.id] !== undefined;

    const setCantidad = useCallback((r: StockRow, value: number) => {
        setDirty(prev => {
            const copy = { ...prev };
            const v = Math.max(0, Number.isFinite(value) ? value : 0);
            if (v === r.cantidad) {
                delete copy[r.id];
            } else {
                copy[r.id] = { ...copy[r.id], cantidad: v };
            }
            return copy;
        });
    }, []);

    const dirtyCount = Object.keys(dirty).length;

    const handleSave = useCallback(async () => {
        if (!ubi || dirtyCount === 0 || saving) return;
        const adjustments = Object.entries(dirty).map(([itemId, fields]) => ({
            item_id: Number(itemId),
            ...(ubi.type === 'obra' ? { obra_id: ubi.id } : { bodega_id: ubi.id }),
            ...fields,
        }));
        const ok = await bulkAdjust({ adjustments });
        if (ok) {
            setDirty({});
            await fetchByUbicacion(ubi);
        }
    }, [ubi, dirty, dirtyCount, saving, bulkAdjust, fetchByUbicacion]);

    const handleRevert = () => {
        if (dirtyCount === 0) return;
        if (!window.confirm(`¿Descartar ${dirtyCount} cambio(s)?`)) return;
        setDirty({});
    };

    // Ctrl/Cmd+S
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
                e.preventDefault();
                handleSave();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [handleSave]);

    // beforeunload
    useEffect(() => {
        if (dirtyCount === 0) return;
        const onBefore = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
        window.addEventListener('beforeunload', onBefore);
        return () => window.removeEventListener('beforeunload', onBefore);
    }, [dirtyCount]);

    if (!hasEditPermission) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                <AlertTriangle className="h-10 w-10 text-muted-foreground/30 mb-3" />
                <p className="text-sm font-medium text-muted-foreground">Sin permiso</p>
                <p className="text-xs text-muted-foreground/70 mt-1">
                    Necesitas <code className="font-mono">inventario.editar</code> para ajustar stock.
                </p>
            </div>
        );
    }

    return (
        <div className="flex flex-col flex-1 min-h-0 gap-3">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-2 shrink-0">
                <div className="flex items-center gap-1.5 w-full md:w-auto">
                    <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                    <select
                        value={ubiKey}
                        onChange={e => handleChangeUbi(e.target.value)}
                        className="flex-1 md:flex-none min-w-0 px-2 py-1.5 text-xs border border-border rounded-lg bg-card focus:ring-2 focus:ring-brand-primary/20 outline-none"
                    >
                        <option value="">— Elige ubicación —</option>
                        {ubiOptions.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
                    </select>
                </div>
                {ubi && (
                    <div className="relative w-full md:w-auto">
                        <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <input
                            type="text"
                            placeholder="Buscar ítem..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="pl-8 pr-3 py-1.5 text-xs border border-border rounded-lg w-full md:w-64 focus:ring-2 focus:ring-brand-primary/20 outline-none"
                        />
                    </div>
                )}
                {ubi && loading ? <Skeleton className="ml-auto h-3 w-20" /> : (
                    <span className="text-label text-muted-foreground ml-auto">
                        {ubi ? `${filteredRows.length} de ${rows.length} ítems` : 'Selecciona una ubicación'}
                    </span>
                )}
                {dirtyCount > 0 && (
                    <>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleRevert}
                            disabled={saving}
                            leftIcon={<Undo2 className="h-3 w-3" />}
                        >
                            Revertir
                        </Button>
                        <Button
                            variant="primary"
                            size="sm"
                            onClick={handleSave}
                            disabled={saving}
                            isLoading={saving}
                            leftIcon={<Save className="h-3 w-3" />}
                            title="Ctrl+S / ⌘S"
                        >
                            Guardar ajustes ({dirtyCount})
                        </Button>
                    </>
                )}
            </div>

            {/* Grid */}
            <div className={cn('flex-1 min-h-0 overflow-auto border border-border rounded-xl bg-card', aparece)}>
                {!ubi ? (
                    <div className="py-12 text-center text-xs text-muted-foreground">
                        Elige una bodega u obra en el selector superior para ajustar su stock.
                    </div>
                ) : loading && !esDesktop ? (
                    // Silueta de las tarjetas del teléfono: nombre y categoría; «Actual · Nueva cant. · Δ» con sus rótulos.
                    <Cargando que="el stock">
                        <ul className="divide-y divide-border" aria-hidden="true">
                            {[0, 1, 2, 3, 4, 5].map(i => (
                                <li key={i} className="px-3 py-3">
                                    <Skeleton className={cn('h-4', i % 2 ? 'w-1/2' : 'w-3/4')} />
                                    <Skeleton className="mt-1.5 h-3 w-1/3" />
                                    <div className="mt-2 flex items-end gap-3">
                                        <div className="w-14 shrink-0">
                                            <span className="block text-micro font-semibold uppercase tracking-wide text-muted-foreground">Actual</span>
                                            <Skeleton className="my-2.5 h-5 w-8" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <span className="block text-micro font-semibold uppercase tracking-wide text-muted-foreground">Nueva cant.</span>
                                            <Skeleton className="mt-0.5 h-10 w-full rounded-lg" />
                                        </div>
                                        <div className="w-14 shrink-0 text-right">
                                            <span className="block text-micro font-semibold uppercase tracking-wide text-muted-foreground">Δ</span>
                                            <Skeleton className="my-2.5 ml-auto h-5 w-6" />
                                        </div>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </Cargando>
                ) : loading ? (
                    // Silueta de la tabla: el encabezado verde de verdad y filas en gris.
                    <Cargando que="el stock">
                        <table className="w-full text-label border-collapse" aria-hidden="true">
                            {ENCABEZADO_TABLA}
                            <FilasTablaSilueta anchos={['w-6', 'texto', 'w-20', 'w-6', 'w-8 ml-auto', 'w-12 ml-auto', 'w-6 ml-auto']} />
                        </table>
                    </Cargando>
                ) : filteredRows.length === 0 ? (
                    <div className="py-12 text-center text-xs text-muted-foreground">Sin ítems que coincidan.</div>
                ) : !esDesktop ? (
                    <ul className="divide-y divide-border">
                        {filteredRows.map(r => {
                            const rowDirty = isDirty(r);
                            const nueva = getCantidad(r);
                            const delta = nueva - r.cantidad;
                            return (
                                <li key={r.id} className={cn('px-3 py-3', rowDirty && 'bg-amber-50/50 dark:bg-amber-950/30')}>
                                    <p className="text-sm font-medium text-brand-dark break-words">
                                        <span className="font-mono text-muted-foreground mr-1.5">{r.nro_item}</span>
                                        {r.descripcion}
                                    </p>
                                    <p className="text-caption text-muted-foreground break-words">{r.categoria_nombre} · {r.unidad}</p>
                                    <div className="mt-2 flex items-end gap-3">
                                        <div className="w-14 shrink-0">
                                            <span className="block text-micro font-semibold uppercase tracking-wide text-muted-foreground">Actual</span>
                                            <span className="block py-2 font-mono text-base text-muted-foreground">{r.cantidad}</span>
                                        </div>
                                        <label className="flex-1 min-w-0">
                                            <span className="block text-micro font-semibold uppercase tracking-wide text-muted-foreground">Nueva cant.</span>
                                            {/* text-base (16 px): con menos, iOS hace zoom al enfocar el campo. */}
                                            <input
                                                type="number"
                                                inputMode="numeric"
                                                min={0}
                                                value={nueva}
                                                onChange={e => setCantidad(r, Number(e.target.value))}
                                                aria-label={`Nueva cantidad de ${r.descripcion}`}
                                                className={cn(
                                                    'mt-0.5 h-10 w-full px-3 text-base text-right font-bold bg-card border rounded-lg outline-none focus:ring-2 focus:ring-brand-primary/40',
                                                    rowDirty ? 'border-amber-300 dark:border-amber-500/40' : 'border-border'
                                                )}
                                            />
                                        </label>
                                        <div className="w-14 shrink-0 text-right">
                                            <span className="block text-micro font-semibold uppercase tracking-wide text-muted-foreground">Δ</span>
                                            <span className={cn(
                                                'block py-2 font-mono text-base font-bold',
                                                delta > 0 ? 'text-green-700 dark:text-green-300' : delta < 0 ? 'text-red-700 dark:text-red-300' : 'text-muted-foreground/50'
                                            )}>
                                                {rowDirty ? (delta > 0 ? `+${delta}` : delta) : '—'}
                                            </span>
                                        </div>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                ) : (
                    <table className="w-full text-label border-collapse">
                        {ENCABEZADO_TABLA}
                        <tbody>
                            {filteredRows.map((r, idx) => {
                                const rowDirty = isDirty(r);
                                const nueva = getCantidad(r);
                                const delta = nueva - r.cantidad;
                                return (
                                    <tr
                                        key={r.id}
                                        className={cn(
                                            "border-t border-border",
                                            rowDirty ? "bg-amber-50/50 dark:bg-amber-950/30" : idx % 2 === 0 ? "bg-card" : "bg-muted",
                                        )}
                                    >
                                        <td className="px-2 py-1 font-mono text-muted-foreground">{r.nro_item}</td>
                                        <td className="px-2 py-1 font-medium text-brand-dark">{r.descripcion}</td>
                                        <td className="px-2 py-1 text-muted-foreground">{r.categoria_nombre}</td>
                                        <td className="px-2 py-1 text-muted-foreground">{r.unidad}</td>
                                        <td className="px-2 py-1 text-right font-mono text-muted-foreground">{r.cantidad}</td>
                                        <td className={cn("px-1 py-0.5", rowDirty && "ring-1 ring-amber-300 dark:ring-amber-500/40 rounded")}>
                                            <input
                                                type="number"
                                                min={0}
                                                value={nueva}
                                                onChange={e => setCantidad(r, Number(e.target.value))}
                                                className="w-full px-1.5 py-1 text-label text-right bg-transparent border-0 focus:bg-card focus:ring-1 focus:ring-brand-primary/40 rounded outline-none font-bold"
                                            />
                                        </td>
                                        <td className={cn(
                                            "px-2 py-1 text-right font-mono font-bold",
                                            delta > 0 ? "text-green-700 dark:text-green-300" : delta < 0 ? "text-red-700 dark:text-red-300" : "text-muted-foreground/50"
                                        )}>
                                            {rowDirty ? (delta > 0 ? `+${delta}` : delta) : '—'}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            {dirtyCount > 0 && (
                <p className="text-caption text-amber-700 dark:text-amber-400 shrink-0">
                    {dirtyCount} fila(s) con cambios sin guardar. <kbd className="px-1 py-0.5 bg-amber-100 border border-amber-300 dark:bg-amber-500/15 dark:border-amber-700 rounded text-caption">Ctrl/⌘+S</kbd> para guardar.
                </p>
            )}
        </div>
    );
};

export default StockMaestroGrid;
