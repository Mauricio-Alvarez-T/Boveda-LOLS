import React, { useState } from 'react';
import {
    ArrowLeft, ArrowRight, AlertTriangle, Check, XCircle, Clock,
    CheckCircle2, Ban, Package, MapPin, Warehouse, User, Calendar, FileText
} from 'lucide-react';
import { cn } from '../../utils/cn';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import type { TransferenciaConDiscrepancias, TransferenciaDiscrepanciaItem } from '../../types/entities';

interface Props {
    discrepancia: TransferenciaConDiscrepancias;
    canEdit: boolean;
    onBack: () => void;
    onResolver: (id: number, estado: 'resuelta' | 'descartada', resolucion: string) => Promise<boolean>;
    onRefresh: () => Promise<void>;
}

const estadoItemConfig: Record<string, { label: string; color: string; icon: React.ElementType }> = {
    pendiente:  { label: 'Pendiente',  color: 'bg-amber-100 text-amber-700 border-amber-200',  icon: Clock },
    resuelta:   { label: 'Resuelta',   color: 'bg-green-100 text-green-700 border-green-200', icon: CheckCircle2 },
    descartada: { label: 'Descartada', color: 'bg-gray-100 text-gray-500 border-gray-200',    icon: Ban },
};

const fmtFecha = (s: string | null) => s
    ? new Date(s).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—';

const DiscrepanciaDetail: React.FC<Props> = ({ discrepancia, canEdit, onBack, onResolver, onRefresh }) => {
    const [modalOpen, setModalOpen] = useState(false);
    const [modalAction, setModalAction] = useState<'resuelta' | 'descartada'>('resuelta');
    const [modalItem, setModalItem] = useState<TransferenciaDiscrepanciaItem | null>(null);
    const [resolucion, setResolucion] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const openModal = (item: TransferenciaDiscrepanciaItem, action: 'resuelta' | 'descartada') => {
        setModalItem(item);
        setModalAction(action);
        setResolucion('');
        setModalOpen(true);
    };

    const closeModal = () => {
        setModalOpen(false);
        setModalItem(null);
        setResolucion('');
    };

    const handleSubmit = async () => {
        if (!modalItem) return;
        if (!resolucion.trim()) return;
        setSubmitting(true);
        const ok = await onResolver(modalItem.id, modalAction, resolucion.trim());
        setSubmitting(false);
        if (ok) {
            closeModal();
            await onRefresh();
        }
    };

    const origenLabel = discrepancia.origen_obra_nombre || discrepancia.origen_bodega_nombre || '—';
    const destinoLabel = discrepancia.destino_obra_nombre || discrepancia.destino_bodega_nombre || '—';
    const origenIsObra = !!discrepancia.origen_obra_nombre;
    const destinoIsObra = !!discrepancia.destino_obra_nombre;

    return (
        <div className="flex flex-col flex-1 min-h-0">
            {/* Header with back button (mobile) */}
            <div className="flex items-center gap-2 shrink-0 mb-3">
                <button
                    onClick={onBack}
                    className="md:hidden p-1.5 hover:bg-muted rounded-lg transition-colors"
                >
                    <ArrowLeft className="h-4 w-4 text-brand-dark" />
                </button>
                <div className="flex-1">
                    <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                            <AlertTriangle className="h-3.5 w-3.5" />
                        </div>
                        <h3 className="text-sm font-black text-brand-dark">{discrepancia.codigo}</h3>
                    </div>
                </div>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-3">

                {/* Summary card */}
                <div className="rounded-2xl bg-gradient-to-br from-red-500 to-red-600 p-4 text-white shadow-lg shadow-red-500/20">
                    <div className="grid grid-cols-2 gap-2 mb-3">
                        <div className="bg-white/15 rounded-xl p-2.5">
                            <p className="text-[9px] opacity-80 uppercase tracking-wider mb-0.5">Ítems afectados</p>
                            <p className="text-lg font-black leading-none">{discrepancia.total_items_afectados}</p>
                        </div>
                        <div className="bg-white/15 rounded-xl p-2.5">
                            <p className="text-[9px] opacity-80 uppercase tracking-wider mb-0.5">Diferencia neta</p>
                            <p className="text-lg font-black leading-none">
                                {discrepancia.total_unidades_perdidas > 0 ? '-' : discrepancia.total_unidades_perdidas < 0 ? '+' : ''}
                                {Math.abs(discrepancia.total_unidades_perdidas)}
                            </p>
                        </div>
                    </div>
                    {/* Ruta */}
                    <div className="flex items-center gap-1.5 text-[11px]">
                        {origenIsObra
                            ? <MapPin className="h-3 w-3 shrink-0 opacity-90" />
                            : <Warehouse className="h-3 w-3 shrink-0 opacity-90" />}
                        <span className="truncate max-w-[40%] font-semibold">{origenLabel}</span>
                        <ArrowRight className="h-3 w-3 shrink-0 opacity-80" />
                        {destinoIsObra
                            ? <MapPin className="h-3 w-3 shrink-0 opacity-90" />
                            : <Warehouse className="h-3 w-3 shrink-0 opacity-90" />}
                        <span className="truncate max-w-[40%] font-semibold">{destinoLabel}</span>
                    </div>
                </div>

                {/* Metadata card */}
                <div className="rounded-xl border border-[#E8E8ED] bg-white p-3 text-[11px] space-y-1.5">
                    <div className="flex items-center gap-2 text-muted-foreground">
                        <Calendar className="h-3 w-3 shrink-0" />
                        <span>Recibido:</span>
                        <span className="font-semibold text-brand-dark">{fmtFecha(discrepancia.fecha_recepcion)}</span>
                    </div>
                    {discrepancia.receptor_nombre && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                            <User className="h-3 w-3 shrink-0" />
                            <span>Receptor:</span>
                            <span className="font-semibold text-brand-dark truncate">{discrepancia.receptor_nombre}</span>
                        </div>
                    )}
                    {discrepancia.solicitante_nombre && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                            <User className="h-3 w-3 shrink-0" />
                            <span>Solicitó:</span>
                            <span className="font-semibold text-brand-dark truncate">{discrepancia.solicitante_nombre}</span>
                        </div>
                    )}
                </div>

                {/* Ítems con discrepancia */}
                <div className="space-y-2">
                    <h4 className="text-[10px] font-black uppercase tracking-wider text-muted-foreground px-1">
                        Ítems con diferencia ({discrepancia.discrepancias.length})
                    </h4>
                    {discrepancia.discrepancias.map(item => {
                        const cfg = estadoItemConfig[item.estado] || estadoItemConfig.pendiente;
                        const EstadoIcon = cfg.icon;
                        const isPendiente = item.estado === 'pendiente';

                        return (
                            <div
                                key={item.id}
                                className="rounded-xl border border-[#E8E8ED] bg-white p-3"
                            >
                                {/* Header item */}
                                <div className="flex items-start gap-2 mb-2">
                                    <div className="w-8 h-8 rounded-lg bg-[#F5F7FA] border border-[#E8E8ED] flex items-center justify-center shrink-0">
                                        <Package className="h-3.5 w-3.5 text-muted-foreground" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                                            <span className="text-[10px] font-bold text-muted-foreground">#{item.nro_item}</span>
                                            <span className={cn(
                                                "inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full border text-[9px] font-bold",
                                                cfg.color
                                            )}>
                                                <EstadoIcon className="h-2.5 w-2.5" />
                                                {cfg.label}
                                            </span>
                                        </div>
                                        <p className="text-[11px] font-semibold text-brand-dark leading-tight line-clamp-2">
                                            {item.item_descripcion}
                                        </p>
                                    </div>
                                </div>

                                {/* Métricas cant. enviada vs recibida */}
                                <div className="grid grid-cols-3 gap-1.5 mb-2">
                                    <div className="rounded-lg bg-blue-50 border border-blue-100 px-2 py-1.5">
                                        <p className="text-[8px] text-blue-600 uppercase font-bold leading-none mb-0.5">Enviado</p>
                                        <p className="text-xs font-black text-blue-700 leading-none">
                                            {item.cantidad_enviada} <span className="font-normal text-[9px]">{item.unidad}</span>
                                        </p>
                                    </div>
                                    <div className="rounded-lg bg-green-50 border border-green-100 px-2 py-1.5">
                                        <p className="text-[8px] text-green-600 uppercase font-bold leading-none mb-0.5">Recibido</p>
                                        <p className="text-xs font-black text-green-700 leading-none">
                                            {item.cantidad_recibida} <span className="font-normal text-[9px]">{item.unidad}</span>
                                        </p>
                                    </div>
                                    <div className={cn(
                                        "rounded-lg px-2 py-1.5 border",
                                        item.diferencia > 0
                                            ? "bg-red-50 border-red-100"
                                            : "bg-amber-50 border-amber-100"
                                    )}>
                                        <p className={cn(
                                            "text-[8px] uppercase font-bold leading-none mb-0.5",
                                            item.diferencia > 0 ? "text-red-600" : "text-amber-600"
                                        )}>
                                            {item.diferencia > 0 ? 'Merma' : 'Sobrante'}
                                        </p>
                                        <p className={cn(
                                            "text-xs font-black leading-none",
                                            item.diferencia > 0 ? "text-red-700" : "text-amber-700"
                                        )}>
                                            {item.diferencia > 0 ? '-' : '+'}{Math.abs(item.diferencia)}{' '}
                                            <span className="font-normal text-[9px]">{item.unidad}</span>
                                        </p>
                                    </div>
                                </div>

                                {/* Observación al recibir (si existe) */}
                                {item.observacion && (
                                    <div className="flex items-start gap-1.5 bg-[#FAFBFC] rounded-lg px-2 py-1.5 mb-2 text-[10px]">
                                        <FileText className="h-3 w-3 shrink-0 mt-0.5 text-muted-foreground" />
                                        <div>
                                            <p className="text-[9px] font-bold text-muted-foreground uppercase mb-0.5">Nota al recibir</p>
                                            <p className="text-brand-dark leading-tight">{item.observacion}</p>
                                        </div>
                                    </div>
                                )}

                                {/* Resolución / Acciones */}
                                {isPendiente && canEdit && (
                                    <div className="flex gap-1.5">
                                        <button
                                            onClick={() => openModal(item, 'resuelta')}
                                            className="flex-1 flex items-center justify-center gap-1 px-2.5 py-1.5 bg-green-500 hover:bg-green-600 text-white text-[10px] font-bold rounded-lg transition-colors shadow-sm"
                                        >
                                            <Check className="h-3 w-3" />
                                            Resolver
                                        </button>
                                        <button
                                            onClick={() => openModal(item, 'descartada')}
                                            className="flex-1 flex items-center justify-center gap-1 px-2.5 py-1.5 bg-gray-500 hover:bg-gray-600 text-white text-[10px] font-bold rounded-lg transition-colors shadow-sm"
                                        >
                                            <XCircle className="h-3 w-3" />
                                            Descartar
                                        </button>
                                    </div>
                                )}

                                {/* Si ya está cerrada, mostrar la resolución */}
                                {!isPendiente && item.resolucion && (
                                    <div className={cn(
                                        "rounded-lg px-2.5 py-2 text-[10px]",
                                        item.estado === 'resuelta' ? "bg-green-50 border border-green-100" : "bg-gray-50 border border-gray-100"
                                    )}>
                                        <p className="font-bold text-[9px] uppercase tracking-wider mb-0.5 text-muted-foreground">
                                            Resolución
                                        </p>
                                        <p className="text-brand-dark leading-snug mb-1">{item.resolucion}</p>
                                        <p className="text-[9px] text-muted-foreground">
                                            {item.resuelto_por_nombre || 'Usuario'} · {fmtFecha(item.fecha_resolucion)}
                                        </p>
                                    </div>
                                )}

                                {/* Si es pendiente y no puede editar */}
                                {isPendiente && !canEdit && (
                                    <p className="text-[10px] text-muted-foreground italic text-center py-1">
                                        Sin permiso para resolver
                                    </p>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Modal: nota de resolución */}
            <Modal
                isOpen={modalOpen}
                onClose={closeModal}
                size="sm"
                title={
                    <div className="flex items-center gap-2">
                        {modalAction === 'resuelta'
                            ? <Check className="h-4 w-4 text-green-600" />
                            : <XCircle className="h-4 w-4 text-gray-500" />}
                        <span>{modalAction === 'resuelta' ? 'Resolver discrepancia' : 'Descartar discrepancia'}</span>
                    </div>
                }
                footer={
                    <div className="flex items-center justify-end gap-2 w-full">
                        <Button variant="outline" onClick={closeModal} disabled={submitting}>
                            Cancelar
                        </Button>
                        <Button
                            onClick={handleSubmit}
                            disabled={submitting || !resolucion.trim()}
                            className={cn(
                                modalAction === 'resuelta'
                                    ? "bg-green-500 hover:bg-green-600 text-white"
                                    : "bg-gray-500 hover:bg-gray-600 text-white"
                            )}
                        >
                            {submitting ? 'Guardando…' :
                                modalAction === 'resuelta' ? 'Marcar como resuelta' : 'Marcar como descartada'}
                        </Button>
                    </div>
                }
            >
                {modalItem && (
                    <div className="space-y-3">
                        <div className="bg-[#F9F9FB] rounded-lg p-3 text-xs">
                            <p className="font-bold text-brand-dark mb-1">#{modalItem.nro_item} · {modalItem.item_descripcion}</p>
                            <p className="text-muted-foreground">
                                Enviado: <span className="font-semibold text-brand-dark">{modalItem.cantidad_enviada}</span>
                                {' · '}
                                Recibido: <span className="font-semibold text-brand-dark">{modalItem.cantidad_recibida}</span>
                                {' · '}
                                Diferencia: <span className="font-semibold text-red-600">
                                    {modalItem.diferencia > 0 ? '-' : '+'}{Math.abs(modalItem.diferencia)}
                                </span>
                            </p>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-brand-dark mb-1.5">
                                Nota de resolución <span className="text-red-500">*</span>
                            </label>
                            <textarea
                                value={resolucion}
                                onChange={e => setResolucion(e.target.value)}
                                rows={4}
                                placeholder={modalAction === 'resuelta'
                                    ? 'Ej: Unidades encontradas en camión. Ajuste de inventario manual.'
                                    : 'Ej: Pérdida aceptada por desgaste de material. No requiere seguimiento.'}
                                className="w-full px-3 py-2 text-sm border border-[#E8E8ED] rounded-xl focus:ring-2 focus:ring-brand-primary/20 outline-none resize-none"
                                autoFocus
                            />
                            <p className="text-[10px] text-muted-foreground mt-1">
                                Esta nota queda registrada junto con tu nombre y fecha.
                            </p>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
};

export default DiscrepanciaDetail;
