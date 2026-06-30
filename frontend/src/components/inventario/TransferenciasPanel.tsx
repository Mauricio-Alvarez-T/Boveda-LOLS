import React, { useState, useCallback, useEffect } from 'react';
import { Plus, ArrowLeftRight, AlertTriangle, Search, X, Filter } from 'lucide-react';
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
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import { SearchableSelect } from '../ui/SearchableSelect';
import ResumenAccionModal, { type ResumenAccionTipo } from './transferencia-detail/ResumenAccionModal';

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
    // Filtros del panel (server-side): rango por fecha de solicitud + solicitante.
    const [fechaDesde, setFechaDesde] = useState('');
    const [fechaHasta, setFechaHasta] = useState('');
    const [solicitanteId, setSolicitanteId] = useState<number | null>(null);
    const canVerTodas = hasPermission('inventario.transferencias.ver_todas');
    const [solicitantes, setSolicitantes] = useState<{ id: number; nombre: string }[]>([]);
    const [wizardModo, setWizardModo] = useState<'pedir' | 'mover' | null>(null);
    const [actionLoading, setActionLoading] = useState(false);
    // Modal-resumen post-acción: se abre tras crear/aprobar/recibir y aloja el
    // botón de WhatsApp, para que quede claro CUÁNDO se envía el respaldo.
    const [resumenModal, setResumenModal] = useState<{ open: boolean; tipo: ResumenAccionTipo }>({ open: false, tipo: 'crear' });

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

    // Solicitantes para el filtro por usuario (solo si ve todas; quien ve lo suyo no lo necesita).
    useEffect(() => {
        if (canVerTodas) trfHook.fetchSolicitantes().then(setSolicitantes);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [canVerTodas]);

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
            trfHook.fetchAll({
                estado: statusFilter === 'todas' ? undefined : statusFilter,
                fecha_desde: fechaDesde || undefined,
                fecha_hasta: fechaHasta || undefined,
                solicitante_id: solicitanteId || undefined,
            });
            // Clear discrepancia selection when leaving
            if (trfHook.selectedDiscrepancia) trfHook.setSelectedDiscrepancia(null);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [statusFilter, discSubFilter, fechaDesde, fechaHasta, solicitanteId]);

    // ── Regular transferencia handlers ──
    const handleSelect = useCallback(async (id: number) => {
        setSelectedId(id);
        await trfHook.fetchById(id);
    }, [trfHook.fetchById]);

    // Cambiar de filtro limpia la selección abierta: en móvil el detalle oculta la
    // lista (detailPaneActive), así que sin esto los chips "no hacían nada". En
    // desktop el effect de auto-selección vuelve a elegir el primero del nuevo filtro.
    const handleStatusChange = useCallback((v: string) => {
        setSelectedId(null);
        trfHook.setSelected(null);
        trfHook.setSelectedDiscrepancia(null);
        setStatusFilter(v);
    }, [trfHook]);

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
        if (ok) {
            await refreshAll();
            setResumenModal({ open: true, tipo: 'aprobar' });
        }
        setActionLoading(false);
        return ok;
    }, [selectedId, trfHook.aprobar, refreshAll]);

    const handleRecibir = useCallback(async (
        items: { item_id: number; cantidad_recibida: number; observacion?: string }[],
        tipo: 'parcial' | 'total' = 'total',
        observacion?: string,
        itemsCustom?: { transferencia_item_custom_id: number; cantidad_recibida: number }[]
    ) => {
        setActionLoading(true);
        const ok = await trfHook.recibir(selectedId!, items, tipo, observacion, itemsCustom);
        if (ok) {
            await refreshAll();
            // Refresh pending discrepancies count — recibir() may have created new ones.
            // En modo parcial no se crea discrepancia, pero el refetch es barato.
            const list = await trfHook.fetchDiscrepancias('pendiente');
            setPendientesCount(list.length);
            setResumenModal({ open: true, tipo: tipo === 'parcial' ? 'recibir_parcial' : 'recibir_total' });
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

    // Hard delete: borra la transferencia y la saca del historial. Limpia la
    // selección y refetch del listado (NO fetchById — ya no existe). Sin stock.
    const handleEliminar = useCallback(async () => {
        const ok = await trfHook.eliminar(selectedId!);
        if (ok) {
            setSelectedId(null);
            trfHook.setSelected(null);
            await trfHook.fetchAll({ estado: statusFilter === 'todas' ? undefined : statusFilter });
        }
        return ok;
    }, [selectedId, statusFilter, trfHook]);

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
            // Solo el flujo "Pedir" (solicitud) abre el modal-resumen; los movimientos
            // directos de stock (mover) no son solicitudes que se notifiquen así.
            if (resuelto.kind === 'crear' || resuelto.kind === 'solicitudMateriales') {
                setResumenModal({ open: true, tipo: 'crear' });
            }
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

    // Eliminar (hard delete) una diferencia suelta: la saca del historial.
    const handleEliminarDiscrepancia = useCallback(async (id: number) => {
        const ok = await trfHook.eliminarDiscrepancia(id);
        if (ok) await refreshDiscrepancias();
        return ok;
    }, [trfHook.eliminarDiscrepancia, refreshDiscrepancias]);

    // Eliminar (hard delete) la transferencia completa desde la vista de diferencias.
    const handleEliminarTransferenciaDisc = useCallback(async (id: number) => {
        const ok = await trfHook.eliminar(id);
        if (ok) {
            trfHook.setSelectedDiscrepancia(null);
            await refreshDiscrepancias();
        }
        return ok;
    }, [trfHook.eliminar, trfHook.setSelectedDiscrepancia, refreshDiscrepancias]);

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
                onStatusChange={handleStatusChange}
                pendientesCount={pendientesCount}
                canVerDiscrepancias={hasPermission('inventario.transferencias.aprobar')}
                searchQuery={isDiscrepanciasMode ? discSearchQuery : searchQuery}
                onSearchChange={isDiscrepanciasMode ? setDiscSearchQuery : setSearchQuery}
                canPedir={!isDiscrepanciasMode && (
                    hasPermission('inventario.transferencias.solicitar') ||
                    hasPermission('inventario.transferencias.solicitud_materiales')
                )}
                canMover={!isDiscrepanciasMode && (
                    hasPermission('inventario.transferencias.solicitar') ||
                    hasPermission('inventario.transferencias.push_directo') ||
                    hasPermission('inventario.transferencias.intra_bodega') ||
                    hasPermission('inventario.transferencias.devolucion') ||
                    hasPermission('inventario.transferencias.intra_obra') ||
                    hasPermission('inventario.transferencias.orden_gerencia')
                )}
                onPedir={() => setWizardModo('pedir')}
                onMover={() => setWizardModo('mover')}
                showFiltros={!isDiscrepanciasMode}
                fechaDesde={fechaDesde}
                fechaHasta={fechaHasta}
                onFechaDesde={setFechaDesde}
                onFechaHasta={setFechaHasta}
                canFiltrarUsuario={canVerTodas}
                solicitantes={solicitantes}
                solicitanteId={solicitanteId}
                onSolicitante={setSolicitanteId}
                onLimpiarFiltros={() => { setFechaDesde(''); setFechaHasta(''); setSolicitanteId(null); }}
            />

            <div className="flex flex-1 min-h-0 bg-card border border-border rounded-3xl shadow-sm overflow-hidden">
                {/* LEFT: Lista (crece) — siempre visible en desktop, oculta en mobile cuando hay detalle */}
                <div className={cn(
                    "flex flex-col min-h-0 w-full min-w-0 md:w-[300px] md:shrink-0 pt-4 md:pt-5 pb-4 md:pb-6",
                    isDiscrepanciasMode && "px-3 md:px-4",
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
                    isDiscrepanciasMode && "px-3 md:px-5",
                    detailPaneActive ? "flex flex-col" : "hidden md:flex md:flex-col"
                )}>
                    {isDiscrepanciasMode ? (
                        trfHook.selectedDiscrepancia ? (
                            <DiscrepanciaDetail
                                discrepancia={trfHook.selectedDiscrepancia}
                                canEdit={hasPermission('inventario.editar')}
                                canEliminar={hasPermission('inventario.transferencias.eliminar')}
                                onBack={() => trfHook.setSelectedDiscrepancia(null)}
                                onResolver={handleResolverDiscrepancia}
                                onEliminarTransferencia={handleEliminarTransferenciaDisc}
                                onEliminarDiscrepancia={handleEliminarDiscrepancia}
                                onRefresh={refreshDiscrepancias}
                            />
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center text-center">
                                <AlertTriangle className="h-10 w-10 text-muted-foreground/30 mb-3" />
                                <p className="text-sm font-medium text-muted-foreground">Selecciona una diferencia</p>
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
                            onEliminar={handleEliminar}
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

            {/* Wizard adaptativo (Fase 4.1) — dos modos: Pedir (solicitud) / Mover stock. */}
            <NuevoMovimientoWizard
                isOpen={wizardModo !== null}
                modo={wizardModo ?? 'pedir'}
                onClose={() => setWizardModo(null)}
                hasPermission={hasPermission}
                onSubmit={handleCrearMovimiento}
            />

            {/* Modal-resumen post-acción (crear / aprobar / recibir): muestra el
                preview del respaldo + botón de WhatsApp. La TRF fresca viene de
                trfHook.selected tras el refetch de cada handler. */}
            <ResumenAccionModal
                isOpen={resumenModal.open}
                onClose={() => setResumenModal(r => ({ ...r, open: false }))}
                t={trfHook.selected}
                tipo={resumenModal.tipo}
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
    canPedir: boolean;
    canMover: boolean;
    onPedir: () => void;
    onMover: () => void;
    // Filtros avanzados (solo listado de transferencias, no discrepancias).
    showFiltros?: boolean;
    fechaDesde?: string;
    fechaHasta?: string;
    onFechaDesde?: (v: string) => void;
    onFechaHasta?: (v: string) => void;
    canFiltrarUsuario?: boolean;
    solicitantes?: { id: number; nombre: string }[];
    solicitanteId?: number | null;
    onSolicitante?: (v: number | null) => void;
    onLimpiarFiltros?: () => void;
}

const BarraFiltros: React.FC<BarraFiltrosProps> = ({
    statusFilter, onStatusChange, pendientesCount, canVerDiscrepancias,
    searchQuery, onSearchChange, canPedir, canMover, onPedir, onMover,
    showFiltros = false, fechaDesde = '', fechaHasta = '', onFechaDesde, onFechaHasta,
    canFiltrarUsuario = false, solicitantes = [], solicitanteId = null, onSolicitante, onLimpiarFiltros,
}) => {
    const [searchOpen, setSearchOpen] = React.useState(false);
    const [filtrosOpen, setFiltrosOpen] = React.useState(false);
    const inputRef = React.useRef<HTMLInputElement>(null);

    const openSearch = () => {
        setSearchOpen(true);
        setTimeout(() => inputRef.current?.focus(), 50);
    };

    const closeSearch = () => {
        setSearchOpen(false);
        onSearchChange('');
    };

    const filtrosActivos = !!fechaDesde || !!fechaHasta || solicitanteId != null;

    return (
        <div className="flex flex-col gap-2 shrink-0 mb-2">
            <div className="flex flex-col gap-2 md:flex-row md:items-center">
                {/* Filtros: scroll horizontal en mobile (evita que los tabs empujen las acciones
                    fuera de pantalla); ancho natural + wrap en desktop. */}
                <div className="min-w-0 overflow-x-auto md:overflow-visible">
                    <StatusFilterBar
                        active={statusFilter}
                        onChange={onStatusChange}
                        discrepanciasCount={pendientesCount}
                        canVerDiscrepancias={canVerDiscrepancias}
                        className="flex-nowrap md:flex-wrap"
                    />
                </div>

                {/* Acciones: lupa expandible + filtros + Mover + Pedir. En mobile fila propia
                    (visibles); en desktop empujadas a la derecha. flex-wrap evita overflow. */}
                <div className="flex flex-wrap items-center justify-end gap-1.5 shrink-0 md:ml-auto md:flex-nowrap">
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
                            <IconButton
                                onClick={closeSearch}
                                className="absolute right-1 h-6 w-6"
                                size="sm"
                                aria-label="Cerrar búsqueda"
                                icon={<X className="h-3 w-3" />}
                            />
                        </div>
                    ) : (
                        <IconButton
                            onClick={openSearch}
                            aria-label="Buscar por código"
                            size="sm"
                            className="rounded-xl border border-border bg-card"
                            icon={<Search className="h-3.5 w-3.5" />}
                        />
                    )}

                    {/* Filtros avanzados (fecha + solicitante): toggle. Resaltado si hay alguno activo. */}
                    {showFiltros && (
                        <IconButton
                            onClick={() => setFiltrosOpen(o => !o)}
                            aria-label="Filtros de búsqueda"
                            size="sm"
                            className={cn(
                                "rounded-xl border bg-card",
                                (filtrosOpen || filtrosActivos) ? "border-brand-primary text-brand-primary" : "border-border"
                            )}
                            icon={<Filter className="h-3.5 w-3.5" />}
                        />
                    )}

                    {/* Alta separada por rol: "Mover" (movimientos de stock) y "Pedir" (solicitud). */}
                    {canMover && (
                        <Button
                            onClick={onMover}
                            variant="outline"
                            size="sm"
                            title="Mover stock entre ubicaciones (despacho, devolución, etc.)"
                            className="h-8 shrink-0 text-xs font-bold"
                            leftIcon={<ArrowLeftRight className="h-3.5 w-3.5" />}
                        >
                            Mover
                        </Button>
                    )}
                    {canPedir && (
                        <Button
                            onClick={onPedir}
                            variant="primary"
                            size="sm"
                            title="Pedir materiales para una obra"
                            className="h-8 shrink-0 text-xs font-bold"
                            leftIcon={<Plus className="h-4 w-4" />}
                        >
                            Pedir
                        </Button>
                    )}
                </div>
            </div>

            {/* Segunda fila: filtros por fecha y solicitante (server-side). */}
            {showFiltros && filtrosOpen && (
                <div className="flex flex-wrap items-center gap-2 pb-1">
                    <div className="flex items-center gap-1.5">
                        <label className="text-caption text-muted-foreground">Desde</label>
                        <input
                            type="date"
                            value={fechaDesde}
                            onChange={e => onFechaDesde?.(e.target.value)}
                            className="h-8 px-2 text-xs border border-border rounded-lg bg-card focus:ring-2 focus:ring-brand-primary/20 outline-none"
                        />
                    </div>
                    <div className="flex items-center gap-1.5">
                        <label className="text-caption text-muted-foreground">Hasta</label>
                        <input
                            type="date"
                            value={fechaHasta}
                            onChange={e => onFechaHasta?.(e.target.value)}
                            className="h-8 px-2 text-xs border border-border rounded-lg bg-card focus:ring-2 focus:ring-brand-primary/20 outline-none"
                        />
                    </div>
                    {canFiltrarUsuario && (
                        <div className="min-w-[200px]">
                            <SearchableSelect
                                placeholder="Todos los solicitantes"
                                value={solicitanteId ?? null}
                                onChange={v => onSolicitante?.(v == null || v === '' ? null : Number(v))}
                                options={solicitantes.map(u => ({ value: u.id, label: u.nombre }))}
                            />
                        </div>
                    )}
                    {filtrosActivos && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={onLimpiarFiltros}
                            leftIcon={<X className="h-3.5 w-3.5" />}
                            className="h-8 text-xs"
                        >
                            Limpiar
                        </Button>
                    )}
                </div>
            )}
        </div>
    );
};
