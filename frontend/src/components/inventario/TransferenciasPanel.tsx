import React, { useState, useCallback, useEffect } from 'react';
import { Plus, ArrowLeftRight } from 'lucide-react';
import { cn } from '../../utils/cn';
import { useTransferencias } from '../../hooks/inventario/useTransferencias';
import { useAuth } from '../../context/AuthContext';
import { Modal } from '../ui/Modal';
import TransferenciasList from './TransferenciasList';
import TransferenciaDetail from './TransferenciaDetail';
import SolicitudForm from './SolicitudForm';

interface Props {
    obras: { id: number; nombre: string }[];
    hasPermission: (p: string) => boolean;
}

const TransferenciasPanel: React.FC<Props> = ({ obras, hasPermission }) => {
    const { user } = useAuth();
    const trfHook = useTransferencias();

    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [statusFilter, setStatusFilter] = useState('todas');
    const [searchQuery, setSearchQuery] = useState('');
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);

    // Fetch on mount and when filter changes
    useEffect(() => {
        trfHook.fetchAll({ estado: statusFilter === 'todas' ? undefined : statusFilter });
    }, [statusFilter]);

    // Select a transfer
    const handleSelect = useCallback(async (id: number) => {
        setSelectedId(id);
        await trfHook.fetchById(id);
    }, [trfHook.fetchById]);

    // Refresh helper
    const refreshAll = useCallback(async () => {
        await trfHook.fetchAll({ estado: statusFilter === 'todas' ? undefined : statusFilter });
        if (selectedId) await trfHook.fetchById(selectedId);
    }, [statusFilter, selectedId, trfHook.fetchAll, trfHook.fetchById]);

    // ── Action handlers ──
    const handleAprobar = useCallback(async (data: any) => {
        setActionLoading(true);
        const ok = await trfHook.aprobar(selectedId!, data);
        if (ok) await refreshAll();
        setActionLoading(false);
        return ok;
    }, [selectedId, trfHook.aprobar, refreshAll]);

    const handleDespachar = useCallback(async () => {
        setActionLoading(true);
        const ok = await trfHook.despachar(selectedId!);
        if (ok) await refreshAll();
        setActionLoading(false);
        return ok;
    }, [selectedId, trfHook.despachar, refreshAll]);

    const handleRecibir = useCallback(async (items: { item_id: number; cantidad_recibida: number }[]) => {
        setActionLoading(true);
        const ok = await trfHook.recibir(selectedId!, items);
        if (ok) await refreshAll();
        setActionLoading(false);
        return ok;
    }, [selectedId, trfHook.recibir, refreshAll]);

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

    const handleCrear = useCallback(async (data: any) => {
        const result = await trfHook.crear(data);
        if (result) {
            await trfHook.fetchAll({ estado: statusFilter === 'todas' ? undefined : statusFilter });
        }
        return result;
    }, [trfHook.crear, trfHook.fetchAll, statusFilter]);

    return (
        <div className="flex flex-col flex-1 min-h-0">
            {/* Header */}
            <div className="flex items-center justify-between shrink-0 mb-3">
                <h3 className="text-sm font-bold text-brand-dark">Transferencias</h3>
                {hasPermission('inventario.crear') && (
                    <button
                        onClick={() => setShowCreateModal(true)}
                        className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-brand-primary rounded-xl hover:bg-brand-primary/90 transition-all shadow-lg shadow-brand-primary/20"
                    >
                        <Plus className="h-3.5 w-3.5" /> Nueva Solicitud
                    </button>
                )}
            </div>

            {/* Master-Detail body */}
            <div className="flex flex-1 min-h-0 gap-4">
                {/* LEFT: List */}
                <div className={cn(
                    "flex flex-col min-h-0",
                    selectedId ? "hidden md:flex" : "flex",
                    "w-full md:w-[360px] md:shrink-0"
                )}>
                    <TransferenciasList
                        transferencias={trfHook.transferencias}
                        loading={trfHook.loading}
                        selectedId={selectedId}
                        onSelect={handleSelect}
                        statusFilter={statusFilter}
                        onStatusFilterChange={setStatusFilter}
                        searchQuery={searchQuery}
                        onSearchChange={setSearchQuery}
                    />
                </div>

                {/* RIGHT: Detail */}
                <div className={cn(
                    "flex-1 min-h-0",
                    selectedId ? "flex flex-col" : "hidden md:flex md:flex-col"
                )}>
                    {trfHook.selected ? (
                        <TransferenciaDetail
                            transferencia={trfHook.selected}
                            obras={obras}
                            actionLoading={actionLoading}
                            hasPermission={hasPermission}
                            userId={user?.id || 0}
                            onBack={() => { setSelectedId(null); trfHook.setSelected(null); }}
                            onAprobar={handleAprobar}
                            onDespachar={handleDespachar}
                            onRecibir={handleRecibir}
                            onRechazar={handleRechazar}
                            onCancelar={handleCancelar}
                        />
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-center">
                            <ArrowLeftRight className="h-10 w-10 text-brand-primary/15 mb-3" />
                            <p className="text-sm font-medium text-muted-foreground">Selecciona una transferencia</p>
                            <p className="text-xs text-muted-foreground/60 mt-1">para ver su detalle y acciones</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Creation modal */}
            <Modal
                isOpen={showCreateModal}
                onClose={() => setShowCreateModal(false)}
                title="Nueva Solicitud de Transferencia"
                size="lg"
            >
                <SolicitudForm
                    obras={obras}
                    onCrear={handleCrear}
                    onClose={() => setShowCreateModal(false)}
                />
            </Modal>
        </div>
    );
};

export default TransferenciasPanel;
