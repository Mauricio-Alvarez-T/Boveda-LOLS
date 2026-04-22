import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { Save, Undo2, Search, Loader2, AlertTriangle } from 'lucide-react';
import { cn } from '../../utils/cn';
import { useInventarioMaestro } from '../../hooks/inventario/useInventarioMaestro';
import type { ItemInventario } from '../../types/entities';

interface Props {
    hasEditPermission: boolean;
}

// Campos editables del grid y su tipo de input
type EditableField =
    | 'descripcion'
    | 'categoria_id'
    | 'unidad'
    | 'valor_compra'
    | 'valor_arriendo'
    | 'es_consumible'
    | 'propietario'
    | 'activo';

type DirtyMap = Record<number, Partial<Pick<ItemInventario, EditableField>>>;

const PROPIETARIOS: Array<ItemInventario['propietario']> = ['lols', 'dedalius'];

const fmtCLP = (v: number | null | undefined) =>
    v == null ? '—' : v.toLocaleString('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });

/**
 * Grid editable de ítems de inventario — Ola 3.
 *
 * Patrón: se cargan todos los ítems en memoria; cada cambio se registra en
 * `dirty[id] = { campo: valorNuevo }`. El botón "Guardar cambios (N)" envía
 * un único bulk. Ctrl+S dispara el guardar. "Revertir" descarta el buffer.
 * Solo visible con `inventario.editar`.
 */
const InventarioMaestroGrid: React.FC<Props> = ({ hasEditPermission }) => {
    const { items, categorias, loading, saving, fetchAll, bulkUpdate } = useInventarioMaestro();
    const [dirty, setDirty] = useState<DirtyMap>({});
    const [search, setSearch] = useState('');
    const [filtroCategoria, setFiltroCategoria] = useState<number | 'todas'>('todas');
    const [soloActivos, setSoloActivos] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => { fetchAll(); }, [fetchAll]);

    const categoriaMap = useMemo(() => {
        const m: Record<number, string> = {};
        categorias.forEach(c => { m[c.id] = c.nombre; });
        return m;
    }, [categorias]);

    // Ítems filtrados (el buffer no afecta el filtrado — usamos el estado original)
    const filteredItems = useMemo(() => {
        const q = search.trim().toLowerCase();
        return items.filter(it => {
            if (filtroCategoria !== 'todas' && it.categoria_id !== filtroCategoria) return false;
            if (soloActivos && !it.activo) return false;
            if (q) {
                const hay = `${it.nro_item} ${it.descripcion} ${it.categoria_nombre || ''}`.toLowerCase();
                if (!hay.includes(q)) return false;
            }
            return true;
        });
    }, [items, search, filtroCategoria, soloActivos]);

    // Valor efectivo de un ítem: merge original + cambios del buffer
    const getVal = useCallback(<K extends EditableField>(it: ItemInventario, key: K): ItemInventario[K] => {
        const d = dirty[it.id];
        if (d && key in d) return d[key] as ItemInventario[K];
        return it[key];
    }, [dirty]);

    const isFieldDirty = (id: number, key: EditableField) =>
        !!dirty[id] && key in dirty[id];

    const dirtyCount = Object.keys(dirty).length;

    const setField = useCallback(<K extends EditableField>(it: ItemInventario, key: K, value: ItemInventario[K]) => {
        setDirty(prev => {
            const prevRow = prev[it.id] || {};
            const next = { ...prevRow, [key]: value };
            // Si el nuevo valor iguala al original, descartamos la entrada del diff
            if (String(value) === String(it[key])) {
                delete (next as any)[key];
            }
            const copy = { ...prev };
            if (Object.keys(next).length === 0) {
                delete copy[it.id];
            } else {
                copy[it.id] = next;
            }
            return copy;
        });
    }, []);

    const handleSave = useCallback(async () => {
        if (dirtyCount === 0 || saving) return;
        const payload = Object.entries(dirty).map(([id, fields]) => ({
            id: Number(id),
            ...fields,
        }));
        const res = await bulkUpdate({ items: payload });
        if (res) setDirty({});
    }, [dirty, dirtyCount, saving, bulkUpdate]);

    const handleRevert = useCallback(() => {
        if (dirtyCount === 0) return;
        if (!window.confirm(`¿Descartar ${dirtyCount} cambio(s) sin guardar?`)) return;
        setDirty({});
    }, [dirtyCount]);

    // Ctrl/Cmd + S → guardar
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

    // Advertencia al salir con cambios pendientes
    useEffect(() => {
        if (dirtyCount === 0) return;
        const onBefore = (e: BeforeUnloadEvent) => {
            e.preventDefault();
            e.returnValue = '';
        };
        window.addEventListener('beforeunload', onBefore);
        return () => window.removeEventListener('beforeunload', onBefore);
    }, [dirtyCount]);

    if (!hasEditPermission) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                <AlertTriangle className="h-10 w-10 text-muted-foreground/30 mb-3" />
                <p className="text-sm font-medium text-muted-foreground">Sin permiso</p>
                <p className="text-xs text-muted-foreground/70 mt-1">
                    Necesitas el permiso <code className="font-mono">inventario.editar</code> para usar el editor maestro.
                </p>
            </div>
        );
    }

    return (
        <div className="flex flex-col flex-1 min-h-0 gap-3" ref={containerRef}>
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-2 shrink-0">
                <div className="relative">
                    <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                        type="text"
                        placeholder="Buscar por descripción, nº item..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="pl-8 pr-3 py-1.5 text-xs border border-[#E8E8ED] rounded-lg w-64 focus:ring-2 focus:ring-brand-primary/20 outline-none"
                    />
                </div>
                <select
                    value={filtroCategoria}
                    onChange={e => setFiltroCategoria(e.target.value === 'todas' ? 'todas' : Number(e.target.value))}
                    className="px-2 py-1.5 text-xs border border-[#E8E8ED] rounded-lg bg-white focus:ring-2 focus:ring-brand-primary/20 outline-none"
                >
                    <option value="todas">Todas las categorías</option>
                    {categorias.map(c => (
                        <option key={c.id} value={c.id}>{c.nombre}</option>
                    ))}
                </select>
                <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground cursor-pointer">
                    <input type="checkbox" checked={soloActivos} onChange={e => setSoloActivos(e.target.checked)} />
                    Solo activos
                </label>
                <span className="text-[11px] text-muted-foreground ml-auto">
                    {filteredItems.length} de {items.length} ítems
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
                            Guardar cambios ({dirtyCount})
                        </button>
                    </>
                )}
            </div>

            {/* Grid */}
            <div className="flex-1 min-h-0 overflow-auto border border-[#E8E8ED] rounded-xl bg-white">
                {loading ? (
                    <div className="flex items-center justify-center py-12 text-muted-foreground text-sm gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" /> Cargando ítems...
                    </div>
                ) : filteredItems.length === 0 ? (
                    <div className="py-12 text-center text-xs text-muted-foreground">Sin ítems que coincidan con los filtros.</div>
                ) : (
                    <table className="w-full text-[11px] border-collapse">
                        <thead className="bg-[#F5F7FA] sticky top-0 z-10">
                            <tr>
                                <th className="text-left px-2 py-2 font-bold text-brand-dark w-12">Nº</th>
                                <th className="text-left px-2 py-2 font-bold text-brand-dark min-w-[220px]">Descripción</th>
                                <th className="text-left px-2 py-2 font-bold text-brand-dark w-32">Categoría</th>
                                <th className="text-left px-2 py-2 font-bold text-brand-dark w-16">Unidad</th>
                                <th className="text-right px-2 py-2 font-bold text-brand-dark w-28">V. Compra</th>
                                <th className="text-right px-2 py-2 font-bold text-brand-dark w-28">V. Arriendo</th>
                                <th className="text-center px-2 py-2 font-bold text-brand-dark w-16">Consum.</th>
                                <th className="text-left px-2 py-2 font-bold text-brand-dark w-24">Propiet.</th>
                                <th className="text-center px-2 py-2 font-bold text-brand-dark w-16">Activo</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredItems.map((it, idx) => {
                                const rowDirty = !!dirty[it.id];
                                return (
                                    <tr
                                        key={it.id}
                                        className={cn(
                                            "border-t border-[#F0F0F5]",
                                            rowDirty ? "bg-amber-50/50" : idx % 2 === 0 ? "bg-white" : "bg-[#FAFAFA]",
                                        )}
                                    >
                                        <td className="px-2 py-1 font-mono text-muted-foreground">{it.nro_item}</td>
                                        <td className={cn("px-1 py-0.5", isFieldDirty(it.id, 'descripcion') && "ring-1 ring-amber-300 rounded")}>
                                            <input
                                                type="text"
                                                value={String(getVal(it, 'descripcion'))}
                                                onChange={e => setField(it, 'descripcion', e.target.value)}
                                                className="w-full px-1.5 py-1 text-[11px] bg-transparent border-0 focus:bg-white focus:ring-1 focus:ring-brand-primary/40 rounded outline-none"
                                            />
                                        </td>
                                        <td className={cn("px-1 py-0.5", isFieldDirty(it.id, 'categoria_id') && "ring-1 ring-amber-300 rounded")}>
                                            <select
                                                value={getVal(it, 'categoria_id')}
                                                onChange={e => setField(it, 'categoria_id', Number(e.target.value))}
                                                className="w-full px-1 py-1 text-[11px] bg-transparent border-0 focus:bg-white focus:ring-1 focus:ring-brand-primary/40 rounded outline-none"
                                            >
                                                {categorias.map(c => (
                                                    <option key={c.id} value={c.id}>{c.nombre}</option>
                                                ))}
                                                {/* Fallback por si la categoría no está en la lista cargada */}
                                                {!categoriaMap[getVal(it, 'categoria_id')] && (
                                                    <option value={getVal(it, 'categoria_id')}>#{getVal(it, 'categoria_id')}</option>
                                                )}
                                            </select>
                                        </td>
                                        <td className={cn("px-1 py-0.5", isFieldDirty(it.id, 'unidad') && "ring-1 ring-amber-300 rounded")}>
                                            <input
                                                type="text"
                                                value={String(getVal(it, 'unidad') ?? '')}
                                                onChange={e => setField(it, 'unidad', e.target.value)}
                                                className="w-full px-1.5 py-1 text-[11px] bg-transparent border-0 focus:bg-white focus:ring-1 focus:ring-brand-primary/40 rounded outline-none"
                                            />
                                        </td>
                                        <td className={cn("px-1 py-0.5", isFieldDirty(it.id, 'valor_compra') && "ring-1 ring-amber-300 rounded")}>
                                            <input
                                                type="number"
                                                value={Number(getVal(it, 'valor_compra') ?? 0)}
                                                onChange={e => setField(it, 'valor_compra', Number(e.target.value))}
                                                className="w-full px-1.5 py-1 text-[11px] text-right bg-transparent border-0 focus:bg-white focus:ring-1 focus:ring-brand-primary/40 rounded outline-none"
                                                title={fmtCLP(Number(getVal(it, 'valor_compra')))}
                                            />
                                        </td>
                                        <td className={cn("px-1 py-0.5", isFieldDirty(it.id, 'valor_arriendo') && "ring-1 ring-amber-300 rounded")}>
                                            <input
                                                type="number"
                                                value={Number(getVal(it, 'valor_arriendo') ?? 0)}
                                                onChange={e => setField(it, 'valor_arriendo', Number(e.target.value))}
                                                className="w-full px-1.5 py-1 text-[11px] text-right bg-transparent border-0 focus:bg-white focus:ring-1 focus:ring-brand-primary/40 rounded outline-none"
                                                title={fmtCLP(Number(getVal(it, 'valor_arriendo')))}
                                            />
                                        </td>
                                        <td className={cn("px-1 py-1 text-center", isFieldDirty(it.id, 'es_consumible') && "bg-amber-100/60")}>
                                            <input
                                                type="checkbox"
                                                checked={!!getVal(it, 'es_consumible')}
                                                onChange={e => setField(it, 'es_consumible', e.target.checked)}
                                            />
                                        </td>
                                        <td className={cn("px-1 py-0.5", isFieldDirty(it.id, 'propietario') && "ring-1 ring-amber-300 rounded")}>
                                            <select
                                                value={getVal(it, 'propietario')}
                                                onChange={e => setField(it, 'propietario', e.target.value as ItemInventario['propietario'])}
                                                className="w-full px-1 py-1 text-[11px] bg-transparent border-0 focus:bg-white focus:ring-1 focus:ring-brand-primary/40 rounded outline-none"
                                            >
                                                {PROPIETARIOS.map(p => <option key={p} value={p}>{p}</option>)}
                                            </select>
                                        </td>
                                        <td className={cn("px-1 py-1 text-center", isFieldDirty(it.id, 'activo') && "bg-amber-100/60")}>
                                            <input
                                                type="checkbox"
                                                checked={!!getVal(it, 'activo')}
                                                onChange={e => setField(it, 'activo', e.target.checked)}
                                            />
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
                    Hay {dirtyCount} fila(s) con cambios sin guardar. <kbd className="px-1 py-0.5 bg-amber-100 border border-amber-300 rounded text-[10px]">Ctrl/⌘+S</kbd> para guardar todo.
                </p>
            )}
        </div>
    );
};

export default InventarioMaestroGrid;
