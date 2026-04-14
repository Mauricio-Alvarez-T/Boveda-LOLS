import React, { useState, useMemo } from 'react';
import { cn } from '../../utils/cn';
import {
    ChevronLeft, FileText, CheckCircle2, Truck, PackageCheck,
    XCircle, Ban, AlertTriangle, MessageSquare, Users
} from 'lucide-react';
import { estadoConfig } from './TransferenciasList';
import { SearchableSelect } from '../ui/SearchableSelect';
import type { Transferencia, TransferenciaItem } from '../../types/entities';

interface Props {
    transferencia: Transferencia;
    obras: { id: number; nombre: string }[];
    actionLoading: boolean;
    hasPermission: (p: string) => boolean;
    userId: number;
    onBack: () => void;
    onAprobar: (data: { origen_obra_id?: number | null; origen_bodega_id?: number | null; items: { item_id: number; cantidad_enviada: number }[] }) => Promise<boolean>;
    onDespachar: () => Promise<boolean>;
    onRecibir: (items: { item_id: number; cantidad_recibida: number }[]) => Promise<boolean>;
    onRechazar: (motivo: string) => Promise<boolean>;
    onCancelar: () => Promise<boolean>;
}

// ── Timeline Steps ──
const STEPS = [
    { key: 'pendiente', label: 'Solicitada', icon: FileText },
    { key: 'aprobada', label: 'Aprobada', icon: CheckCircle2 },
    { key: 'en_transito', label: 'Despachada', icon: Truck },
    { key: 'recibida', label: 'Recibida', icon: PackageCheck },
];

const STEP_INDEX: Record<string, number> = {
    pendiente: 0, aprobada: 1, en_transito: 2, recibida: 3,
    rechazada: -1, cancelada: -1,
};

const fmtDate = (d: string | null) =>
    d ? new Date(d).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' }) : '';

const fmtDateTime = (d: string | null) =>
    d ? new Date(d).toLocaleString('es-CL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';

const TransferenciaDetail: React.FC<Props> = ({
    transferencia: t, obras, actionLoading, hasPermission, userId,
    onBack, onAprobar, onDespachar, onRecibir, onRechazar, onCancelar,
}) => {
    const items: TransferenciaItem[] = t.items || [];
    const cfg = estadoConfig[t.estado] || estadoConfig.pendiente;
    const Icon = cfg.icon;

    const origen = (t as any).origen_obra_nombre || (t as any).origen_bodega_nombre || '—';
    const destino = (t as any).destino_obra_nombre || (t as any).destino_bodega_nombre || '—';

    // ── Action permissions ──
    const canAprobar = t.estado === 'pendiente' && hasPermission('inventario.aprobar');
    const canRechazar = t.estado === 'pendiente' && hasPermission('inventario.aprobar');
    const canDespachar = t.estado === 'aprobada' && hasPermission('inventario.editar');
    const canRecibir = (t.estado === 'en_transito' || t.estado === 'aprobada') && hasPermission('inventario.editar');
    const canCancelar = t.estado === 'pendiente' && (hasPermission('inventario.editar') || t.solicitante_id === userId);
    const hasActions = canAprobar || canRechazar || canDespachar || canRecibir || canCancelar;

    // ── Inline form states ──
    const [activeForm, setActiveForm] = useState<'aprobar' | 'rechazar' | 'recibir' | null>(null);
    const [approvalOrigin, setApprovalOrigin] = useState<number | null>(null);
    const [approvalItems, setApprovalItems] = useState<{ item_id: number; cantidad_enviada: number }[]>(
        () => items.map(i => ({ item_id: i.item_id, cantidad_enviada: i.cantidad_solicitada }))
    );
    const [receiveItems, setReceiveItems] = useState<{ item_id: number; cantidad_recibida: number }[]>(
        () => items.map(i => ({ item_id: i.item_id, cantidad_recibida: i.cantidad_enviada || i.cantidad_solicitada }))
    );
    const [rejectMotivo, setRejectMotivo] = useState('');

    // Reset forms when transferencia changes
    useMemo(() => {
        setActiveForm(null);
        setApprovalItems(items.map(i => ({ item_id: i.item_id, cantidad_enviada: i.cantidad_solicitada })));
        setReceiveItems(items.map(i => ({ item_id: i.item_id, cantidad_recibida: i.cantidad_enviada || i.cantidad_solicitada })));
        setRejectMotivo('');
        setApprovalOrigin(null);
    }, [t.id]);

    // ── Timeline ──
    const activeStep = STEP_INDEX[t.estado] ?? -1;
    const isTerminated = t.estado === 'rechazada' || t.estado === 'cancelada';

    return (
        <div className="flex flex-col flex-1 min-h-0 overflow-y-auto">
            {/* Mobile back */}
            <button onClick={onBack} className="md:hidden flex items-center gap-1 mb-3 text-xs text-muted-foreground hover:text-brand-dark transition-colors shrink-0">
                <ChevronLeft className="h-4 w-4" /> Volver
            </button>

            {/* ── Header ── */}
            <div className="flex items-start justify-between mb-4 shrink-0">
                <div>
                    <h2 className="text-lg font-black text-brand-dark tracking-tight">{t.codigo}</h2>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                        <span className="font-medium">{origen}</span>
                        <span>→</span>
                        <span className="font-medium">{destino}</span>
                    </div>
                </div>
                <div className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-bold", cfg.color)}>
                    <Icon className="h-3.5 w-3.5" />
                    {cfg.label}
                </div>
            </div>

            {/* ── Timeline Stepper ── */}
            <div className="shrink-0 mb-5">
                {isTerminated ? (
                    <div className={cn("flex items-center gap-2 px-4 py-3 rounded-xl border", t.estado === 'rechazada' ? "bg-red-50 border-red-200" : "bg-gray-50 border-gray-200")}>
                        {t.estado === 'rechazada' ? <XCircle className="h-4 w-4 text-red-500" /> : <Ban className="h-4 w-4 text-gray-400" />}
                        <div>
                            <p className={cn("text-xs font-bold", t.estado === 'rechazada' ? "text-red-700" : "text-gray-600")}>
                                {t.estado === 'rechazada' ? 'Transferencia Rechazada' : 'Transferencia Cancelada'}
                            </p>
                            {(t as any).observaciones_rechazo && (
                                <p className="text-[10px] text-muted-foreground mt-0.5">{(t as any).observaciones_rechazo}</p>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="flex items-center justify-between px-2">
                        {STEPS.map((step, idx) => {
                            const completed = idx <= activeStep;
                            const isCurrent = idx === activeStep;
                            const StepIcon = step.icon;
                            return (
                                <React.Fragment key={step.key}>
                                    {idx > 0 && (
                                        <div className={cn("flex-1 h-0.5 mx-1", idx <= activeStep ? "bg-brand-primary" : "bg-[#E8E8ED]")} />
                                    )}
                                    <div className="flex flex-col items-center gap-1">
                                        <div className={cn(
                                            "w-9 h-9 rounded-full flex items-center justify-center border-2 transition-all",
                                            completed
                                                ? "bg-brand-primary border-brand-primary text-white"
                                                : "bg-white border-[#E8E8ED] text-muted-foreground/40",
                                            isCurrent && "ring-4 ring-brand-primary/20"
                                        )}>
                                            <StepIcon className="h-4 w-4" />
                                        </div>
                                        <span className={cn(
                                            "text-[9px] font-bold whitespace-nowrap",
                                            completed ? "text-brand-primary" : "text-muted-foreground/40"
                                        )}>
                                            {step.label}
                                        </span>
                                    </div>
                                </React.Fragment>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* ── Items Table ── */}
            <div className="shrink-0 mb-5">
                <h4 className="text-xs font-bold text-brand-dark mb-2">Ítems ({items.length})</h4>
                <div className="border border-[#E8E8ED] rounded-xl overflow-hidden">
                    <table className="w-full text-[11px]">
                        <thead>
                            <tr className="bg-[#F5F7FA]">
                                <th className="text-left px-3 py-2 font-bold text-brand-dark">Ítem</th>
                                <th className="text-center px-2 py-2 font-bold text-brand-dark w-16">Solicit.</th>
                                <th className="text-center px-2 py-2 font-bold text-brand-dark w-16">Enviada</th>
                                <th className="text-center px-2 py-2 font-bold text-brand-dark w-16">Recibida</th>
                            </tr>
                        </thead>
                        <tbody>
                            {items.map((item, idx) => (
                                <tr key={item.id || idx} className={cn(idx % 2 === 0 ? "bg-white" : "bg-[#FAFAFA]")}>
                                    <td className="px-3 py-1.5 font-medium text-brand-dark">{item.item_descripcion || `Ítem #${item.item_id}`}</td>
                                    <td className="px-2 py-1.5 text-center font-semibold">{item.cantidad_solicitada}</td>
                                    <td className="px-2 py-1.5 text-center">{item.cantidad_enviada ?? '—'}</td>
                                    <td className="px-2 py-1.5 text-center">{item.cantidad_recibida ?? '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ── Info ── */}
            <div className="shrink-0 mb-5 space-y-2">
                {t.observaciones && (
                    <div className="flex items-start gap-2 text-xs text-muted-foreground bg-[#F9F9FB] rounded-lg px-3 py-2">
                        <MessageSquare className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                        <span>{t.observaciones}</span>
                    </div>
                )}
                {t.requiere_pionetas && (
                    <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                        <span>Requiere {t.cantidad_pionetas || ''} pionetas</span>
                    </div>
                )}
                <div className="flex items-start gap-2 text-xs text-muted-foreground bg-[#F9F9FB] rounded-lg px-3 py-2">
                    <Users className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <div className="space-y-0.5">
                        <p>Solicitante: <span className="font-medium text-brand-dark">{(t as any).solicitante_nombre || '—'}</span> · {fmtDateTime(t.fecha_solicitud)}</p>
                        {t.fecha_aprobacion && <p>Aprobador: <span className="font-medium text-brand-dark">{(t as any).aprobador_nombre || '—'}</span> · {fmtDate(t.fecha_aprobacion)}</p>}
                        {t.fecha_despacho && <p>Despacho: {fmtDate(t.fecha_despacho)}</p>}
                        {t.fecha_recepcion && <p>Recepción: {fmtDate(t.fecha_recepcion)}</p>}
                    </div>
                </div>
            </div>

            {/* ── Actions ── */}
            {hasActions && !activeForm && (
                <div className="shrink-0 flex flex-wrap gap-2 mb-4">
                    {canAprobar && (
                        <button
                            onClick={() => setActiveForm('aprobar')}
                            disabled={actionLoading}
                            className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold text-white bg-green-600 rounded-xl hover:bg-green-700 disabled:opacity-50 transition-all shadow-sm"
                        >
                            <CheckCircle2 className="h-3.5 w-3.5" /> Aprobar
                        </button>
                    )}
                    {canRechazar && (
                        <button
                            onClick={() => setActiveForm('rechazar')}
                            disabled={actionLoading}
                            className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold text-white bg-red-600 rounded-xl hover:bg-red-700 disabled:opacity-50 transition-all shadow-sm"
                        >
                            <XCircle className="h-3.5 w-3.5" /> Rechazar
                        </button>
                    )}
                    {canDespachar && (
                        <button
                            onClick={async () => { await onDespachar(); }}
                            disabled={actionLoading}
                            className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-sm"
                        >
                            <Truck className="h-3.5 w-3.5" /> Despachar
                        </button>
                    )}
                    {canRecibir && (
                        <button
                            onClick={() => setActiveForm('recibir')}
                            disabled={actionLoading}
                            className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold text-white bg-brand-primary rounded-xl hover:bg-brand-primary/90 disabled:opacity-50 transition-all shadow-sm"
                        >
                            <PackageCheck className="h-3.5 w-3.5" /> Confirmar Recepción
                        </button>
                    )}
                    {canCancelar && (
                        <button
                            onClick={async () => { await onCancelar(); }}
                            disabled={actionLoading}
                            className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold text-muted-foreground bg-[#F0F0F5] rounded-xl hover:bg-[#E5E5EA] disabled:opacity-50 transition-all"
                        >
                            <Ban className="h-3.5 w-3.5" /> Cancelar
                        </button>
                    )}
                </div>
            )}

            {/* ── Approval Form ── */}
            {activeForm === 'aprobar' && (
                <div className="shrink-0 border border-green-200 bg-green-50/50 rounded-xl p-4 mb-4 space-y-3">
                    <h4 className="text-xs font-bold text-green-800">Aprobar Transferencia</h4>
                    <SearchableSelect
                        label="Origen (desde dónde se envía)"
                        options={obras.map(o => ({ value: o.id, label: o.nombre }))}
                        value={approvalOrigin}
                        onChange={(val) => setApprovalOrigin(val as number | null)}
                        placeholder="Seleccionar obra de origen..."
                    />
                    <div>
                        <label className="text-[10px] font-bold text-green-800 mb-1 block">Cantidades a enviar:</label>
                        <div className="space-y-1">
                            {items.map((item, idx) => (
                                <div key={item.id || idx} className="flex items-center justify-between bg-white rounded-lg px-3 py-1.5 text-xs">
                                    <span className="font-medium text-brand-dark truncate flex-1 mr-2">{item.item_descripcion}</span>
                                    <span className="text-muted-foreground mr-2">solic: {item.cantidad_solicitada}</span>
                                    <input
                                        type="number"
                                        min={0}
                                        max={item.cantidad_solicitada}
                                        value={approvalItems[idx]?.cantidad_enviada || 0}
                                        onChange={e => {
                                            const updated = [...approvalItems];
                                            updated[idx] = { ...updated[idx], cantidad_enviada: parseInt(e.target.value) || 0 };
                                            setApprovalItems(updated);
                                        }}
                                        className="w-14 px-1 py-0.5 border rounded text-center text-xs"
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="flex gap-2 pt-1">
                        <button
                            onClick={async () => {
                                if (!approvalOrigin) return;
                                const ok = await onAprobar({ origen_obra_id: approvalOrigin, items: approvalItems });
                                if (ok) setActiveForm(null);
                            }}
                            disabled={actionLoading || !approvalOrigin}
                            className="flex-1 py-2 text-xs font-bold text-white bg-green-600 rounded-xl hover:bg-green-700 disabled:opacity-50 transition-all"
                        >
                            {actionLoading ? 'Aprobando...' : 'Confirmar Aprobación'}
                        </button>
                        <button onClick={() => setActiveForm(null)} className="px-4 py-2 text-xs font-bold text-muted-foreground hover:text-brand-dark transition-colors">
                            Cancelar
                        </button>
                    </div>
                </div>
            )}

            {/* ── Reject Form ── */}
            {activeForm === 'rechazar' && (
                <div className="shrink-0 border border-red-200 bg-red-50/50 rounded-xl p-4 mb-4 space-y-3">
                    <h4 className="text-xs font-bold text-red-800">Rechazar Transferencia</h4>
                    <textarea
                        value={rejectMotivo}
                        onChange={e => setRejectMotivo(e.target.value)}
                        placeholder="Motivo del rechazo..."
                        className="w-full px-3 py-2 text-xs border border-red-200 rounded-xl resize-none h-16 focus:ring-2 focus:ring-red-300/20 outline-none"
                        required
                    />
                    <div className="flex gap-2">
                        <button
                            onClick={async () => {
                                if (!rejectMotivo.trim()) return;
                                const ok = await onRechazar(rejectMotivo);
                                if (ok) setActiveForm(null);
                            }}
                            disabled={actionLoading || !rejectMotivo.trim()}
                            className="flex-1 py-2 text-xs font-bold text-white bg-red-600 rounded-xl hover:bg-red-700 disabled:opacity-50 transition-all"
                        >
                            {actionLoading ? 'Rechazando...' : 'Confirmar Rechazo'}
                        </button>
                        <button onClick={() => setActiveForm(null)} className="px-4 py-2 text-xs font-bold text-muted-foreground hover:text-brand-dark transition-colors">
                            Cancelar
                        </button>
                    </div>
                </div>
            )}

            {/* ── Receive Form ── */}
            {activeForm === 'recibir' && (
                <div className="shrink-0 border border-brand-primary/30 bg-brand-primary/5 rounded-xl p-4 mb-4 space-y-3">
                    <h4 className="text-xs font-bold text-brand-dark">Confirmar Recepción</h4>
                    <div className="space-y-1">
                        {items.map((item, idx) => (
                            <div key={item.id || idx} className="flex items-center justify-between bg-white rounded-lg px-3 py-1.5 text-xs">
                                <span className="font-medium text-brand-dark truncate flex-1 mr-2">{item.item_descripcion}</span>
                                <span className="text-muted-foreground mr-2">enviada: {item.cantidad_enviada ?? item.cantidad_solicitada}</span>
                                <input
                                    type="number"
                                    min={0}
                                    value={receiveItems[idx]?.cantidad_recibida || 0}
                                    onChange={e => {
                                        const updated = [...receiveItems];
                                        updated[idx] = { ...updated[idx], cantidad_recibida: parseInt(e.target.value) || 0 };
                                        setReceiveItems(updated);
                                    }}
                                    className="w-14 px-1 py-0.5 border rounded text-center text-xs"
                                />
                            </div>
                        ))}
                    </div>
                    <div className="flex gap-2 pt-1">
                        <button
                            onClick={async () => {
                                const ok = await onRecibir(receiveItems);
                                if (ok) setActiveForm(null);
                            }}
                            disabled={actionLoading}
                            className="flex-1 py-2 text-xs font-bold text-white bg-brand-primary rounded-xl hover:bg-brand-primary/90 disabled:opacity-50 transition-all"
                        >
                            {actionLoading ? 'Confirmando...' : 'Confirmar Recepción'}
                        </button>
                        <button onClick={() => setActiveForm(null)} className="px-4 py-2 text-xs font-bold text-muted-foreground hover:text-brand-dark transition-colors">
                            Cancelar
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default TransferenciaDetail;
