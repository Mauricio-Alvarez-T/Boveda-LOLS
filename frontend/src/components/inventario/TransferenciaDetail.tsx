import React, { useState, useMemo, useEffect } from 'react';
import { cn } from '../../utils/cn';
import {
    ChevronLeft, FileText, CheckCircle2, PackageCheck,
    XCircle, Ban, AlertTriangle, MessageSquare, Users,
    MapPin, Package, Check, X as XIcon, Zap
} from 'lucide-react';
import { estadoConfig } from './TransferenciasList';
import type { Transferencia, TransferenciaItem } from '../../types/entities';
import { useItemDetail } from '../../hooks/inventario/useItemDetail';
import ItemDetailModal from './ItemDetailModal';

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
    onAprobar: (data: { origen_obra_id?: number | null; origen_bodega_id?: number | null; items: { item_id: number; cantidad_enviada: number; origen_obra_id?: number | null; origen_bodega_id?: number | null }[] }) => Promise<boolean>;
    onRecibir: (items: { item_id: number; cantidad_recibida: number; observacion?: string }[]) => Promise<boolean>;
    onRechazar: (motivo: string) => Promise<boolean>;
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
    onBack, onFetchStock, onAprobar, onRecibir, onRechazar, onCancelar,
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
    const canCancelar = t.estado === 'pendiente' && (hasPermission('inventario.editar') || t.solicitante_id === userId);
    const hasActions = canAprobar || canRechazar || canRecibir || canCancelar;

    // ── Inline form states ──
    const [activeForm, setActiveForm] = useState<'aprobar' | 'rechazar' | 'recibir' | null>(null);

    // Approval state — origen POR ÍTEM (cada item_id puede salir de una ubicación distinta)
    const [stockData, setStockData] = useState<Record<number, StockLocation[]>>({});
    const [stockLoading, setStockLoading] = useState(false);
    const [approvalItems, setApprovalItems] = useState<{
        item_id: number;
        cantidad_enviada: number;
        origen_obra_id: number | null;
        origen_bodega_id: number | null;
    }[]>([]);

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
            cantidad_enviada: i.cantidad_solicitada,
            origen_obra_id: null,
            origen_bodega_id: null,
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
                    {canCancelar && (
                        <button onClick={async () => { await onCancelar(); }} disabled={actionLoading}
                            className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold text-muted-foreground bg-[#F0F0F5] rounded-xl hover:bg-[#E5E5EA] disabled:opacity-50 transition-all">
                            <Ban className="h-3.5 w-3.5" /> Cancelar
                        </button>
                    )}
                </div>
            )}

            {/* ════════════════════════════════════════════════
                ── APPROVAL FORM — origen POR ÍTEM ──
               ════════════════════════════════════════════════ */}
            {activeForm === 'aprobar' && (() => {
                // Helpers locales al render del form
                const setOrigenItem = (idx: number, loc: StockLocation | null) => {
                    const updated = [...approvalItems];
                    updated[idx] = {
                        ...updated[idx],
                        origen_obra_id: loc?.type === 'obra' ? loc.id : null,
                        origen_bodega_id: loc?.type === 'bodega' ? loc.id : null,
                    };
                    setApprovalItems(updated);
                };

                // Auto-seleccionar: por cada ítem, elegir la ubicación con MAYOR
                // cantidad que además cubra la cantidad solicitada. Si ninguna
                // ubicación cubre el total, elige la de mayor cantidad disponible
                // (el aprobador puede ajustar cantidad_enviada después).
                const autoSeleccionar = () => {
                    const updated = approvalItems.map((ai, idx) => {
                        const it = items[idx];
                        const locs = stockData[ai.item_id] || [];
                        if (!locs.length) return ai;
                        const solicitada = it.cantidad_solicitada;
                        const suficientes = locs.filter(l => l.cantidad >= solicitada);
                        const pool = suficientes.length ? suficientes : locs;
                        const best = pool.reduce((a, b) => (b.cantidad > a.cantidad ? b : a));
                        return {
                            ...ai,
                            origen_obra_id: best.type === 'obra' ? best.id : null,
                            origen_bodega_id: best.type === 'bodega' ? best.id : null,
                        };
                    });
                    setApprovalItems(updated);
                };

                // Validación: cada ítem con enviada>0 necesita un origen y stock suficiente.
                const filasConError = approvalItems.map((ai, idx) => {
                    if (ai.cantidad_enviada <= 0) return null;
                    if (!ai.origen_obra_id && !ai.origen_bodega_id) return 'sin_origen';
                    const locs = stockData[ai.item_id] || [];
                    const sel = locs.find(l =>
                        (l.type === 'obra' && l.id === ai.origen_obra_id) ||
                        (l.type === 'bodega' && l.id === ai.origen_bodega_id)
                    );
                    if (!sel || sel.cantidad < ai.cantidad_enviada) return 'stock_insuf';
                    return null;
                });
                const hayError = filasConError.some(e => e !== null);
                const todasConOrigen = approvalItems.every(ai =>
                    ai.cantidad_enviada === 0 || ai.origen_obra_id || ai.origen_bodega_id
                );

                return (
                <div className="shrink-0 border border-green-200 bg-green-50/30 rounded-xl p-4 mb-4 space-y-4">
                    <div className="flex items-center justify-between">
                        <h4 className="text-sm font-bold text-green-800 flex items-center gap-1.5">
                            <CheckCircle2 className="h-4 w-4" /> Aprobar Transferencia
                        </h4>
                        <button
                            type="button"
                            onClick={autoSeleccionar}
                            disabled={stockLoading}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold text-green-700 bg-white border border-green-300 rounded-lg hover:bg-green-50 disabled:opacity-50 transition-all"
                            title="Selecciona automáticamente la ubicación con mayor stock que cubra cada ítem"
                        >
                            <Zap className="h-3 w-3" />
                            Auto-seleccionar mejor ubicación
                        </button>
                    </div>

                    <p className="text-[10px] text-muted-foreground ml-1">
                        Cada ítem puede salir de una ubicación diferente. Haz click en los chips
                        para elegir el origen de cada uno, o usa "Auto-seleccionar".
                    </p>

                    {/* Stock per item */}
                    <div className="space-y-3">
                        <label className="text-[10px] font-bold text-green-800 uppercase tracking-wider">
                            <MapPin className="h-3 w-3 inline mr-1" />
                            Disponibilidad por item
                        </label>
                        {stockLoading ? (
                            <p className="text-xs text-muted-foreground text-center py-4">Cargando disponibilidad...</p>
                        ) : (
                            items.map((item, idx) => {
                                const ai = approvalItems[idx];
                                if (!ai) return null;
                                const locations = stockData[item.item_id] || [];
                                const hasStock = locations.length > 0;
                                const selected = locations.find(l =>
                                    (l.type === 'obra' && l.id === ai.origen_obra_id) ||
                                    (l.type === 'bodega' && l.id === ai.origen_bodega_id)
                                );
                                const errorTipo = filasConError[idx];

                                return (
                                    <div key={item.id || idx} className={cn(
                                        "rounded-lg border p-3 transition-colors",
                                        errorTipo ? "bg-red-50/30 border-red-200" : "bg-white border-green-100"
                                    )}>
                                        {/* Item header */}
                                        <div className="flex items-center justify-between mb-2">
                                            <button type="button" onClick={() => itemDetail.openItem(item.item_id)} className="text-xs font-bold text-brand-dark text-left hover:underline hover:text-brand-primary transition-colors cursor-pointer">{item.item_descripcion}</button>
                                            <span className="text-[10px] font-semibold text-muted-foreground">
                                                Solicitada: <span className="text-brand-dark">{item.cantidad_solicitada}</span>
                                            </span>
                                        </div>

                                        {/* Stock locations — clickable chips (per-item) */}
                                        {hasStock ? (
                                            <div className="flex flex-wrap gap-1.5 mb-2">
                                                {locations.map((loc, lIdx) => {
                                                    const isOrigin = selected
                                                        && selected.type === loc.type
                                                        && selected.id === loc.id;
                                                    const sufficient = loc.cantidad >= ai.cantidad_enviada;
                                                    const isClickable = sufficient || isOrigin;
                                                    return (
                                                        <button
                                                            key={lIdx}
                                                            type="button"
                                                            disabled={!isClickable}
                                                            onClick={() => {
                                                                if (isOrigin) setOrigenItem(idx, null);
                                                                else if (sufficient) setOrigenItem(idx, loc);
                                                            }}
                                                            className={cn(
                                                                "text-[9px] px-2 py-1 rounded-lg border flex items-center gap-1 transition-all",
                                                                isOrigin
                                                                    ? "bg-green-100 border-green-400 text-green-800 font-bold ring-2 ring-green-300/50 shadow-sm"
                                                                    : isClickable
                                                                        ? "bg-green-50 border-green-200 text-green-700 hover:bg-green-100 hover:border-green-300 cursor-pointer"
                                                                        : "bg-gray-50 border-gray-200 text-gray-400 cursor-not-allowed opacity-60"
                                                            )}
                                                            title={sufficient ? `${loc.nombre}: ${loc.cantidad} disponibles` : `${loc.nombre}: solo ${loc.cantidad} (insuficiente para ${ai.cantidad_enviada})`}
                                                        >
                                                            <MapPin className="h-2.5 w-2.5" />
                                                            {loc.nombre}: <span className="font-bold">{loc.cantidad}</span>
                                                            {isOrigin && <Check className="h-2.5 w-2.5" />}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            <p className="text-[10px] text-red-600 mb-2 flex items-center gap-1">
                                                <AlertTriangle className="h-3 w-3" /> Sin stock disponible
                                            </p>
                                        )}

                                        {/* Quantity to send + origen label */}
                                        <div className="flex items-center justify-between gap-2 flex-wrap">
                                            <div className="flex items-center gap-2">
                                                <span className="text-[10px] text-muted-foreground">Enviar:</span>
                                                <input
                                                    type="number"
                                                    min={0}
                                                    value={ai.cantidad_enviada}
                                                    onChange={e => {
                                                        const updated = [...approvalItems];
                                                        updated[idx] = { ...updated[idx], cantidad_enviada: parseInt(e.target.value) || 0 };
                                                        setApprovalItems(updated);
                                                    }}
                                                    className={cn(
                                                        "w-16 px-2 py-1 border rounded-lg text-center text-xs font-bold",
                                                        errorTipo === 'stock_insuf' && "border-red-400 text-red-700"
                                                    )}
                                                />
                                                {selected && (
                                                    <span className="text-[9px] text-green-700 font-medium flex items-center gap-0.5">
                                                        <Check className="h-2.5 w-2.5" />
                                                        desde {selected.nombre}
                                                    </span>
                                                )}
                                            </div>
                                            {errorTipo === 'sin_origen' && (
                                                <span className="text-[9px] text-red-600 font-medium flex items-center gap-0.5">
                                                    <AlertTriangle className="h-2.5 w-2.5" /> Selecciona un origen
                                                </span>
                                            )}
                                            {errorTipo === 'stock_insuf' && (
                                                <span className="text-[9px] text-red-600 font-medium flex items-center gap-0.5">
                                                    <AlertTriangle className="h-2.5 w-2.5" /> Excede stock del origen
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>

                    {/* Confirm / Cancel */}
                    <div className="flex gap-2 pt-1">
                        <button
                            onClick={async () => {
                                const payload = approvalItems.map(ai => ({
                                    item_id: ai.item_id,
                                    cantidad_enviada: ai.cantidad_enviada,
                                    origen_obra_id: ai.origen_obra_id,
                                    origen_bodega_id: ai.origen_bodega_id,
                                }));
                                // Origen de cabecera: tomar el del primer ítem con envío
                                const primero = payload.find(p => p.cantidad_enviada > 0) || payload[0];
                                const ok = await onAprobar({
                                    origen_obra_id: primero?.origen_obra_id || null,
                                    origen_bodega_id: primero?.origen_bodega_id || null,
                                    items: payload,
                                });
                                if (ok) setActiveForm(null);
                            }}
                            disabled={actionLoading || !todasConOrigen || hayError}
                            title={!todasConOrigen ? 'Faltan orígenes por seleccionar' : hayError ? 'Hay errores de stock' : undefined}
                            className="flex-1 py-2.5 text-xs font-bold text-white bg-green-600 rounded-xl hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                        >
                            {actionLoading ? 'Aprobando...' : 'Confirmar Aprobacion'}
                        </button>
                        <button onClick={() => setActiveForm(null)} className="px-4 py-2.5 text-xs font-bold text-muted-foreground hover:text-brand-dark transition-colors">
                            Cancelar
                        </button>
                    </div>
                </div>
                );
            })()}

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
