import React, { useState, useMemo, useEffect } from 'react';
import { cn } from '../../utils/cn';
import {
    ChevronLeft, FileText, CheckCircle2, PackageCheck,
    XCircle, Ban, AlertTriangle, MessageSquare, Users,
    MapPin, Package, Check, X as XIcon, Zap, Split, Plus, Minus, Trash2, Warehouse
} from 'lucide-react';
import { estadoConfig, tipoFlujoConfig } from './TransferenciasList';
import type { Transferencia, TransferenciaItem, ApprovalItemState, ApprovalSplit } from '../../types/entities';
import { useItemDetail } from '../../hooks/inventario/useItemDetail';
import ItemDetailModal from './ItemDetailModal';
import FaltanteDecisionModal from './FaltanteDecisionModal';

interface StockLocation {
    type: string;
    id: number;
    nombre: string;
    cantidad: number;
}

interface Props {
    transferencia: Transferencia;
    obras: { id: number; nombre: string }[];
    actionLoading: boolean;
    hasPermission: (p: string) => boolean;
    userId: number;
    onBack: () => void;
    onFetchStock: (itemIds: number[]) => Promise<Record<number, StockLocation[]>>;
    onAprobar: (data: {
        origen_obra_id?: number | null;
        origen_bodega_id?: number | null;
        items: Array<
            | { item_id: number; cantidad_enviada: number; origen_obra_id?: number | null; origen_bodega_id?: number | null }
            | { item_id: number; splits: { origen_obra_id: number | null; origen_bodega_id: number | null; cantidad: number }[] }
        >;
    }) => Promise<boolean>;
    onCrearFaltante?: (transferenciaId: number) => Promise<{ id: number; codigo: string; items: number } | null>;
    onRecibir: (items: { item_id: number; cantidad_recibida: number; observacion?: string }[]) => Promise<boolean>;
    onRechazar: (motivo: string) => Promise<boolean>;
    onRechazarRecepcion?: (motivo: string) => Promise<boolean>;
    onCancelar: () => Promise<boolean>;
}

// ── Timeline: 3 steps (no "Despachada") ──
const STEPS = [
    { key: 'pendiente', label: 'Solicitada', icon: FileText },
    { key: 'aprobada', label: 'Aprobada', icon: CheckCircle2 },
    { key: 'recibida', label: 'Recibida', icon: PackageCheck },
];

const STEP_INDEX: Record<string, number> = {
    pendiente: 0, aprobada: 1, en_transito: 1, recibida: 2,
    rechazada: -1, cancelada: -1,
};

const fmtDate = (d: string | null) =>
    d ? new Date(d).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' }) : '';

const fmtDateTime = (d: string | null) =>
    d ? new Date(d).toLocaleString('es-CL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';

const TransferenciaDetail: React.FC<Props> = ({
    transferencia: t, obras, actionLoading, hasPermission, userId,
    onBack, onFetchStock, onAprobar, onCrearFaltante, onRecibir, onRechazar, onRechazarRecepcion, onCancelar,
}) => {
    const items: TransferenciaItem[] = t.items || [];
    const cfg = estadoConfig[t.estado] || estadoConfig.pendiente;
    const itemDetail = useItemDetail();
    const Icon = cfg.icon;

    const origen = (t as any).origen_obra_nombre || (t as any).origen_bodega_nombre || '—';
    const destino = (t as any).destino_obra_nombre || (t as any).destino_bodega_nombre || '—';

    // ── Action permissions ──
    const canAprobar = t.estado === 'pendiente' && hasPermission('inventario.aprobar');
    const canRechazar = t.estado === 'pendiente' && hasPermission('inventario.aprobar');
    const canRecibir = (t.estado === 'en_transito' || t.estado === 'aprobada') && hasPermission('inventario.editar');
    const canRechazarRecepcion = t.estado === 'en_transito' && hasPermission('inventario.editar') && !!onRechazarRecepcion;
    const canCancelar = (t.estado === 'pendiente' || t.estado === 'en_transito') && (hasPermission('inventario.editar') || t.solicitante_id === userId);
    const hasActions = canAprobar || canRechazar || canRecibir || canRechazarRecepcion || canCancelar;

    // ── Inline form states ──
    const [activeForm, setActiveForm] = useState<'aprobar' | 'rechazar' | 'rechazar_recepcion' | 'recibir' | null>(null);

    // Approval state — cada ítem puede tener N splits (multi-origen).
    const [stockData, setStockData] = useState<Record<number, StockLocation[]>>({});
    const [stockLoading, setStockLoading] = useState(false);
    const [approvalItems, setApprovalItems] = useState<ApprovalItemState[]>([]);
    const [faltanteModal, setFaltanteModal] = useState<{
        isOpen: boolean;
        loading: boolean;
        faltantes: { item_descripcion: string; cantidad_faltante: number; unidad?: string }[];
    }>({ isOpen: false, loading: false, faltantes: [] });

    // Receive state
    const [receiveItems, setReceiveItems] = useState<{ item_id: number; cantidad_recibida: number; correcto: boolean; observacion: string }[]>([]);

    // Reject state
    const [rejectMotivo, setRejectMotivo] = useState('');

    // Reset forms when transferencia changes
    useMemo(() => {
        setActiveForm(null);
        setStockData({});
        setApprovalItems(items.map(i => ({
            item_id: i.item_id,
            cantidad_solicitada: i.cantidad_solicitada,
            splits: [],
        })));
        setReceiveItems(items.map(i => ({
            item_id: i.item_id,
            cantidad_recibida: i.cantidad_enviada || i.cantidad_solicitada,
            correcto: true,
            observacion: '',
        })));
        setRejectMotivo('');
    }, [t.id]);

    // Load stock when approval form opens
    useEffect(() => {
        if (activeForm === 'aprobar' && items.length > 0) {
            setStockLoading(true);
            onFetchStock(items.map(i => i.item_id)).then(data => {
                setStockData(data);
                setStockLoading(false);
            });
        }
    }, [activeForm]);

    // ── Timeline ──
    const activeStep = STEP_INDEX[t.estado] ?? -1;
    const isTerminated = t.estado === 'rechazada' || t.estado === 'cancelada';

    // Receive summary
    const correctCount = receiveItems.filter(i => i.correcto).length;

    return (
        <div className="flex flex-col flex-1 min-h-0 overflow-y-auto">
            {/* Mobile back */}
            <button onClick={onBack} className="md:hidden flex items-center gap-1 mb-3 text-xs text-muted-foreground hover:text-brand-dark transition-colors shrink-0">
                <ChevronLeft className="h-4 w-4" /> Volver
            </button>

            {/* ── Header ── */}
            <div className="flex items-start justify-between mb-4 shrink-0">
                <div>
                    <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-lg font-black text-brand-dark tracking-tight">{t.codigo}</h2>
                        {t.tipo_flujo && t.tipo_flujo !== 'solicitud' && (
                            <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded-full border", (tipoFlujoConfig[t.tipo_flujo] || tipoFlujoConfig.solicitud).color)}>
                                {(tipoFlujoConfig[t.tipo_flujo] || tipoFlujoConfig.solicitud).label}
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                        <span className="font-medium">{origen}</span>
                        <span>→</span>
                        <span className="font-medium">{destino}</span>
                    </div>
                    {t.motivo && (
                        <div className="text-[11px] text-muted-foreground mt-1 italic">
                            Motivo: {t.motivo}
                        </div>
                    )}
                </div>
                <div className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-bold", cfg.color)}>
                    <Icon className="h-3.5 w-3.5" />
                    {cfg.label}
                </div>
            </div>

            {/* ── Timeline Stepper (3 steps) ── */}
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
                    <div className="flex items-center justify-between px-4">
                        {STEPS.map((step, idx) => {
                            const completed = idx <= activeStep;
                            const isCurrent = idx === activeStep;
                            const StepIcon = step.icon;
                            return (
                                <React.Fragment key={step.key}>
                                    {idx > 0 && (
                                        <div className={cn("flex-1 h-0.5 mx-2", idx <= activeStep ? "bg-brand-primary" : "bg-[#E8E8ED]")} />
                                    )}
                                    <div className="flex flex-col items-center gap-1.5">
                                        <div className={cn(
                                            "w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all",
                                            completed
                                                ? "bg-brand-primary border-brand-primary text-white"
                                                : "bg-white border-[#E8E8ED] text-muted-foreground/40",
                                            isCurrent && "ring-4 ring-brand-primary/20 scale-110"
                                        )}>
                                            <StepIcon className="h-4.5 w-4.5" />
                                        </div>
                                        <span className={cn(
                                            "text-[10px] font-bold whitespace-nowrap",
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
                <h4 className="text-xs font-bold text-brand-dark mb-2 flex items-center gap-1.5">
                    <Package className="h-3.5 w-3.5" />
                    Items ({items.length})
                </h4>
                <div className="border border-[#E8E8ED] rounded-xl overflow-hidden">
                    <table className="w-full text-[11px]">
                        <thead>
                            <tr className="bg-[#F5F7FA]">
                                <th className="text-left px-3 py-2 font-bold text-brand-dark">Item</th>
                                <th className="text-center px-2 py-2 font-bold text-brand-dark w-16">Solicit.</th>
                                <th className="text-center px-2 py-2 font-bold text-brand-dark w-16">Enviada</th>
                                <th className="text-center px-2 py-2 font-bold text-brand-dark w-16">Recibida</th>
                            </tr>
                        </thead>
                        <tbody>
                            {items.map((item, idx) => (
                                <tr key={item.id || idx} className={cn(idx % 2 === 0 ? "bg-white" : "bg-[#FAFAFA]")}>
                                    <td className="px-3 py-1.5 font-medium text-brand-dark">
                                        <button type="button" onClick={() => itemDetail.openItem(item.item_id)} className="text-left hover:underline hover:text-brand-primary transition-colors cursor-pointer">
                                            {item.item_descripcion || `Item #${item.item_id}`}
                                        </button>
                                    </td>
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
                        {t.fecha_recepcion && <p>Recepcion: {fmtDate(t.fecha_recepcion)}</p>}
                    </div>
                </div>
            </div>

            {/* ── Action Buttons ── */}
            {hasActions && !activeForm && (
                <div className="shrink-0 flex flex-wrap gap-2 mb-4">
                    {canAprobar && (
                        <button onClick={() => setActiveForm('aprobar')} disabled={actionLoading}
                            className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold text-white bg-green-600 rounded-xl hover:bg-green-700 disabled:opacity-50 transition-all shadow-sm">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Aprobar
                        </button>
                    )}
                    {canRechazar && (
                        <button onClick={() => setActiveForm('rechazar')} disabled={actionLoading}
                            className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold text-white bg-red-600 rounded-xl hover:bg-red-700 disabled:opacity-50 transition-all shadow-sm">
                            <XCircle className="h-3.5 w-3.5" /> Rechazar
                        </button>
                    )}
                    {canRecibir && (
                        <button onClick={() => setActiveForm('recibir')} disabled={actionLoading}
                            className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold text-white bg-brand-primary rounded-xl hover:bg-brand-primary/90 disabled:opacity-50 transition-all shadow-sm">
                            <PackageCheck className="h-3.5 w-3.5" /> Confirmar Recepcion
                        </button>
                    )}
                    {canRechazarRecepcion && (
                        <button onClick={() => setActiveForm('rechazar_recepcion')} disabled={actionLoading}
                            className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold text-white bg-red-600 rounded-xl hover:bg-red-700 disabled:opacity-50 transition-all shadow-sm">
                            <XCircle className="h-3.5 w-3.5" /> Rechazar Recepción
                        </button>
                    )}
                    {canCancelar && (
                        <button onClick={async () => { await onCancelar(); }} disabled={actionLoading}
                            className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold text-muted-foreground bg-[#F0F0F5] rounded-xl hover:bg-[#E5E5EA] disabled:opacity-50 transition-all">
                            <Ban className="h-3.5 w-3.5" /> Cancelar
                        </button>
                    )}
                </div>
            )}

            {/* ════════════════════════════════════════════════
                ── APPROVAL FORM — splits multi-origen + quick-fix ──
               ════════════════════════════════════════════════ */}
            {activeForm === 'aprobar' && (() => {
                // Helpers locales ---------------------------------------------------
                const totalOfItem = (ai: ApprovalItemState) =>
                    ai.splits.reduce((s, sp) => s + (sp.cantidad || 0), 0);

                // Suma de stock ya asignado a OTROS splits (excluye splitIdx) del mismo ítem.
                // Útil para calcular cuánto queda disponible en una ubicación cuando ya
                // hay 1 split sacando de ahí.
                const otherSplitsFrom = (ai: ApprovalItemState, splitIdx: number, loc: StockLocation) =>
                    ai.splits.reduce((s, sp, i) => {
                        if (i === splitIdx) return s;
                        const sameLoc =
                            (loc.type === 'obra' && sp.origen_obra_id === loc.id) ||
                            (loc.type === 'bodega' && sp.origen_bodega_id === loc.id);
                        return sameLoc ? s + sp.cantidad : s;
                    }, 0);

                const updateSplits = (idx: number, splits: ApprovalSplit[]) => {
                    const updated = [...approvalItems];
                    updated[idx] = { ...updated[idx], splits };
                    setApprovalItems(updated);
                };

                const setPrimaryOrigin = (idx: number, loc: StockLocation) => {
                    // Un solo split con cantidad = min(solicitada, disponible) en esa ubicación.
                    const ai = approvalItems[idx];
                    const cantidad = Math.min(ai.cantidad_solicitada, loc.cantidad);
                    updateSplits(idx, [{
                        origen_obra_id: loc.type === 'obra' ? loc.id : null,
                        origen_bodega_id: loc.type === 'bodega' ? loc.id : null,
                        cantidad,
                    }]);
                };

                const clearItem = (idx: number) => updateSplits(idx, []);

                // Auto-completar:
                // Estrategia: greedy set-cover. Minimiza el número de ubicaciones
                //   distintas que el transportista debe visitar. En cada ronda elige la
                //   ubicación que cubre (sola, con stock suficiente) la MAYOR cantidad
                //   de ítems aún sin asignar; tie-break por mayor stock total disponible.
                //   Los ítems que ninguna ubicación individual puede cubrir caen al
                //   fallback por-ítem (split multi-ubicación, mayor stock primero).
                const autoCompletar = () => {
                    const locKey = (l: StockLocation) => `${l.type}_${l.id}`;

                    // itemIdx -> Map<locKey, {loc, cantidad}>
                    const perItemLocs = approvalItems.map(ai => {
                        const m = new Map<string, { loc: StockLocation; cantidad: number }>();
                        for (const loc of stockData[ai.item_id] || []) {
                            m.set(locKey(loc), { loc, cantidad: loc.cantidad });
                        }
                        return m;
                    });

                    const assigned = new Map<number, StockLocation>();
                    let remaining = approvalItems.map((_, i) => i);

                    while (remaining.length > 0) {
                        // Contar ítems restantes que cada ubicación puede cubrir sola
                        const coverage = new Map<string, { loc: StockLocation; items: number[]; totalDisp: number }>();
                        for (const i of remaining) {
                            const ai = approvalItems[i];
                            for (const [key, { loc, cantidad }] of perItemLocs[i].entries()) {
                                if (cantidad >= ai.cantidad_solicitada) {
                                    const existing = coverage.get(key);
                                    if (existing) {
                                        existing.items.push(i);
                                        existing.totalDisp += cantidad;
                                    } else {
                                        coverage.set(key, { loc, items: [i], totalDisp: cantidad });
                                    }
                                }
                            }
                        }

                        if (coverage.size === 0) break; // ninguna location cubre algún ítem restante

                        // Mejor: más ítems; tie-break: mayor stock disponible sumado
                        let best: { loc: StockLocation; items: number[]; totalDisp: number } | null = null;
                        for (const entry of coverage.values()) {
                            if (!best ||
                                entry.items.length > best.items.length ||
                                (entry.items.length === best.items.length && entry.totalDisp > best.totalDisp)) {
                                best = entry;
                            }
                        }
                        if (!best) break;

                        for (const i of best.items) assigned.set(i, best.loc);
                        remaining = remaining.filter(i => !assigned.has(i));
                    }

                    const updated = approvalItems.map((ai, i) => {
                        const loc = assigned.get(i);
                        if (loc) {
                            return {
                                ...ai,
                                splits: [{
                                    origen_obra_id: loc.type === 'obra' ? loc.id : null,
                                    origen_bodega_id: loc.type === 'bodega' ? loc.id : null,
                                    cantidad: ai.cantidad_solicitada,
                                }],
                            };
                        }
                        // Fallback: split multi-ubicación, mayor stock primero
                        const locs = [...(stockData[ai.item_id] || [])].sort((a, b) => b.cantidad - a.cantidad);
                        let restante = ai.cantidad_solicitada;
                        const splits: ApprovalSplit[] = [];
                        for (const l of locs) {
                            if (restante <= 0) break;
                            const toma = Math.min(l.cantidad, restante);
                            if (toma > 0) {
                                splits.push({
                                    origen_obra_id: l.type === 'obra' ? l.id : null,
                                    origen_bodega_id: l.type === 'bodega' ? l.id : null,
                                    cantidad: toma,
                                });
                                restante -= toma;
                            }
                        }
                        return { ...ai, splits };
                    });
                    setApprovalItems(updated);
                };

                // "Aprobar con lo disponible": ajusta todos los ítems con problema al
                // máximo sumable entre ubicaciones (sin pasar lo solicitado).
                const aprobarConLoDisponible = () => autoCompletar();

                // Validación por ítem ---------------------------------------------
                const itemStatus = approvalItems.map(ai => {
                    const total = totalOfItem(ai);
                    const locs = stockData[ai.item_id] || [];
                    const stockTotal = locs.reduce((s, l) => s + l.cantidad, 0);

                    // Validar cada split: ubicación existente con suficiente stock.
                    let errorPorSplit = false;
                    for (let i = 0; i < ai.splits.length; i++) {
                        const sp = ai.splits[i];
                        if (!sp.cantidad) continue;
                        if (!sp.origen_obra_id && !sp.origen_bodega_id) { errorPorSplit = true; break; }
                        const loc = locs.find(l =>
                            (l.type === 'obra' && l.id === sp.origen_obra_id) ||
                            (l.type === 'bodega' && l.id === sp.origen_bodega_id)
                        );
                        if (!loc) { errorPorSplit = true; break; }
                        const yaTomado = otherSplitsFrom(ai, i, loc);
                        if (sp.cantidad + yaTomado > loc.cantidad) { errorPorSplit = true; break; }
                    }

                    const excedeSolicitada = total > ai.cantidad_solicitada;
                    const sinStock = stockTotal === 0;
                    const completo = total === ai.cantidad_solicitada;
                    const parcial = total > 0 && total < ai.cantidad_solicitada;
                    const vacio = total === 0;

                    return {
                        total, stockTotal, sinStock,
                        error: errorPorSplit || excedeSolicitada,
                        completo, parcial, vacio,
                        // ¿Se puede "cubrir con lo disponible"?
                        puedeCubrirTodo: stockTotal >= ai.cantidad_solicitada,
                        maxDisponible: Math.min(stockTotal, ai.cantidad_solicitada),
                    };
                });

                const hayError = itemStatus.some(s => s.error);
                const totalCompleto = itemStatus.filter(s => s.completo).length;
                const totalParcial = itemStatus.filter(s => s.parcial).length;
                const totalVacio = itemStatus.filter(s => s.vacio).length;
                const hayFaltante = itemStatus.some(s => s.total < approvalItems[itemStatus.indexOf(s)]?.cantidad_solicitada);
                const hayAlgoParaEnviar = itemStatus.some(s => s.total > 0);

                // Puede haber casos sin splits y sin stock — permitir confirmar como "aprobar 0"
                // no tiene sentido: exigimos al menos 1 unidad sumada. Pero sí permitimos confirmar
                // parcial (faltante).
                const puedeConfirmar = !hayError && hayAlgoParaEnviar;

                // Construir lista de faltantes para pasar al modal
                const faltantesParaModal = items
                    .map((it, idx) => {
                        const s = itemStatus[idx];
                        const faltante = it.cantidad_solicitada - (s?.total || 0);
                        return faltante > 0
                            ? { item_descripcion: it.item_descripcion || `Ítem #${it.item_id}`, cantidad_faltante: faltante, unidad: it.unidad }
                            : null;
                    })
                    .filter((x): x is { item_descripcion: string; cantidad_faltante: number; unidad: string | undefined } => !!x);

                const sendApproval = async () => {
                    const payload = approvalItems.map(ai => ({
                        item_id: ai.item_id,
                        splits: ai.splits.filter(s => s.cantidad > 0),
                    }));
                    const primero = payload.find(p => p.splits.length)?.splits[0];
                    const ok = await onAprobar({
                        origen_obra_id: primero?.origen_obra_id || null,
                        origen_bodega_id: primero?.origen_bodega_id || null,
                        items: payload,
                    });
                    return ok;
                };

                const handleConfirm = async () => {
                    if (hayFaltante && onCrearFaltante) {
                        setFaltanteModal({ isOpen: true, loading: false, faltantes: faltantesParaModal });
                        return;
                    }
                    const ok = await sendApproval();
                    if (ok) setActiveForm(null);
                };

                return (
                <div className="shrink-0 border border-green-200 bg-green-50/30 rounded-xl p-4 mb-4 space-y-4">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                        <h4 className="text-sm font-bold text-green-800 flex items-center gap-1.5">
                            <CheckCircle2 className="h-4 w-4" /> Aprobar Transferencia
                        </h4>
                        <button
                            type="button"
                            onClick={autoCompletar}
                            disabled={stockLoading}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold text-green-700 bg-white border border-green-300 rounded-lg hover:bg-green-50 disabled:opacity-50 transition-all"
                            title="Completa las cantidades solicitadas distribuyendo entre las ubicaciones con más stock"
                        >
                            <Zap className="h-3 w-3" />
                            Auto-completar
                        </button>
                    </div>

                    <p className="text-[10px] text-muted-foreground ml-1">
                        Elige de dónde sale cada ítem. Si no hay stock suficiente en una sola ubicación, puedes dividir entre varias.
                    </p>

                    {/* Stock per item */}
                    <div className="space-y-3">
                        {stockLoading ? (
                            <p className="text-xs text-muted-foreground text-center py-4">Cargando disponibilidad...</p>
                        ) : (
                            items.map((item, idx) => {
                                const ai = approvalItems[idx];
                                if (!ai) return null;
                                const locationsRaw = stockData[item.item_id] || [];
                                // Bodegas siempre primero
                                const locations = [
                                    ...locationsRaw.filter(l => l.type === 'bodega'),
                                    ...locationsRaw.filter(l => l.type !== 'bodega'),
                                ];
                                const status = itemStatus[idx];
                                const hasStock = locations.length > 0;
                                const totalSplits = status.total;
                                const solicitada = ai.cantidad_solicitada;
                                const sumAvailable = locations.reduce((s, l) => s + l.cantidad, 0);

                                // ¿Mostrar chip "Enviar solo N (lo que hay)"?
                                const mostrarSoloLoQueHay =
                                    totalSplits === 0 && sumAvailable > 0 && sumAvailable < solicitada;
                                // ¿Mostrar chip "Dividir entre N lugares"?
                                const mostrarDividir =
                                    totalSplits === 0 && locations.length > 1 && sumAvailable > 0 &&
                                    !locations.some(l => l.cantidad >= solicitada);

                                const borderColor = status.error
                                    ? "bg-red-50/30 border-red-200"
                                    : status.completo
                                        ? "bg-white border-green-200"
                                        : status.parcial
                                            ? "bg-amber-50/30 border-amber-200"
                                            : "bg-white border-green-100";

                                const currentOriginIds = new Set(
                                    ai.splits.map(s => `${s.origen_obra_id || 'n'}:${s.origen_bodega_id || 'n'}`)
                                );

                                return (
                                    <div key={item.id || idx} className={cn("rounded-lg border p-3 transition-colors", borderColor)}>
                                        {/* Header */}
                                        <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                                            <button type="button" onClick={() => itemDetail.openItem(item.item_id)} className="text-xs font-bold text-brand-dark text-left hover:underline hover:text-brand-primary transition-colors cursor-pointer">
                                                {item.item_descripcion}
                                            </button>
                                            <span className="text-[10px] font-semibold text-muted-foreground">
                                                Solicitada: <span className="text-brand-dark">{solicitada}</span>
                                                {totalSplits > 0 && (
                                                    <> · Enviando: <span className={cn("font-bold", status.completo ? "text-green-700" : "text-amber-700")}>{totalSplits}</span></>
                                                )}
                                            </span>
                                        </div>

                                        {hasStock ? (
                                            <div className="flex flex-wrap gap-1.5 mb-2">
                                                {locations.map((loc, lIdx) => {
                                                    const key = `${loc.type === 'obra' ? loc.id : 'n'}:${loc.type === 'bodega' ? loc.id : 'n'}`;
                                                    const isActive = currentOriginIds.has(key);
                                                    const disponible = loc.cantidad;
                                                    const isBodega = loc.type === 'bodega';
                                                    return (
                                                        <button
                                                            key={lIdx}
                                                            type="button"
                                                            onClick={() => {
                                                                if (isActive && ai.splits.length === 1) clearItem(idx);
                                                                else if (!isActive) setPrimaryOrigin(idx, loc);
                                                            }}
                                                            className={cn(
                                                                "text-[9px] px-2 py-1 rounded-lg border flex items-center gap-1 transition-all",
                                                                isActive
                                                                    ? isBodega
                                                                        ? "bg-amber-100 border-amber-400 text-amber-800 font-bold ring-2 ring-amber-300/50"
                                                                        : "bg-green-100 border-green-400 text-green-800 font-bold ring-2 ring-green-300/50"
                                                                    : isBodega
                                                                        ? "bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100"
                                                                        : "bg-green-50 border-green-200 text-green-700 hover:bg-green-100"
                                                            )}
                                                            title={`${isBodega ? 'Bodega' : 'Obra'}: ${loc.nombre} — ${disponible} disponibles`}
                                                        >
                                                            {isBodega
                                                                ? <Warehouse className="h-2.5 w-2.5" />
                                                                : <MapPin className="h-2.5 w-2.5" />
                                                            }
                                                            {loc.nombre}: <span className="font-bold">{disponible}</span>
                                                            {isActive && <Check className="h-2.5 w-2.5" />}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            <p className="text-[10px] text-red-600 mb-2 flex items-center gap-1">
                                                <AlertTriangle className="h-3 w-3" /> Sin stock disponible
                                            </p>
                                        )}

                                        {/* Editor de splits (si hay ≥1 split) */}
                                        {ai.splits.length > 0 && (
                                            <div className="space-y-1.5 mb-2">
                                                {ai.splits.map((sp, sIdx) => {
                                                    const loc = locations.find(l =>
                                                        (l.type === 'obra' && l.id === sp.origen_obra_id) ||
                                                        (l.type === 'bodega' && l.id === sp.origen_bodega_id)
                                                    );
                                                    const yaTomadoEnOtros = loc ? otherSplitsFrom(ai, sIdx, loc) : 0;
                                                    const maxAqui = loc ? loc.cantidad - yaTomadoEnOtros : 0;
                                                    const splitErr = !loc || sp.cantidad > maxAqui;

                                                    return (
                                                        <div key={sIdx} className="flex items-center gap-2 text-[10px]">
                                                            {loc?.type === 'bodega'
                                                                ? <Warehouse className="h-3 w-3 text-amber-600 shrink-0" />
                                                                : <MapPin className="h-3 w-3 text-green-700 shrink-0" />
                                                            }
                                                            <span className="font-medium text-brand-dark truncate flex-1">
                                                                {loc?.nombre || 'Ubicación inválida'}
                                                                <span className="text-muted-foreground"> (máx {maxAqui})</span>
                                                            </span>
                                                            <input
                                                                type="number"
                                                                min={0}
                                                                max={maxAqui}
                                                                value={sp.cantidad}
                                                                onChange={e => {
                                                                    const val = parseInt(e.target.value) || 0;
                                                                    const newSplits = [...ai.splits];
                                                                    newSplits[sIdx] = { ...sp, cantidad: val };
                                                                    updateSplits(idx, newSplits);
                                                                }}
                                                                className={cn(
                                                                    "w-14 px-2 py-1 border rounded-lg text-center text-xs font-bold",
                                                                    splitErr && "border-red-400 text-red-700"
                                                                )}
                                                            />
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    const newSplits = ai.splits.filter((_, i) => i !== sIdx);
                                                                    updateSplits(idx, newSplits);
                                                                }}
                                                                className="text-muted-foreground hover:text-red-600 p-1 transition"
                                                                title="Quitar esta ubicación"
                                                            >
                                                                <Trash2 className="h-3 w-3" />
                                                            </button>
                                                        </div>
                                                    );
                                                })}

                                                {/* Agregar otra ubicación */}
                                                {ai.splits.length < locations.length && (
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            const usadas = new Set(ai.splits.map(s => `${s.origen_obra_id || 'n'}:${s.origen_bodega_id || 'n'}`));
                                                            const nueva = locations.find(l => {
                                                                const k = `${l.type === 'obra' ? l.id : 'n'}:${l.type === 'bodega' ? l.id : 'n'}`;
                                                                return !usadas.has(k) && l.cantidad > 0;
                                                            });
                                                            if (!nueva) return;
                                                            const restante = Math.max(0, solicitada - totalOfItem(ai));
                                                            const toma = Math.min(nueva.cantidad, restante);
                                                            updateSplits(idx, [
                                                                ...ai.splits,
                                                                {
                                                                    origen_obra_id: nueva.type === 'obra' ? nueva.id : null,
                                                                    origen_bodega_id: nueva.type === 'bodega' ? nueva.id : null,
                                                                    cantidad: toma,
                                                                },
                                                            ]);
                                                        }}
                                                        className="flex items-center gap-1 text-[10px] text-green-700 hover:text-green-800 font-medium"
                                                    >
                                                        <Plus className="h-3 w-3" /> Agregar otra ubicación
                                                    </button>
                                                )}
                                            </div>
                                        )}

                                        {/* Quick-fix chips (sólo si no hay splits aún) */}
                                        {(mostrarSoloLoQueHay || mostrarDividir) && (
                                            <div className="flex flex-wrap gap-1.5 mt-2 pt-2 border-t border-dashed border-amber-200">
                                                <span className="text-[10px] text-muted-foreground w-full mb-0.5">💡 ¿Qué hacer?</span>
                                                {mostrarSoloLoQueHay && (
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            // Toma TODO el disponible sumando ubicaciones en orden de mayor a menor
                                                            const sorted = [...locations].sort((a, b) => b.cantidad - a.cantidad);
                                                            let restante = sumAvailable;
                                                            const splits: ApprovalSplit[] = [];
                                                            for (const loc of sorted) {
                                                                if (restante <= 0) break;
                                                                const toma = Math.min(loc.cantidad, restante);
                                                                if (toma > 0) {
                                                                    splits.push({
                                                                        origen_obra_id: loc.type === 'obra' ? loc.id : null,
                                                                        origen_bodega_id: loc.type === 'bodega' ? loc.id : null,
                                                                        cantidad: toma,
                                                                    });
                                                                    restante -= toma;
                                                                }
                                                            }
                                                            updateSplits(idx, splits);
                                                        }}
                                                        className="flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-lg bg-amber-100 border border-amber-300 text-amber-800 font-medium hover:bg-amber-200 transition"
                                                    >
                                                        <Zap className="h-3 w-3" />
                                                        Enviar solo {sumAvailable} (lo que hay)
                                                    </button>
                                                )}
                                                {mostrarDividir && (
                                                    <button
                                                        type="button"
                                                        onClick={autoCompletar}
                                                        className="flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-lg bg-blue-100 border border-blue-300 text-blue-800 font-medium hover:bg-blue-200 transition"
                                                    >
                                                        <Split className="h-3 w-3" />
                                                        Dividir entre {Math.min(locations.filter(l => l.cantidad > 0).length, 3)} lugares
                                                    </button>
                                                )}
                                            </div>
                                        )}

                                        {/* Mensaje de error de split */}
                                        {status.error && (
                                            <p className="mt-1 text-[9px] text-red-600 font-medium flex items-center gap-0.5">
                                                <AlertTriangle className="h-2.5 w-2.5" /> Revisa las cantidades: exceden el stock o lo solicitado.
                                            </p>
                                        )}
                                    </div>
                                );
                            })
                        )}
                    </div>

                    {/* Resumen + mega-botón --------------------------------------- */}
                    {!stockLoading && (totalParcial > 0 || totalVacio > 0) && (
                        <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-amber-50/50 border border-amber-200 flex-wrap">
                            <div className="text-[11px] font-medium text-amber-900 flex items-center gap-1.5">
                                🎯 {totalCompleto} {totalCompleto === 1 ? 'ítem listo' : 'ítems listos'}
                                {totalParcial > 0 && <> · {totalParcial} con stock parcial</>}
                                {totalVacio > 0 && <> · {totalVacio} sin asignar</>}
                            </div>
                            <button
                                type="button"
                                onClick={aprobarConLoDisponible}
                                disabled={stockLoading}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold text-white bg-amber-600 rounded-lg hover:bg-amber-700 disabled:opacity-50 transition"
                                title="Ajusta todos los ítems al máximo disponible — puedes revisar antes de confirmar"
                            >
                                <Zap className="h-3 w-3" /> Aprobar con lo disponible
                            </button>
                        </div>
                    )}

                    {/* Confirm / Cancel */}
                    <div className="flex gap-2 pt-1">
                        <button
                            onClick={handleConfirm}
                            disabled={actionLoading || !puedeConfirmar}
                            title={!puedeConfirmar
                                ? (hayError ? 'Hay errores de stock o cantidades' : 'No hay cantidades para enviar')
                                : undefined}
                            className="flex-1 py-2.5 text-xs font-bold text-white bg-green-600 rounded-xl hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                        >
                            {actionLoading ? 'Aprobando...' : 'Confirmar Aprobación'}
                        </button>
                        <button onClick={() => setActiveForm(null)} className="px-4 py-2.5 text-xs font-bold text-muted-foreground hover:text-brand-dark transition-colors">
                            Cancelar
                        </button>
                    </div>
                </div>
                );
            })()}

            <FaltanteDecisionModal
                isOpen={faltanteModal.isOpen}
                onClose={() => setFaltanteModal({ isOpen: false, loading: false, faltantes: [] })}
                onConfirm={async (decision) => {
                    // handled via inline closure using current approvalItems — we re-run here
                    setFaltanteModal(m => ({ ...m, loading: true }));
                    const payload = approvalItems.map(ai => ({
                        item_id: ai.item_id,
                        splits: ai.splits.filter(s => s.cantidad > 0),
                    }));
                    const primero = payload.find(p => p.splits.length)?.splits[0];
                    const ok = await onAprobar({
                        origen_obra_id: primero?.origen_obra_id || null,
                        origen_bodega_id: primero?.origen_bodega_id || null,
                        items: payload,
                    });
                    if (ok && decision === 'crear_nueva' && onCrearFaltante) {
                        await onCrearFaltante(t.id);
                    }
                    setFaltanteModal({ isOpen: false, loading: false, faltantes: [] });
                    if (ok) setActiveForm(null);
                }}
                loading={faltanteModal.loading}
                faltantes={faltanteModal.faltantes}
            />

            {/* ════════════════════════════════════
                ── REJECT FORM ──
               ════════════════════════════════════ */}
            {activeForm === 'rechazar' && (
                <div className="shrink-0 border border-red-200 bg-red-50/30 rounded-xl p-4 mb-4 space-y-3">
                    <h4 className="text-sm font-bold text-red-800 flex items-center gap-1.5">
                        <XCircle className="h-4 w-4" /> Rechazar Transferencia
                    </h4>
                    <textarea
                        value={rejectMotivo}
                        onChange={e => setRejectMotivo(e.target.value)}
                        placeholder="Motivo del rechazo..."
                        className="w-full px-3 py-2 text-xs border border-red-200 rounded-xl resize-none h-20 focus:ring-2 focus:ring-red-300/20 outline-none"
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
                            className="flex-1 py-2.5 text-xs font-bold text-white bg-red-600 rounded-xl hover:bg-red-700 disabled:opacity-50 transition-all"
                        >
                            {actionLoading ? 'Rechazando...' : 'Confirmar Rechazo'}
                        </button>
                        <button onClick={() => setActiveForm(null)} className="px-4 py-2.5 text-xs font-bold text-muted-foreground hover:text-brand-dark transition-colors">
                            Cancelar
                        </button>
                    </div>
                </div>
            )}

            {/* ════════════════════════════════════
                ── REJECT RECEPTION FORM ──
               ════════════════════════════════════ */}
            {activeForm === 'rechazar_recepcion' && (
                <div className="shrink-0 border border-red-200 bg-red-50/30 rounded-xl p-4 mb-4 space-y-3">
                    <h4 className="text-sm font-bold text-red-800 flex items-center gap-1.5">
                        <XCircle className="h-4 w-4" /> Rechazar Recepción
                    </h4>
                    <p className="text-[11px] text-muted-foreground">
                        Rechaza físicamente el material recibido. La transferencia pasa a "rechazada" y el stock no se actualiza.
                    </p>
                    <textarea
                        value={rejectMotivo}
                        onChange={e => setRejectMotivo(e.target.value)}
                        placeholder="Motivo del rechazo de recepción..."
                        className="w-full px-3 py-2 text-xs border border-red-200 rounded-xl resize-none h-20 focus:ring-2 focus:ring-red-300/20 outline-none"
                        required
                    />
                    <div className="flex gap-2">
                        <button
                            onClick={async () => {
                                if (!rejectMotivo.trim() || !onRechazarRecepcion) return;
                                const ok = await onRechazarRecepcion(rejectMotivo);
                                if (ok) setActiveForm(null);
                            }}
                            disabled={actionLoading || !rejectMotivo.trim()}
                            className="flex-1 py-2.5 text-xs font-bold text-white bg-red-600 rounded-xl hover:bg-red-700 disabled:opacity-50 transition-all"
                        >
                            {actionLoading ? 'Rechazando...' : 'Confirmar Rechazo de Recepción'}
                        </button>
                        <button onClick={() => setActiveForm(null)} className="px-4 py-2.5 text-xs font-bold text-muted-foreground hover:text-brand-dark transition-colors">
                            Cancelar
                        </button>
                    </div>
                </div>
            )}

            {/* ════════════════════════════════════════════
                ── RECEIVE FORM — per-item confirmation ──
               ════════════════════════════════════════════ */}
            {activeForm === 'recibir' && (
                <div className="shrink-0 border border-brand-primary/30 bg-brand-primary/5 rounded-xl p-4 mb-4 space-y-4">
                    <h4 className="text-sm font-bold text-brand-dark flex items-center gap-1.5">
                        <PackageCheck className="h-4 w-4 text-brand-primary" /> Confirmar Recepcion
                    </h4>

                    <div className="space-y-2">
                        {items.map((item, idx) => {
                            const ri = receiveItems[idx];
                            if (!ri) return null;
                            return (
                                <div key={item.id || idx} className={cn(
                                    "bg-white rounded-xl border p-3 transition-all",
                                    ri.correcto ? "border-green-200" : "border-red-200"
                                )}>
                                    {/* Item name + correct toggle */}
                                    <div className="flex items-center justify-between mb-2">
                                        <button type="button" onClick={() => itemDetail.openItem(item.item_id)} className="text-xs font-bold text-brand-dark flex-1 mr-2 text-left hover:underline hover:text-brand-primary transition-colors cursor-pointer">{item.item_descripcion}</button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const updated = [...receiveItems];
                                                updated[idx] = { ...updated[idx], correcto: !updated[idx].correcto };
                                                setReceiveItems(updated);
                                            }}
                                            className={cn(
                                                "flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all",
                                                ri.correcto
                                                    ? "bg-green-50 border-green-300 text-green-700"
                                                    : "bg-red-50 border-red-300 text-red-700"
                                            )}
                                        >
                                            {ri.correcto ? <Check className="h-3 w-3" /> : <XIcon className="h-3 w-3" />}
                                            {ri.correcto ? 'Correcto' : 'Incorrecto'}
                                        </button>
                                    </div>

                                    {/* Quantity */}
                                    <div className="flex items-center gap-3 mb-1">
                                        <span className="text-[10px] text-muted-foreground">
                                            Enviada: <span className="font-semibold text-brand-dark">{item.cantidad_enviada ?? item.cantidad_solicitada}</span>
                                        </span>
                                        <div className="flex items-center gap-1.5">
                                            <span className="text-[10px] text-muted-foreground">Recibida:</span>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const updated = [...receiveItems];
                                                    const current = updated[idx].cantidad_recibida;
                                                    updated[idx] = { ...updated[idx], cantidad_recibida: Math.max(0, current - 1) };
                                                    setReceiveItems(updated);
                                                }}
                                                disabled={ri.cantidad_recibida <= 0}
                                                className="h-7 w-7 flex items-center justify-center rounded-lg border border-[#E8E8ED] bg-white text-brand-dark hover:border-brand-primary/30 hover:bg-brand-primary/5 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                                                aria-label="Restar 1"
                                            >
                                                <Minus className="h-3 w-3" />
                                            </button>
                                            <input
                                                type="number"
                                                min={0}
                                                value={ri.cantidad_recibida}
                                                onChange={e => {
                                                    const updated = [...receiveItems];
                                                    updated[idx] = { ...updated[idx], cantidad_recibida: parseInt(e.target.value) || 0 };
                                                    setReceiveItems(updated);
                                                }}
                                                className="w-14 px-2 py-1 border rounded-lg text-center text-xs font-bold"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const updated = [...receiveItems];
                                                    updated[idx] = { ...updated[idx], cantidad_recibida: updated[idx].cantidad_recibida + 1 };
                                                    setReceiveItems(updated);
                                                }}
                                                className="h-7 w-7 flex items-center justify-center rounded-lg border border-[#E8E8ED] bg-white text-brand-dark hover:border-brand-primary/30 hover:bg-brand-primary/5 transition-all"
                                                aria-label="Sumar 1"
                                            >
                                                <Plus className="h-3 w-3" />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Observation (if incorrect) */}
                                    {!ri.correcto && (
                                        <input
                                            type="text"
                                            placeholder="Observacion (que esta mal?)..."
                                            value={ri.observacion}
                                            onChange={e => {
                                                const updated = [...receiveItems];
                                                updated[idx] = { ...updated[idx], observacion: e.target.value };
                                                setReceiveItems(updated);
                                            }}
                                            className="w-full mt-1 px-2 py-1 text-[10px] border border-red-200 rounded-lg focus:ring-1 focus:ring-red-300 outline-none"
                                        />
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {/* Summary */}
                    <div className="text-xs text-center text-muted-foreground">
                        <span className="font-bold text-green-600">{correctCount}</span> de <span className="font-bold">{items.length}</span> items correctos
                    </div>

                    {/* Confirm / Cancel */}
                    <div className="flex gap-2">
                        <button
                            onClick={async () => {
                                const ok = await onRecibir(receiveItems.map(ri => ({
                                    item_id: ri.item_id,
                                    cantidad_recibida: ri.cantidad_recibida,
                                    // Solo se envía la observación si el receptor marcó "Incorrecto"
                                    // y escribió algo — queda guardada en la fila de discrepancia.
                                    observacion: !ri.correcto && ri.observacion.trim()
                                        ? ri.observacion.trim()
                                        : undefined,
                                })));
                                if (ok) setActiveForm(null);
                            }}
                            disabled={actionLoading}
                            className="flex-1 py-2.5 text-xs font-bold text-white bg-brand-primary rounded-xl hover:bg-brand-primary/90 disabled:opacity-50 transition-all"
                        >
                            {actionLoading ? 'Confirmando...' : 'Confirmar Recepcion'}
                        </button>
                        <button onClick={() => setActiveForm(null)} className="px-4 py-2.5 text-xs font-bold text-muted-foreground hover:text-brand-dark transition-colors">
                            Cancelar
                        </button>
                    </div>
                </div>
            )}

            {/* Item Detail Modal */}
            <ItemDetailModal
                isOpen={!!itemDetail.selectedItemId}
                onClose={itemDetail.closeItem}
                itemData={itemDetail.itemData}
                stockLocations={itemDetail.stockLocations}
                loading={itemDetail.loading}
                stockLoading={itemDetail.stockLoading}
            />
        </div>
    );
};

export default TransferenciaDetail;
