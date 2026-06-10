import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Archive, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { useSetPageHeader } from '../context/PageHeaderContext';
import { ObraFinalizadaCard } from '../components/obras/ObraFinalizadaCard';
import api from '../services/api';
import type { ObraFinalizada } from '../types/entities';

const Skeleton: React.FC = () => (
    <div className="animate-pulse rounded-2xl border border-border bg-card h-72" />
);

/**
 * Sección "Obras Finalizadas": tarjetas con los datos históricos de cada obra
 * concluida (fechas, duración, total de trabajadores y desglose por cargo).
 * Las obras se finalizan desde Configuración → Obras; acá se pueden reactivar.
 */
const ObrasFinalizadasPage: React.FC = () => {
    const { hasPermission } = useAuth();
    const canReactivar = hasPermission('obras.finalizar');

    const [obras, setObras] = useState<ObraFinalizada[]>([]);
    const [loading, setLoading] = useState(true);
    const [filtro, setFiltro] = useState('');

    const fetchObras = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get<{ data: ObraFinalizada[] }>('/obras/finalizadas');
            setObras(res.data.data || []);
        } catch {
            toast.error('Error al cargar obras finalizadas');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchObras(); }, [fetchObras]);

    const obrasFiltradas = useMemo(() => {
        const q = filtro.trim().toLowerCase();
        if (!q) return obras;
        return obras.filter(o =>
            o.nombre.toLowerCase().includes(q) ||
            (o.empresa_nombre || '').toLowerCase().includes(q)
        );
    }, [obras, filtro]);

    const headerTitle = useMemo(() => (
        <div className="flex items-center gap-3">
            <Archive className="h-6 w-6 text-brand-primary" />
            <div className="flex flex-col leading-tight">
                <h1 className="text-lg font-bold text-brand-dark">
                    Obras Finalizadas
                    <span className="ml-2 text-xs font-black bg-brand-primary/10 text-brand-primary px-2 py-0.5 rounded-md align-middle">
                        {obras.length}
                    </span>
                </h1>
                <p className="text-muted-foreground text-xs">Historial de obras concluidas</p>
            </div>
        </div>
    ), [obras.length]);

    useSetPageHeader(headerTitle);

    return (
        <div className="flex flex-col flex-1 min-h-0 gap-3">
            {/* Búsqueda */}
            <div className="relative shrink-0 max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <input
                    type="text"
                    value={filtro}
                    onChange={e => setFiltro(e.target.value)}
                    placeholder="Buscar obra o empresa..."
                    className="w-full pl-9 pr-8 py-2 text-sm border border-border rounded-xl bg-card focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary"
                />
                {filtro && (
                    <button
                        onClick={() => setFiltro('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded-md hover:bg-muted text-muted-foreground"
                        aria-label="Limpiar búsqueda"
                    >
                        <X className="h-3.5 w-3.5" />
                    </button>
                )}
            </div>

            {/* Grid de tarjetas */}
            <div className="flex-1 min-h-0 overflow-y-auto">
                {loading ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {[1, 2, 3, 4].map(i => <Skeleton key={i} />)}
                    </div>
                ) : obras.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-3 py-20">
                        <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
                            <Archive className="h-8 w-8 text-muted-foreground/40" />
                        </div>
                        <div className="text-center">
                            <p className="text-sm font-semibold text-brand-dark">Sin obras finalizadas</p>
                            <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                                Cuando concluyas una obra desde Configuración → Obras, aparecerá aquí con sus datos históricos.
                            </p>
                        </div>
                    </div>
                ) : obrasFiltradas.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-2 py-20">
                        <Search className="h-8 w-8 text-muted-foreground/40" />
                        <p className="text-sm text-muted-foreground">No se encontraron resultados para "{filtro}"</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-4">
                        {obrasFiltradas.map((obra, idx) => (
                            <ObraFinalizadaCard
                                key={obra.id}
                                obra={obra}
                                index={idx}
                                canReactivar={canReactivar}
                                onReactivada={fetchObras}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default ObrasFinalizadasPage;
