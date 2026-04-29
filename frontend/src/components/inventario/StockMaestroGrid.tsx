import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Save, Undo2, Search, Loader2, MapPin, AlertTriangle } from 'lucide-react';
import { cn } from '../../utils/cn';
import { useStockMaestro, type StockRow, type UbicacionRef } from '../../hooks/inventario/useStockMaestro';

interface Bodega { id: number; nombre: string }
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
    const [ubi, setUbi] = useState<UbicacionRef | null>(null);
    const [dirty, setDirty] = useState<DirtyMap>({});
    const [search, setSearch] = useState('');

    useEffect(() => {
        fetchByUbicacion(ubi);
        setDirty({});
    }, [ubi, fetchByUbicacion]);

    const ubiOptions = useMemo(() => {
        return [
            ...bodegas.map(b => ({ key: `bodega_${b.id}`, label: `🏭 ${b.nombre}`, ref: { type: 'bodega' as const, id: b.id } })),
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
                <div className="flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                    <select
                        value={ubiKey}
                        onChange={e => handleChangeUbi(e.target.value)}
                        className="px-2 py-1.5 text-xs border border-[#E8E8ED] rounded-lg bg-white focus:ring-2 focus:ring-brand-primary/20 outline-none"
                    >
                        <option value="">— Elige ubicación —</option>
                        {ubiOptions.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
                    </select>
                </div>
                {ubi && (
                    <div className="relative">
                        <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <input
                            type="text"
                            placeholder="Buscar ítem..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="pl-8 pr-3 py-1.5 text-xs border border-[#E8E8ED] rounded-lg w-64 focus:ring-2 focus:ring-brand-primary/20 outline-none"
                        />
                    </div>
                )}
                <span className="text-[11px] text-muted-foreground ml-auto">
                    {ubi ? `${filteredRows.length} de ${rows.length} ítems` : 'Selecciona una ubicación'}
                </span>
                {dirtyCount > 0 && (
                    <>
                        <button
                            onClick={handleRevert}
                            disabled={saving}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-muted-foreground bg-[#F0F0F5] rounded-lg hover:bg-[#E5E5EA] disabled:opacity-50 transition-all"
                        >
                            <Undo2 className="h-3 w-3" /> Revertir
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white bg-brand-primary rounded-lg hover:bg-brand-primary/90 disabled:opacity-50 transition-all shadow-sm"
                            title="Ctrl+S / ⌘S"
                        >
                            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                            Guardar ajustes ({dirtyCount})
                        </button>
                    </>
                )}
            </div>

            {/* Grid */}
            <div className="flex-1 min-h-0 overflow-auto border border-[#E8E8ED] rounded-xl bg-white">
                {!ubi ? (
                    <div className="py-12 text-center text-xs text-muted-foreground">
                        Elige una bodega u obra en el selector superior para ajustar su stock.
                    </div>
                ) : loading ? (
                    <div className="flex items-center justify-center py-12 text-muted-foreground text-sm gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" /> Cargando stock...
                    </div>
                ) : filteredRows.length === 0 ? (
                    <div className="py-12 text-center text-xs text-muted-foreground">Sin ítems que coincidan.</div>
                ) : (
                    <table className="w-full text-[11px] border-collapse">
                        <thead className="bg-[#F5F7FA] sticky top-0 z-10">
                            <tr>
                                <th className="text-left px-2 py-2 font-bold text-brand-dark w-12">Nº</th>
                                <th className="text-left px-2 py-2 font-bold text-brand-dark min-w-[240px]">Descripción</th>
                                <th className="text-left px-2 py-2 font-bold text-brand-dark w-28">Categoría</th>
                                <th className="text-left px-2 py-2 font-bold text-brand-dark w-16">Unidad</th>
                                <th className="text-right px-2 py-2 font-bold text-brand-dark w-24">Actual</th>
                                <th className="text-right px-2 py-2 font-bold text-brand-dark w-28">Nueva cant.</th>
                                <th className="text-right px-2 py-2 font-bold text-brand-dark w-24">Δ</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredRows.map((r, idx) => {
                                const rowDirty = isDirty(r);
                                const nueva = getCantidad(r);
                                const delta = nueva - r.cantidad;
                                return (
                                    <tr
                                        key={r.id}
                                        className={cn(
                                            "border-t border-[#F0F0F5]",
                                            rowDirty ? "bg-amber-50/50" : idx % 2 === 0 ? "bg-white" : "bg-[#FAFAFA]",
                                        )}
                                    >
                                        <td className="px-2 py-1 font-mono text-muted-foreground">{r.nro_item}</td>
                                        <td className="px-2 py-1 font-medium text-brand-dark">{r.descripcion}</td>
                                        <td className="px-2 py-1 text-muted-foreground">{r.categoria_nombre}</td>
                                        <td className="px-2 py-1 text-muted-foreground">{r.unidad}</td>
                                        <td className="px-2 py-1 text-right font-mono text-muted-foreground">{r.cantidad}</td>
                                        <td className={cn("px-1 py-0.5", rowDirty && "ring-1 ring-amber-300 rounded")}>
                                            <input
                                                type="number"
                                                min={0}
                                                value={nueva}
                                                onChange={e => setCantidad(r, Number(e.target.value))}
                                                className="w-full px-1.5 py-1 text-[11px] text-right bg-transparent border-0 focus:bg-white focus:ring-1 focus:ring-brand-primary/40 rounded outline-none font-bold"
                                            />
                                        </td>
                                        <td className={cn(
                                            "px-2 py-1 text-right font-mono font-bold",
                                            delta > 0 ? "text-green-600" : delta < 0 ? "text-red-600" : "text-muted-foreground/50"
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
                <p className="text-[10px] text-amber-700 shrink-0">
                    {dirtyCount} fila(s) con cambios sin guardar. <kbd className="px-1 py-0.5 bg-amber-100 border border-amber-300 rounded text-[10px]">Ctrl/⌘+S</kbd> para guardar.
                </p>
            )}
        </div>
    );
};

export default StockMaestroGrid;
