import React from 'react';
import { CheckCircle2, Zap, AlertTriangle, Warehouse, MapPin, Check, Trash2, Plus, Split } from 'lucide-react';
import { cn } from '../../../utils/cn';
import { formatBodegaNombreResponsable } from '../../../utils/formatBodega';
import type { TransferenciaItem, ApprovalItemState, ApprovalSplit } from '../../../types/entities';
import type { StockLocation } from '../../../hooks/inventario/useTransferenciaDetail';
import FaltanteDecisionModal from '../FaltanteDecisionModal';

interface FaltanteModalState {
    isOpen: boolean;
    loading: boolean;
    faltantes: { item_descripcion: string; cantidad_faltante: number; unidad?: string }[];
}

interface AprobarData {
    origen_obra_id?: number | null;
    origen_bodega_id?: number | null;
    items: { item_id: number; splits: ApprovalSplit[] }[];
}

/**
 * Form de aprobación de catálogo: asignación de orígenes (splits multi-origen)
 * por ítem, auto-completar (greedy set-cover), validación de stock, y
 * FaltanteDecisionModal cuando se aprueba parcial. Extraído de
 * TransferenciaDetail.tsx (Fase 1) — única instancia (catálogo, items.length>0).
 * El estado vive en el hook useTransferenciaDetail y se pasa por props.
 */
export const AprobarForm: React.FC<{
    items: TransferenciaItem[];
    stockData: Record<number, StockLocation[]>;
    stockLoading: boolean;
    approvalItems: ApprovalItemState[];
    setApprovalItems: React.Dispatch<React.SetStateAction<ApprovalItemState[]>>;
    faltanteModal: FaltanteModalState;
    setFaltanteModal: React.Dispatch<React.SetStateAction<FaltanteModalState>>;
    onAprobar: (data: AprobarData) => Promise<boolean>;
    onCrearFaltante?: (transferenciaId: number) => Promise<{ id: number; codigo: string; items?: number; ya_existia?: boolean } | null>;
    transferenciaId: number;
    loading: boolean;
    onClose: () => void;
    onOpenItem: (itemId: number) => void;
}> = ({ items, stockData, stockLoading, approvalItems, setApprovalItems, faltanteModal, setFaltanteModal, onAprobar, onCrearFaltante, transferenciaId, loading, onClose, onOpenItem }) => {
    // Helpers locales ---------------------------------------------------
    const totalOfItem = (ai: ApprovalItemState) =>
        ai.splits.reduce((s, sp) => s + (sp.cantidad || 0), 0);

    // Suma de stock ya asignado a OTROS splits (excluye splitIdx) del mismo ítem.
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

    // Auto-completar: greedy set-cover. Minimiza el número de ubicaciones distintas.
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
        const stockTotal = locs.reduce((s, l) => s + Number(l.cantidad), 0);

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

    // Exigimos al menos 1 unidad sumada. Pero sí permitimos confirmar parcial (faltante).
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
        if (ok) onClose();
    };

    return (
        <>
            <div className="shrink-0 border border-border bg-card rounded-xl p-4 mb-4 space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                    <h4 className="text-sm font-bold text-foreground flex items-center gap-1.5">
                        <CheckCircle2 className="h-4 w-4 text-brand-primary" /> Aprobar Transferencia
                    </h4>
                    <button
                        type="button"
                        onClick={autoCompletar}
                        disabled={stockLoading}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-caption font-bold text-foreground bg-card border border-border rounded-lg hover:bg-muted disabled:opacity-50 transition-all"
                        title="Completa las cantidades solicitadas distribuyendo entre las ubicaciones con más stock"
                    >
                        <Zap className="h-3 w-3" />
                        Auto-completar
                    </button>
                </div>

                <p className="text-caption text-muted-foreground ml-1">
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
                            const sumAvailable = locations.reduce((s, l) => s + Number(l.cantidad), 0);

                            // ¿Mostrar chip "Enviar solo N (lo que hay)"?
                            const mostrarSoloLoQueHay =
                                totalSplits === 0 && sumAvailable > 0 && sumAvailable < solicitada;
                            // ¿Mostrar chip "Dividir entre N lugares"?
                            const mostrarDividir =
                                totalSplits === 0 && locations.length > 1 && sumAvailable > 0 &&
                                !locations.some(l => l.cantidad >= solicitada);

                            const borderColor = status.error
                                ? "bg-red-50/30 border-red-200 dark:bg-red-950/20 dark:border-red-900"
                                : status.completo
                                    ? "bg-card border-green-200 dark:border-green-900"
                                    : status.parcial
                                        ? "bg-amber-50/30 border-amber-200 dark:bg-amber-950/20 dark:border-amber-900"
                                        : "bg-card border-green-100 dark:border-green-900/50";

                            const currentOriginIds = new Set(
                                ai.splits.map(s => `${s.origen_obra_id || 'n'}:${s.origen_bodega_id || 'n'}`)
                            );

                            return (
                                <div key={item.id || idx} className={cn("rounded-lg border p-3 transition-colors", borderColor)}>
                                    {/* Header */}
                                    <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                                        <button type="button" onClick={() => onOpenItem(item.item_id)} className="text-xs font-bold text-brand-dark text-left hover:underline hover:text-brand-primary transition-colors cursor-pointer">
                                            {item.item_descripcion}
                                        </button>
                                        <span className="text-caption font-semibold text-muted-foreground">
                                            Solicitada: <span className="text-brand-dark">{solicitada}</span>
                                            {totalSplits > 0 && (
                                                <> · Enviando: <span className={cn("font-bold", status.completo ? "text-green-700 dark:text-green-300" : "text-amber-700 dark:text-amber-300")}>{totalSplits}</span></>
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
                                                            "text-micro px-2 py-1 rounded-lg border flex items-center gap-1 transition-all",
                                                            isActive
                                                                ? isBodega
                                                                    ? "bg-amber-100 border-amber-400 text-amber-800 font-bold ring-2 ring-amber-300/50 dark:bg-amber-500/20 dark:border-amber-700 dark:text-amber-200 dark:ring-amber-700/40"
                                                                    : "bg-green-100 border-green-400 text-green-800 font-bold ring-2 ring-green-300/50 dark:bg-green-500/20 dark:border-green-700 dark:text-green-200 dark:ring-green-700/40"
                                                                : isBodega
                                                                    ? "bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100 dark:bg-amber-950/30 dark:border-amber-900 dark:text-amber-300 dark:hover:bg-amber-900/40"
                                                                    : "bg-green-50 border-green-200 text-green-700 hover:bg-green-100 dark:bg-green-950/30 dark:border-green-900 dark:text-green-300 dark:hover:bg-green-900/40"
                                                        )}
                                                        title={`${isBodega ? 'Bodega' : 'Obra'}: ${isBodega ? formatBodegaNombreResponsable(loc.nombre, loc.responsable_nombre) : loc.nombre} — ${disponible} disponibles`}
                                                    >
                                                        {isBodega
                                                            ? <Warehouse className="h-2.5 w-2.5" />
                                                            : <MapPin className="h-2.5 w-2.5" />
                                                        }
                                                        {isBodega ? formatBodegaNombreResponsable(loc.nombre, loc.responsable_nombre) : loc.nombre}: <span className="font-bold">{disponible}</span>
                                                        {isActive && <Check className="h-2.5 w-2.5" />}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <p className="text-caption text-red-700 dark:text-red-300 mb-2 flex items-center gap-1">
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
                                                    <div key={sIdx} className="flex items-center gap-2 text-caption">
                                                        {loc?.type === 'bodega'
                                                            ? <Warehouse className="h-3 w-3 text-amber-700 dark:text-amber-300 shrink-0" />
                                                            : <MapPin className="h-3 w-3 text-green-700 dark:text-green-400 shrink-0" />
                                                        }
                                                        <span className="font-medium text-brand-dark truncate flex-1">
                                                            {loc?.nombre || 'Ubicación inválida'}
                                                            <span className="text-muted-foreground"> (máx {maxAqui})</span>
                                                        </span>
                                                        <input
                                                            type="number"
                                                            inputMode="decimal"
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
                                                                splitErr && "border-red-400 text-red-700 dark:border-red-700 dark:text-red-300"
                                                            )}
                                                        />
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                const newSplits = ai.splits.filter((_, i) => i !== sIdx);
                                                                updateSplits(idx, newSplits);
                                                            }}
                                                            className="text-muted-foreground hover:text-red-600 dark:hover:text-red-400 p-1 transition"
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
                                                    className="flex items-center gap-1 text-caption text-green-700 hover:text-green-800 dark:text-green-300 dark:hover:text-green-200 font-medium"
                                                >
                                                    <Plus className="h-3 w-3" /> Agregar otra ubicación
                                                </button>
                                            )}
                                        </div>
                                    )}

                                    {/* Quick-fix chips (sólo si no hay splits aún) */}
                                    {(mostrarSoloLoQueHay || mostrarDividir) && (
                                        <div className="flex flex-wrap gap-1.5 mt-2 pt-2 border-t border-dashed border-amber-200 dark:border-amber-900">
                                            <span className="text-caption text-muted-foreground w-full mb-0.5">💡 ¿Qué hacer?</span>
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
                                                    className="flex items-center gap-1 text-caption px-2.5 py-1 rounded-lg bg-amber-100 border border-amber-300 text-amber-800 font-medium hover:bg-amber-200 dark:bg-amber-500/15 dark:border-amber-800 dark:text-amber-200 dark:hover:bg-amber-500/25 transition"
                                                >
                                                    <Zap className="h-3 w-3" />
                                                    Enviar solo {sumAvailable} (lo que hay)
                                                </button>
                                            )}
                                            {mostrarDividir && (
                                                <button
                                                    type="button"
                                                    onClick={autoCompletar}
                                                    className="flex items-center gap-1 text-caption px-2.5 py-1 rounded-lg bg-blue-100 border border-blue-300 text-blue-800 font-medium hover:bg-blue-200 dark:bg-blue-500/15 dark:border-blue-800 dark:text-blue-200 dark:hover:bg-blue-500/25 transition"
                                                >
                                                    <Split className="h-3 w-3" />
                                                    Dividir entre {Math.min(locations.filter(l => l.cantidad > 0).length, 3)} lugares
                                                </button>
                                            )}
                                        </div>
                                    )}

                                    {/* Mensaje de error de split */}
                                    {status.error && (
                                        <p className="mt-1 text-micro text-red-700 dark:text-red-300 font-medium flex items-center gap-0.5">
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
                    <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-amber-50/50 border border-amber-200 dark:bg-amber-950/30 dark:border-amber-900 flex-wrap">
                        <div className="text-label font-medium text-amber-900 dark:text-amber-300 flex items-center gap-1.5">
                            🎯 {totalCompleto} {totalCompleto === 1 ? 'ítem listo' : 'ítems listos'}
                            {totalParcial > 0 && <> · {totalParcial} con stock parcial</>}
                            {totalVacio > 0 && <> · {totalVacio} sin asignar</>}
                        </div>
                        <button
                            type="button"
                            onClick={aprobarConLoDisponible}
                            disabled={stockLoading}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-label font-bold text-white bg-amber-600 rounded-lg hover:bg-amber-700 disabled:opacity-50 transition"
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
                        disabled={loading || !puedeConfirmar}
                        title={!puedeConfirmar
                            ? (hayError ? 'Hay errores de stock o cantidades' : 'No hay cantidades para enviar')
                            : undefined}
                        className="flex-1 py-2.5 text-xs font-bold text-white bg-green-600 rounded-xl hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                        {loading ? 'Aprobando...' : 'Confirmar Aprobación'}
                    </button>
                    <button onClick={onClose} className="px-4 py-2.5 text-xs font-bold text-muted-foreground hover:text-brand-dark transition-colors">
                        Cancelar
                    </button>
                </div>
            </div>

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
                        await onCrearFaltante(transferenciaId);
                    }
                    setFaltanteModal({ isOpen: false, loading: false, faltantes: [] });
                    if (ok) onClose();
                }}
                loading={faltanteModal.loading}
                faltantes={faltanteModal.faltantes}
            />
        </>
    );
};
