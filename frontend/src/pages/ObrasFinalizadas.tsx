import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { cn } from '../utils/cn';
import { useAparecer } from '../hooks/useAparecer';
import { Archive, Calendar, Clock, HardHat, Search, Users, X } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { useSetPageHeader } from '../context/PageHeaderContext';
import { ObraFinalizadaCard } from '../components/obras/ObraFinalizadaCard';
import { IconButton } from '../components/ui/IconButton';
import { EmptyState } from '../components/ui/EmptyState';
import { Cargando, Skeleton } from '../components/ui/Skeleton';
import { StatusBadge } from '../components/ui/StatusBadge';
import api from '../services/api';
import type { ObraFinalizada } from '../types/entities';

/** Una obra mientras llega: el sello y los rótulos fijos de verdad; nombre, fechas, cifra y barras por cargo en gris. */
const ObraSilueta: React.FC<{ conReactivar: boolean }> = ({ conReactivar }) => (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm" aria-hidden="true">
        <div className="space-y-2 border-b border-border/60 p-4 pb-3">
            <StatusBadge domain="obra" status="finalizada" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
        </div>
        <div className="flex flex-1 flex-col gap-3 p-4 pt-3">
            <div className="space-y-2">
                <div className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5 shrink-0 text-brand-primary" /><Skeleton className="h-3 w-40" /></div>
                <div className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5 shrink-0 text-brand-primary" /><Skeleton className="h-3 w-20" /></div>
            </div>
            <div className="flex items-center gap-2.5 rounded-xl border border-brand-primary/15 bg-brand-primary/5 px-3 py-2">
                <Users className="h-4 w-4 shrink-0 text-brand-primary" />
                <div className="space-y-1 leading-tight">
                    <Skeleton className="h-6 w-10" />
                    <p className="text-micro font-bold uppercase tracking-wide text-muted-foreground">Trabajadores (histórico)</p>
                </div>
            </div>
            <div className="flex-1">
                <p className="mb-1.5 flex items-center gap-1 text-micro font-black uppercase tracking-widest text-brand-dark/50">
                    <HardHat className="h-3 w-3" /> Por cargo
                </p>
                <div className="space-y-1.5">
                    {['w-4/5', 'w-1/2', 'w-1/3'].map(w => (
                        <div key={w} className="flex items-center gap-2">
                            <Skeleton className="h-2.5 w-24 shrink-0" />
                            <div className="h-2 flex-1"><Skeleton className={cn('h-2 rounded-full', w)} /></div>
                            <Skeleton className="h-2.5 w-5 shrink-0" />
                        </div>
                    ))}
                </div>
            </div>
            {conReactivar && <Skeleton className="mt-auto h-9 w-full rounded-full" />}
        </div>
    </div>
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
    // Fundido de datos solo si antes se vio el contorno (hooks/useAparecer).
    const aparece = useAparecer(loading);
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
                    {/* Mientras carga, la cifra en silueta: no un 0 que no es (§9.4). */}
                    {loading ? (
                        <span aria-hidden="true" className="silueta ml-2 inline-block h-5 w-7 rounded-md align-middle" />
                    ) : (
                        <span className="ml-2 text-xs font-black bg-brand-primary/10 text-brand-primary px-2 py-0.5 rounded-md align-middle">
                            {obras.length}
                        </span>
                    )}
                </h1>
                <p className="text-muted-foreground text-xs">Historial de obras concluidas</p>
            </div>
        </div>
    ), [obras.length, loading]);

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
                    <IconButton
                        variant="ghost"
                        size="sm"
                        aria-label="Limpiar búsqueda"
                        onClick={() => setFiltro('')}
                        className="absolute right-1 top-1/2 -translate-y-1/2"
                        icon={<X className="h-3.5 w-3.5" />}
                    />
                )}
            </div>

            {/* Contenido scrolleable: obras finalizadas */}
            <div className={cn('flex-1 min-h-0 overflow-y-auto space-y-6', aparece)}>
                {loading ? (
                    <Cargando que="las obras finalizadas" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {[1, 2, 3, 4].map(i => <ObraSilueta key={i} conReactivar={canReactivar} />)}
                    </Cargando>
                ) : obras.length === 0 ? (
                    <EmptyState
                        icon={Archive}
                        title="Sin obras finalizadas"
                        description="Cuando concluyas una obra desde Configuración → Obras, aparecerá aquí con sus datos históricos."
                    />
                ) : obrasFiltradas.length === 0 ? (
                    <EmptyState
                        icon={Search}
                        title={`No se encontraron resultados para "${filtro}"`}
                    />
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
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
