import React, { useState, useCallback, useEffect } from 'react';
import { Plus, ArrowLeftRight, AlertTriangle, Search, X } from 'lucide-react';
import { cn } from '../../utils/cn';
import { useTransferencias } from '../../hooks/inventario/useTransferencias';
import { useAuth } from '../../context/AuthContext';
import StatusFilterBar from './StatusFilterBar';
import TransferenciasList from './TransferenciasList';
import TransferenciaDetail from './TransferenciaDetail';
import { NuevoMovimientoWizard } from './nuevo-movimiento/NuevoMovimientoWizard';
import type { MovimientoResuelto } from '../../utils/inferMovimiento';
import DiscrepanciasList from './DiscrepanciasList';
import DiscrepanciaDetail from './DiscrepanciaDetail';

interface Props {
    obras: { id: number; nombre: string }[];
    hasPermission: (p: string) => boolean;
    /**
     * Filtro inicial (solo se aplica al montar). Usado cuando se navega desde el
     * Resumen Ejecutivo. Si cambia el valor, el parent debe forzar remount con `key`.
     */
    initialStatusFilter?: string;
    /**
     * Transferencia que debe abrirse automáticamente al montar. Mismo caveat que
     * initialStatusFilter: solo se aplica al montar.
     */
    initialSelectedId?: number | null;
}

const TransferenciasPanel: React.FC<Props> = ({ obras, hasPermission, initialStatusFilter, initialSelectedId }) => {
    const { user } = useAuth();
    const trfHook = useTransferencias();

    const [selectedId, setSelectedId] = useState<number | null>(initialSelectedId ?? null);
    const [statusFilter, setStatusFilter] = useState(initialStatusFilter || 'todas');
    const [searchQuery, setSearchQuery] = useState('');
    const [showWizard, setShowWizard] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);

    // Discrepancias mode
    const isDiscrepanciasMode = statusFilter === 'discrepancias';
    const [discSubFilter, setDiscSubFilter] = useState<'pendiente' | 'resuelta' | 'descartada'>('pendiente');
    const [discSearchQuery, setDiscSearchQuery] = useState('');
    // Counter for badge (always reflects PENDING discrepancies regardless of subfilter)
    const [pendientesCount, setPendientesCount] = useState(0);

    // Load pending count on mount so the badge shows immediately
    useEffect(() => {
        (async () => {
            const list = await trfHook.fetchDiscrepancias('pendiente');
            setPendientesCount(list.length);
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Auto-open a transferencia if navigated with initialSelectedId (from dashboard)
    useEffect(() => {
        if (initialSelectedId && !isDiscrepanciasMode) {
            trfHook.fetchById(initialSelectedId);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Fetch list when filter changes
    useEffect(() => {
        if (isDiscrepanciasMode) {
            trfHook.fetchDiscrepancias(discSubFilter).then(list => {
                if (discSubFilter === 'pendiente') setPendientesCount(list.length);
            });
            // Clear regular selection when entering discrepancias mode
            if (selectedId) {
                setSelectedId(null);
                trfHook.setSelected(null);
            }
        } else {
            trfHook.fetchAll({ estado: statusFilter === 'todas' ? undefined : statusFilter });
            // Clear discrepancia selection when leaving
            if (trfHook.selectedDiscrepancia) trfHook.setSelectedDiscrepancia(null);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [statusFilter, discSubFilter]);

    // ── Regular transferencia handlers ──
    const handleSelect = useCallback(async (id: number) => {
        setSelectedId(id);
        await trfHook.fetchById(id);
    }, [trfHook.fetchById]);

    // Auto-selección del primer movimiento en desktop (como Vehículos), para que el
    // panel de detalle no quede vacío al entrar. Respeta initialSelectedId y discrepancias.
    useEffect(() => {
        if (selectedId || isDiscrepanciasMode || trfHook.transferencias.length === 0) return;
        if (typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches) {
            handleSelect(trfHook.transferencias[0].id);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [trfHook.transferencias, selectedId, isDiscrepanciasMode]);

    const refreshAll = useCallback(async () => {
        await trfHook.fetchAll({ estado: statusFilter === 'todas' ? undefined : statusFilter });
        if (selectedId) await trfHook.fetchById(selectedId);
    }, [statusFilter, selectedId, trfHook.fetchAll, trfHook.fetchById]);

    const handleAprobar = useCallback(async (data: any) => {
        setActionLoading(true);
        const ok = await trfHook.aprobar(selectedId!, data);
        if (ok) await refreshAll();
        setActionLoading(false);
        return ok;
    }, [selectedId, trfHook.aprobar, refreshAll]);

    const handleRecibir = useCallback(async (
        items: { item_id: number; cantidad_recibida: number; observacion?: string }[],
        tipo: 'parcial' | 'total' = 'total',
        observacion?: string
    ) => {
        setActionLoading(true);
        const ok = await trfHook.recibir(selectedId!, items, tipo, observacion);
        if (ok) {
            await refreshAll();
            // Refresh pending discrepancies count — recibir() may have created new ones.
            // En modo parcial no se crea discrepancia, pero el refetch es barato.
            const list = await trfHook.fetchDiscrepancias('pendiente');
            setPendientesCount(list.length);
        }
        setActionLoading(false);
        return ok;
    }, [selectedId, trfHook.recibir, trfHook.fetchDiscrepancias, refreshAll]);

    const handleRechazar = useCallback(async (motivo: string) => {
        setActionLoading(true);
        const ok = await trfHook.rechazar(selectedId!, motivo);
        if (ok) await refreshAll();
        setActionLoading(false);
        return ok;
    }, [selectedId, trfHook.rechazar, refreshAll]);

    const handleCancelar = useCallback(async () => {
        setActionLoading(true);
        const ok = await trfHook.cancelar(selectedId!);
        if (ok) await refreshAll();
        setActionLoading(false);
        return ok;
    }, [selectedId, trfHook.cancelar, refreshAll]);

    // Handler ÚNICO de creación: el wizard infiere el tipo (inferMovimiento) y nos
    // pasa el `resuelto` tipado; acá despachamos a la función correcta del hook.
    // Reemplaza los 7 handlers específicos del alta vieja (Fase 4).
    const handleCrearMovimiento = useCallback(async (resuelto: MovimientoResuelto) => {
        let result: { id: number; codigo: string } | null = null;
        switch (resuelto.kind) {
            case 'crear': result = await trfHook.crear(resuelto.data); break;
            case 'solicitudMateriales': result = await trfHook.solicitudMateriales(resuelto.data); break;
            case 'pushDirecto': result = await trfHook.pushDirecto(resuelto.data); break;
            case 'intraBodega': result = await trfHook.intraBodega(resuelto.data); break;
            case 'devolucion': result = await trfHook.devolucion(resuelto.data); break;
            case 'intraObra': result = await trfHook.intraObra(resuelto.data); break;
            case 'ordenGerencia': result = await trfHook.ordenGerencia(resuelto.data); break;
        }
        if (result) {
            await trfHook.fetchAll({ estado: statusFilter === 'todas' ? undefined : statusFilter });
            // Aterriza en el detalle del recién creado (UX: notificar sin buscar el código).
            setSelectedId(result.id);
            await trfHook.fetchById(result.id);
        }
        return result;
    }, [trfHook, statusFilter]);

    const handleRechazarRecepcion = useCallback(async (motivo: string) => {
        setActionLoading(true);
        const ok = await trfHook.rechazarRecepcion(selectedId!, motivo);
        if (ok) await refreshAll();
        setActionLoading(false);
        return ok;
    }, [selectedId, trfHook.rechazarRecepcion, refreshAll]);

    // ── Discrepancias handlers ──
    const handleSelectDiscrepancia = useCallback((trf: any) => {
        trfHook.setSelectedDiscrepancia(trf);
    }, [trfHook.setSelectedDiscrepancia]);

    const handleResolverDiscrepancia = useCallback(async (
        id: number, estado: 'resuelta' | 'descartada', resolucion: string
    ) => {
        return await trfHook.resolverDiscrepancia(id, estado, resolucion);
    }, [trfHook.resolverDiscrepancia]);

    const refreshDiscrepancias = useCallback(async () => {
        // Re-fetch current subfilter list
        const list = await trfHook.fetchDiscrepancias(discSubFilter);
        // Re-fetch pending count for the badge
        if (discSubFilter !== 'pendiente') {
            const pend = await trfHook.fetchDiscrepancias('pendiente');
            setPendientesCount(pend.length);
            // re-fetch current again to restore list state
            await trfHook.fetchDiscrepancias(discSubFilter);
        } else {
            setPendientesCount(list.length);
        }
        // Refresh selectedDiscrepancia with fresh data, or clear if it's no longer in the list
        if (trfHook.selectedDiscrepancia) {
            const fresh = list.find((d: any) => d.id === trfHook.selectedDiscrepancia!.id);
            trfHook.setSelectedDiscrepancia(fresh || null);
        }
    }, [discSubFilter, trfHook.fetchDiscrepancias, trfHook.selectedDiscrepancia, trfHook.setSelectedDiscrepancia]);

    // Decide what to render in the detail pane
    const detailPaneActive = isDiscrepanciasMode
        ? !!trfHook.selectedDiscrepancia
        : !!selectedId;

    return (
        <div className="flex flex-col flex-1 min-h-0">

            {/* Master-Detail body — card unificado estilo Vehículos: lista (prominente) +
                panel de detalle. En mobile alterna entre lista y detalle. */}
            {/* Barra FULL-WIDTH: [+] [filtros auto-width] [espacio] [🔍 expandible] */}
            <BarraFiltros
                statusFilter={statusFilter}
                onStatusChange={setStatusFilter}
                pendientesCount={pendientesCount}
                canVerDiscrepancias={hasPermission('inventario.transferencias.aprobar')}
                searchQuery={isDiscrepanciasMode ? discSearchQuery : searchQuery}
                onSearchChange={isDiscrepanciasMode ? setDiscSearchQuery : setSearchQuery}
                canNuevoMovimiento={!isDiscrepanciasMode && (
                    hasPermission('inventario.transferencias.solicitar') ||
                    hasPermission('inventario.transferencias.solicitud_materiales') ||
                    hasPermission('inventario.transferencias.push_directo') ||
                    hasPermission('inventario.transferencias.intra_bodega') ||
                    hasPermission('inventario.transferencias.orden_gerencia')
                )}
                onNuevoMovimiento={() => setShowWizard(true)}
            />

            <div className="flex flex-1 min-h-0 bg-card border border-border rounded-3xl shadow-sm overflow-hidden">
                {/* LEFT: Lista (crece) — siempre visible en desktop, oculta en mobile cuando hay detalle */}
                <div className={cn(
                    "flex flex-col min-h-0 md:w-[300px] md:shrink-0 pt-4 md:pt-5 pb-4 md:pb-6",
                    detailPaneActive ? "hidden md:flex" : "flex"
                )}>
                    {isDiscrepanciasMode ? (
                        <>
                            {/* Discrepancias list (with its own sub-filter and search) */}
                            <DiscrepanciasList
                                discrepancias={trfHook.discrepancias}
                                loading={trfHook.loading}
                                selectedId={trfHook.selectedDiscrepancia?.id || null}
                                onSelect={handleSelectDiscrepancia}
                                subFilter={discSubFilter}
                                onSubFilterChange={setDiscSubFilter}
                                searchQuery={discSearchQuery}
                                onSearchChange={setDiscSearchQuery}
                                hideSearch
                            />
                        </>
                    ) : (
                        <TransferenciasList
                            transferencias={trfHook.transferencias}
                            loading={trfHook.loading}
                            selectedId={selectedId}
                            onSelect={handleSelect}
                            statusFilter={statusFilter}
                            onStatusFilterChange={setStatusFilter}
                            searchQuery={searchQuery}
                            onSearchChange={setSearchQuery}
                            discrepanciasCount={pendientesCount}
                            canVerDiscrepancias={hasPermission('inventario.transferencias.aprobar')}
                        />
                    )}
                </div>

                {/* RIGHT: Detalle — siempre 50% del card para balance visual con la lista.
                    pt alineado con el panel izquierdo para que "DETALLE SOLICITUD" arranque
                    a la misma altura que la primera fila TRF. */}
                <div className={cn(
                    "min-h-0 md:border-l md:border-border pt-4 md:pt-5",
                    "flex-1 min-w-0",
                    detailPaneActive ? "flex flex-col" : "hidden md:flex md:flex-col"
                )}>
                    {isDiscrepanciasMode ? (
                        trfHook.selectedDiscrepancia ? (
                            <DiscrepanciaDetail
                                discrepancia={trfHook.selectedDiscrepancia}
                                canEdit={hasPermission('inventario.editar')}
                                onBack={() => trfHook.setSelectedDiscrepancia(null)}
                                onResolver={handleResolverDiscrepancia}
                                onRefresh={refreshDiscrepancias}
                            />
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center text-center">
                                <AlertTriangle className="h-10 w-10 text-muted-foreground/30 mb-3" />
                                <p className="text-sm font-medium text-muted-foreground">Selecciona una discrepancia</p>
                                <p className="text-xs text-muted-foreground/60 mt-1">para ver los ítems afectados</p>
                            </div>
                        )
                    ) : trfHook.selected ? (
                        <TransferenciaDetail
                            transferencia={trfHook.selected}
                            obras={obras}
                            actionLoading={actionLoading}
                            hasPermission={hasPermission}
                            userId={user?.id || 0}
                            onBack={() => { setSelectedId(null); trfHook.setSelected(null); }}
                            onFetchStock={trfHook.fetchStockPorItems}
                            onAprobar={handleAprobar}
                            onCrearFaltante={trfHook.crearFaltante}
                            onRecibir={handleRecibir}
                            onUploadFotoRecepcion={trfHook.uploadFotoRecepcion}
                            onFetchRecepciones={trfHook.fetchRecepciones}
                            onRechazar={handleRechazar}
                            onRechazarRecepcion={handleRechazarRecepcion}
                            onCancelar={handleCancelar}
                        />
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-center">
                            <ArrowLeftRight className="h-10 w-10 text-muted-foreground/30 mb-3" />
                            <p className="text-sm font-medium text-muted-foreground">Selecciona una transferencia</p>
                            <p className="text-xs text-muted-foreground/60 mt-1">para ver su detalle y acciones</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Wizard adaptativo "Nuevo movimiento" (Fase 4) — reemplaza los 8 modales. */}
            <NuevoMovimientoWizard
                isOpen={showWizard}
                onClose={() => setShowWizard(false)}
                hasPermission={hasPermission}
                onSubmit={handleCrearMovimiento}
            />
        </div>
    );
};

export default TransferenciasPanel;

/* ─────────────────────────────────────────────────────────────────────────── */
/*  BarraFiltros                                                               */
/*  Layout: [+] [filtros auto-width] [espacio flexible] [🔍 expandible]       */
/* ─────────────────────────────────────────────────────────────────────────── */
interface BarraFiltrosProps {
    statusFilter: string;
    onStatusChange: (v: string) => void;
    pendientesCount: number;
    canVerDiscrepancias: boolean;
    searchQuery: string;
    onSearchChange: (q: string) => void;
    canNuevoMovimiento: boolean;
    onNuevoMovimiento: () => void;
}

const BarraFiltros: React.FC<BarraFiltrosProps> = ({
    statusFilter, onStatusChange, pendientesCount, canVerDiscrepancias,
    searchQuery, onSearchChange, canNuevoMovimiento, onNuevoMovimiento,
}) => {
    const [searchOpen, setSearchOpen] = React.useState(false);
    const inputRef = React.useRef<HTMLInputElement>(null);

    const openSearch = () => {
        setSearchOpen(true);
        setTimeout(() => inputRef.current?.focus(), 50);
    };

    const closeSearch = () => {
        setSearchOpen(false);
        onSearchChange('');
    };

    return (
        <div className="flex items-center gap-2 shrink-0 mb-2">
            {/* Filtros auto-width — ocupan su ancho natural */}
            <StatusFilterBar
                active={statusFilter}
                onChange={onStatusChange}
                discrepanciasCount={pendientesCount}
                canVerDiscrepancias={canVerDiscrepancias}
            />

            {/* Espacio flexible — empuja lupa y + hacia la derecha */}
            <div className="flex-1" />

            {/* Derecha: lupa expandible + botón + juntos */}
            <div className="flex items-center gap-1.5 shrink-0">
                {/* Lupa: ícono solo → expandible con input al hacer clic */}
                {searchOpen ? (
                    <div className="relative flex items-center animate-in fade-in slide-in-from-right-2 duration-150">
                        <Search className="absolute left-2.5 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                        <input
                            ref={inputRef}
                            type="text"
                            value={searchQuery}
                            onChange={e => onSearchChange(e.target.value)}
                            placeholder="Buscar código..."
                            className="w-44 pl-8 pr-7 py-1.5 text-xs border border-border rounded-xl bg-card focus:ring-2 focus:ring-brand-primary/20 outline-none transition-all"
                        />
                        <button
                            onClick={closeSearch}
                            className="absolute right-2 p-0.5 hover:bg-muted rounded"
                            title="Cerrar búsqueda"
                        >
                            <X className="h-3 w-3 text-muted-foreground" />
                        </button>
                    </div>
                ) : (
                    <button
                        onClick={openSearch}
                        title="Buscar por código"
                        className="flex items-center justify-center h-8 w-8 text-muted-foreground hover:text-brand-primary hover:bg-brand-primary/5 rounded-xl border border-border bg-card transition-all"
                    >
                        <Search className="h-3.5 w-3.5" />
                    </button>
                )}

                {/* Botón + al lado de la lupa */}
                {canNuevoMovimiento && (
                    <button
                        onClick={onNuevoMovimiento}
                        title="Nuevo movimiento"
                        className="flex items-center justify-center h-8 w-8 shrink-0 text-white bg-brand-primary rounded-xl hover:bg-brand-primary/90 transition-all shadow-sm"
                    >
                        <Plus className="h-4 w-4" />
                    </button>
                )}
            </div>
        </div>
    );
};
