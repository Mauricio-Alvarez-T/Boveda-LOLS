import React from 'react';
import { AlertTriangle, ArrowRight, PackageX, Search, X, MapPin, Warehouse } from 'lucide-react';
import { cn } from '../../utils/cn';
import { IconButton } from '../ui/IconButton';
import type { TransferenciaConDiscrepancias } from '../../types/entities';
import { formatBodegaNombreResponsable } from '../../utils/formatBodega';

interface Props {
    discrepancias: TransferenciaConDiscrepancias[];
    loading: boolean;
    selectedId: number | null;
    onSelect: (trf: TransferenciaConDiscrepancias) => void;
    subFilter: 'pendiente' | 'resuelta' | 'descartada';
    onSubFilterChange: (f: 'pendiente' | 'resuelta' | 'descartada') => void;
    searchQuery: string;
    onSearchChange: (q: string) => void;
    /** Si `true`, no renderiza su propio buscador (lo provee el panel padre arriba). */
    hideSearch?: boolean;
}

const SUB_CHIPS: { value: 'pendiente' | 'resuelta' | 'descartada'; label: string; color: string }[] = [
    { value: 'pendiente', label: 'Pendientes', color: 'bg-amber-500' },
    { value: 'resuelta', label: 'Resueltas', color: 'bg-green-500' },
    { value: 'descartada', label: 'Descartadas', color: 'bg-muted-foreground' },
];

const DiscrepanciasList: React.FC<Props> = ({
    discrepancias, loading, selectedId, onSelect,
    subFilter, onSubFilterChange, searchQuery, onSearchChange,
    hideSearch = false,
}) => {
    const filtered = discrepancias.filter(d =>
        !searchQuery || d.codigo.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="flex flex-col flex-1 min-h-0">
            {/* Search (se oculta si el panel padre ya lo renderiza arriba) */}
            {!hideSearch && (
                <div className="relative shrink-0 mb-2">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={e => onSearchChange(e.target.value)}
                        placeholder="Buscar por código TRF..."
                        className="w-full pl-8 pr-8 py-2 text-xs border border-border rounded-xl bg-card focus:ring-2 focus:ring-red-500/20 outline-none transition-all"
                    />
                    {searchQuery && (
                        <IconButton
                            onClick={() => onSearchChange('')}
                            icon={<X className="h-3 w-3" />}
                            variant="ghost"
                            size="sm"
                            aria-label="Limpiar búsqueda"
                            className="absolute right-1.5 top-1/2 -translate-y-1/2 h-7 w-7"
                        />
                    )}
                </div>
            )}

            {/* Sub-filter chips */}
            <div className="flex gap-1.5 overflow-x-auto scrollbar-none shrink-0 mb-3 pb-1">
                {SUB_CHIPS.map(chip => (
                    // eslint-disable-next-line no-restricted-syntax -- selector pill (segmented filter)
                    <button
                        key={chip.value}
                        onClick={() => onSubFilterChange(chip.value)}
                        className={cn(
                            "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-caption font-bold whitespace-nowrap border transition-all shrink-0",
                            subFilter === chip.value
                                ? "bg-red-500 text-white border-red-500 shadow-sm"
                                : "bg-card text-muted-foreground border-border hover:border-red-300 dark:hover:border-red-700"
                        )}
                    >
                        <span className={cn("h-1.5 w-1.5 rounded-full", chip.color)} />
                        {chip.label}
                    </button>
                ))}
            </div>

            {/* Card list */}
            <div className="flex-1 min-h-0 overflow-y-auto space-y-2">
                {loading ? (
                    <div className="py-8 text-center text-muted-foreground text-xs">Cargando discrepancias…</div>
                ) : filtered.length === 0 ? (
                    <div className="py-12 text-center text-muted-foreground">
                        <PackageX className="h-10 w-10 mx-auto opacity-20 mb-3" />
                        <p className="text-xs font-semibold">
                            {subFilter === 'pendiente' ? 'Sin discrepancias pendientes' :
                             subFilter === 'resuelta' ? 'No hay discrepancias resueltas' :
                             'No hay discrepancias descartadas'}
                        </p>
                        {subFilter === 'pendiente' && (
                            <p className="text-caption text-muted-foreground/70 mt-1">
                                Todo el stock recibido coincide con lo enviado.
                            </p>
                        )}
                    </div>
                ) : (
                    filtered.map(d => {
                        const origenLabel = d.origen_obra_nombre
                            || (d.origen_bodega_nombre
                                ? formatBodegaNombreResponsable(d.origen_bodega_nombre, d.origen_bodega_responsable_nombre)
                                : null)
                            || '—';
                        const destinoLabel = d.destino_obra_nombre
                            || (d.destino_bodega_nombre
                                ? formatBodegaNombreResponsable(d.destino_bodega_nombre, d.destino_bodega_responsable_nombre)
                                : null)
                            || '—';
                        const origenIsObra = !!d.origen_obra_nombre;
                        const destinoIsObra = !!d.destino_obra_nombre;
                        const isSelected = d.id === selectedId;

                        return (
                            <div
                                key={d.id}
                                onClick={() => onSelect(d)}
                                className={cn(
                                    "px-3 py-2.5 rounded-xl border transition-all cursor-pointer",
                                    isSelected
                                        ? "border-red-500 bg-red-50/60 shadow-sm dark:bg-red-950/40"
                                        : "border-border hover:border-red-300 hover:bg-red-50/30 dark:hover:border-red-700 dark:hover:bg-red-950/20"
                                )}
                            >
                                {/* Header: código + fecha */}
                                <div className="flex items-center justify-between mb-1.5">
                                    <div className="flex items-center gap-1.5">
                                        <div className="w-6 h-6 rounded-lg bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-300 flex items-center justify-center shrink-0">
                                            <AlertTriangle className="h-3 w-3" />
                                        </div>
                                        <span className="text-label font-bold text-brand-dark">{d.codigo}</span>
                                    </div>
                                    {d.fecha_recepcion && (
                                        <span className="text-micro text-muted-foreground">
                                            {new Date(d.fecha_recepcion).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: '2-digit' })}
                                        </span>
                                    )}
                                </div>

                                {/* Ruta origen → destino */}
                                <div className="flex items-center gap-1 text-caption text-muted-foreground mb-2 pl-0.5">
                                    {origenIsObra
                                        ? <MapPin className="h-2.5 w-2.5 text-blue-500 shrink-0" />
                                        : <Warehouse className="h-2.5 w-2.5 text-amber-500 shrink-0" />}
                                    <span className="truncate max-w-[45%]">{origenLabel}</span>
                                    <ArrowRight className="h-2.5 w-2.5 shrink-0" />
                                    {destinoIsObra
                                        ? <MapPin className="h-2.5 w-2.5 text-blue-500 shrink-0" />
                                        : <Warehouse className="h-2.5 w-2.5 text-amber-500 shrink-0" />}
                                    <span className="truncate max-w-[45%]">{destinoLabel}</span>
                                </div>

                                {/* Métricas */}
                                <div className="grid grid-cols-2 gap-2">
                                    <div className="min-w-0 px-2 py-1 rounded-lg bg-red-50 border border-red-100 dark:bg-red-950/40 dark:border-red-900">
                                        <p className="text-micro text-red-700 dark:text-red-300 uppercase font-bold leading-none mb-0.5">Ítems</p>
                                        <p className="text-label font-black text-red-700 dark:text-red-300 leading-none">
                                            {d.total_items_afectados}
                                        </p>
                                    </div>
                                    <div className="min-w-0 px-2 py-1 rounded-lg bg-red-50 border border-red-100 dark:bg-red-950/40 dark:border-red-900">
                                        <p className="text-micro text-red-700 dark:text-red-300 uppercase font-bold leading-none mb-0.5">Diferencia</p>
                                        <p className="text-label font-black text-red-700 dark:text-red-300 leading-none">
                                            {d.total_unidades_perdidas > 0 ? '-' : d.total_unidades_perdidas < 0 ? '+' : ''}
                                            {Math.abs(d.total_unidades_perdidas)} u.
                                        </p>
                                    </div>
                                </div>

                                {/* Receptor */}
                                {d.receptor_nombre && (
                                    <p className="text-micro text-muted-foreground mt-1.5 pl-0.5 truncate">
                                        Recibió: <span className="font-semibold text-brand-dark">{d.receptor_nombre}</span>
                                    </p>
                                )}
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
};

export default DiscrepanciasList;
