import React, { useState, useEffect, useMemo } from 'react';
import { Droplets, Building2, Truck, DollarSign, Calendar, MapPin, ChevronDown, Search, X } from 'lucide-react';
import api from '../../services/api';
import type { RegistroBombaHormigon } from '../../types/entities';
import { cn } from '../../utils/cn';

interface Props {
    obras: { id: number; nombre: string }[];
    canCreate: boolean;
}

const fmtMoney = (n: number) => `$${Number(n).toLocaleString('es-CL')}`;
const fmtDate = (d: string) => new Date(d).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' });
const fmtDateShort = (d: string) => new Date(d).toLocaleDateString('es-CL', { day: '2-digit', month: 'short' });

const BombasHormigonTab: React.FC<Props> = ({ obras, canCreate }) => {
    const [registros, setRegistros] = useState<RegistroBombaHormigon[]>([]);
    const [loading, setLoading] = useState(false);
    const [filterObraId, setFilterObraId] = useState<number | ''>('');
    const [searchQuery, setSearchQuery] = useState('');

    const fetchData = async () => {
        setLoading(true);
        try {
            const params = filterObraId ? `?obra_id=${filterObraId}` : '';
            const res = await api.get(`/bombas-hormigon${params}`);
            setRegistros(res.data.data || []);
        } catch { setRegistros([]); }
        finally { setLoading(false); }
    };

    useEffect(() => { fetchData(); }, [filterObraId]);

    // Filter by search
    const filtered = useMemo(() => {
        if (!searchQuery) return registros;
        const q = searchQuery.toLowerCase();
        return registros.filter(r =>
            (r.obra_nombre || '').toLowerCase().includes(q) ||
            (r.tipo_bomba || '').toLowerCase().includes(q) ||
            (r.proveedor || '').toLowerCase().includes(q)
        );
    }, [registros, searchQuery]);

    // Stats
    const stats = useMemo(() => {
        const total = filtered.length;
        const externas = filtered.filter(r => r.es_externa).length;
        const propias = total - externas;
        const costoTotal = filtered.reduce((sum, r) => sum + (Number(r.costo) || 0), 0);
        return { total, externas, propias, costoTotal };
    }, [filtered]);

    // Group by month
    const grouped = useMemo(() => {
        const groups: Record<string, RegistroBombaHormigon[]> = {};
        for (const r of filtered) {
            const d = new Date(r.fecha);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            const label = d.toLocaleDateString('es-CL', { month: 'long', year: 'numeric' });
            if (!groups[key]) groups[key] = [];
            groups[key].push(r);
        }
        // Sort keys descending
        const sorted = Object.entries(groups).sort(([a], [b]) => b.localeCompare(a));
        return sorted.map(([key, items]) => {
            const d = new Date(items[0].fecha);
            const label = d.toLocaleDateString('es-CL', { month: 'long', year: 'numeric' });
            return { key, label: label.charAt(0).toUpperCase() + label.slice(1), items };
        });
    }, [filtered]);

    return (
        <div className="flex flex-col flex-1 min-h-0">
            {/* Header + filters */}
            <div className="shrink-0 space-y-3 mb-4">
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                    <h3 className="text-sm font-bold text-brand-dark">Bombas de Hormigón</h3>
                    <div className="flex items-center gap-2 flex-1">
                        {/* Search */}
                        <div className="relative flex-1 max-w-xs">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                placeholder="Buscar obra, tipo, proveedor..."
                                className="w-full pl-8 pr-8 py-2 text-xs border border-[#E8E8ED] rounded-xl bg-white focus:ring-2 focus:ring-brand-primary/20 outline-none transition-all"
                            />
                            {searchQuery && (
                                <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 hover:bg-muted rounded">
                                    <X className="h-3 w-3 text-muted-foreground" />
                                </button>
                            )}
                        </div>
                        {/* Obra filter */}
                        <div className="relative">
                            <select
                                value={filterObraId}
                                onChange={e => setFilterObraId(e.target.value ? Number(e.target.value) : '')}
                                className="appearance-none pl-3 pr-8 py-2 text-xs border border-[#E8E8ED] rounded-xl bg-white focus:ring-2 focus:ring-brand-primary/20 outline-none cursor-pointer"
                            >
                                <option value="">Todas las obras</option>
                                {obras.map(o => <option key={o.id} value={o.id}>{o.nombre}</option>)}
                            </select>
                            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
                        </div>
                    </div>
                </div>

                {/* Stats cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <StatCard
                        icon={Droplets}
                        label="Total Bombeos"
                        value={String(stats.total)}
                        color="bg-blue-50 text-blue-600"
                    />
                    <StatCard
                        icon={Building2}
                        label="Empresa"
                        value={String(stats.propias)}
                        color="bg-emerald-50 text-emerald-600"
                    />
                    <StatCard
                        icon={Truck}
                        label="Arriendo Ext."
                        value={String(stats.externas)}
                        color="bg-amber-50 text-amber-600"
                    />
                    <StatCard
                        icon={DollarSign}
                        label="Costo Total"
                        value={stats.costoTotal > 0 ? fmtMoney(stats.costoTotal) : '—'}
                        color="bg-violet-50 text-violet-600"
                    />
                </div>
            </div>

            {/* List */}
            <div className="flex-1 min-h-0 overflow-y-auto">
                {loading ? (
                    <div className="py-12 text-center text-muted-foreground text-xs">Cargando...</div>
                ) : filtered.length === 0 ? (
                    <div className="py-16 text-center text-muted-foreground">
                        <Droplets className="h-10 w-10 mx-auto opacity-20 mb-3" />
                        <p className="text-sm font-medium">Sin registros de bombas</p>
                        <p className="text-xs mt-1 text-muted-foreground/60">
                            {searchQuery ? 'No hay resultados para la búsqueda' : 'No se han registrado bombeos aún'}
                        </p>
                    </div>
                ) : (
                    <div className="space-y-5">
                        {grouped.map(group => (
                            <div key={group.key}>
                                {/* Month header */}
                                <div className="flex items-center gap-2 mb-2 px-1">
                                    <Calendar className="h-3 w-3 text-muted-foreground/50" />
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
                                        {group.label}
                                    </span>
                                    <span className="text-[10px] text-muted-foreground/40">
                                        ({group.items.length})
                                    </span>
                                    <div className="flex-1 border-t border-[#E8E8ED]/60" />
                                </div>

                                {/* Cards grid */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                    {group.items.map(r => (
                                        <BombaCard key={r.id} registro={r} />
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

/* ─── Stat card ─── */
const StatCard: React.FC<{ icon: React.ElementType; label: string; value: string; color: string }> = ({ icon: Icon, label, value, color }) => (
    <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-[#E8E8ED] bg-white">
        <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", color)}>
            <Icon className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0">
            <p className="text-[10px] text-muted-foreground leading-tight">{label}</p>
            <p className="text-sm font-bold text-brand-dark leading-tight truncate">{value}</p>
        </div>
    </div>
);

/* ─── Bomba card ─── */
const BombaCard: React.FC<{ registro: RegistroBombaHormigon }> = ({ registro: r }) => {
    const isExterna = r.es_externa;

    return (
        <div className={cn(
            "flex flex-col px-3.5 py-3 rounded-xl border transition-colors",
            isExterna
                ? "border-amber-200/70 bg-amber-50/30 hover:border-amber-300"
                : "border-[#E8E8ED] bg-white hover:border-brand-primary/20"
        )}>
            {/* Top row: obra + badge */}
            <div className="flex items-start justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-1.5 min-w-0">
                    <MapPin className="h-3 w-3 text-muted-foreground/50 shrink-0" />
                    <span className="text-[11px] font-bold text-brand-dark truncate">{r.obra_nombre}</span>
                </div>
                <span className={cn(
                    "text-[9px] font-bold px-2 py-0.5 rounded-full border shrink-0 whitespace-nowrap",
                    isExterna
                        ? "bg-amber-100 text-amber-700 border-amber-200"
                        : "bg-emerald-100 text-emerald-700 border-emerald-200"
                )}>
                    {isExterna ? 'ARRIENDO' : 'EMPRESA'}
                </span>
            </div>

            {/* Type + date row */}
            <div className="flex items-center gap-1.5 mb-1">
                <Droplets className="h-3 w-3 text-blue-400 shrink-0" />
                <span className="text-xs text-brand-dark/80 font-medium">{r.tipo_bomba}</span>
                <span className="text-[10px] text-muted-foreground/50 mx-0.5">&middot;</span>
                <span className="text-[10px] text-muted-foreground">{fmtDateShort(r.fecha)}</span>
            </div>

            {/* Bottom row: proveedor + costo */}
            {(r.proveedor || r.costo) && (
                <div className="flex items-center justify-between gap-2 mt-0.5 pt-1.5 border-t border-[#E8E8ED]/50">
                    {r.proveedor && (
                        <span className="text-[10px] text-muted-foreground truncate">{r.proveedor}</span>
                    )}
                    {r.costo && (
                        <span className="text-[11px] font-bold text-brand-dark shrink-0">{fmtMoney(Number(r.costo))}</span>
                    )}
                </div>
            )}
        </div>
    );
};

export default BombasHormigonTab;
