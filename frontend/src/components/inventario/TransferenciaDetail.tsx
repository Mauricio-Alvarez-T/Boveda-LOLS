import React, { useState, useMemo, useEffect } from 'react';
import { toast } from 'sonner';
import { cn } from '../../utils/cn';
import {
    ChevronLeft, FileText, CheckCircle2, PackageCheck, PackageOpen,
    XCircle, Ban, AlertTriangle, MessageSquare, Users,
    MapPin, Package, Check, X as XIcon, Zap, Split, Plus, Minus, Trash2, Warehouse, Send,
    ShoppingBag, Info, History, ChevronDown, ChevronUp,
} from 'lucide-react';
import { estadoConfig, tipoFlujoConfig } from './TransferenciasList';
import TransferenciaActionsMenu from './TransferenciaActionsMenu';
import type { Transferencia, TransferenciaItem, ApprovalItemState, ApprovalSplit, TransferenciaRecepcion } from '../../types/entities';
import { useItemDetail } from '../../hooks/inventario/useItemDetail';
import ItemDetailModal from './ItemDetailModal';
import FaltanteDecisionModal from './FaltanteDecisionModal';
import { Modal } from '../ui/Modal';
import { fmtFecha } from '../../utils/fechas';
import { formatBodegaNombreResponsable } from '../../utils/formatBodega';

// ════════════════════════════════════════════════════════════════════
// Paneles del flujo "Solicitud de Materiales" (ítems a comprar / custom).
// Module-level para montar con estado propio sólo al abrir la acción.
// ════════════════════════════════════════════════════════════════════
interface MatCustomItem {
    id: number;
    descripcion: string;
    cantidad: number;
    unidad: string | null;
    cantidad_aprobada?: number | null;
    aprobado?: boolean;
    nota_aprobador?: string | null;
    fuente?: 'comprar' | 'obra';
    origen_obra_id?: number | null;
    origen_obra_nombre?: string | null;
}
interface MatAprobacionEdit {
    id: number; descripcion: string; unidad: string;
    cantidad_aprobada: number; aprobado: boolean; nota_aprobador: string;
    fuente: 'comprar' | 'obra'; origen_obra_id: number | null;
}
interface MatNuevoItem { _k: number; descripcion: string; cantidad: number; unidad: string; observacion: string; fuente: 'comprar' | 'obra'; origen_obra_id: number | null; }

const MaterialesAprobacionPanel: React.FC<{
    items: MatCustomItem[];
    obras: { id: number; nombre: string }[];
    loading: boolean;
    onConfirm: (edits: MatAprobacionEdit[], nuevos: { descripcion: string; cantidad: number; unidad?: string; observacion?: string; fuente?: 'comprar' | 'obra'; origen_obra_id?: number | null }[]) => void;
    onCancel: () => void;
    /** En modal: el Modal aporta título y marco → no renderiza su card de color ni su header propio. */
    embedded?: boolean;
}> = ({ items, obras, loading, onConfirm, onCancel, embedded = false }) => {
    const [edits, setEdits] = useState<MatAprobacionEdit[]>(() =>
        items.map(it => ({
            id: it.id,
            descripcion: it.descripcion,
            unidad: it.unidad || '',
            cantidad_aprobada: it.cantidad_aprobada != null ? Number(it.cantidad_aprobada) : (Number(it.cantidad) || 1),
            aprobado: it.aprobado !== false,
            nota_aprobador: it.nota_aprobador || '',
            fuente: (it.fuente === 'obra' ? 'obra' : 'comprar') as 'comprar' | 'obra',
            origen_obra_id: it.origen_obra_id ?? null,
        }))
    );
    const [nuevos, setNuevos] = useState<MatNuevoItem[]>([]);
    // Divulgación progresiva: qué ítems tienen abierta la zona "avanzada".
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const toggleExp = (key: string) =>
        setExpanded(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
    const inputBase = "w-full h-11 px-3 text-sm rounded-lg border border-border bg-card outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary";

    const setEdit = (id: number, patch: Partial<MatAprobacionEdit>) =>
        setEdits(prev => prev.map(e => (e.id === id ? { ...e, ...patch } : e)));
    const setNuevo = (k: number, patch: Partial<MatNuevoItem>) =>
        setNuevos(prev => prev.map(n => (n._k === k ? { ...n, ...patch } : n)));
    const addNuevo = () => setNuevos(prev => [...prev, { _k: prev.length ? Math.max(...prev.map(p => p._k)) + 1 : 1, descripcion: '', cantidad: 1, unidad: '', observacion: '', fuente: 'comprar', origen_obra_id: null }]);
    const delNuevo = (k: number) => setNuevos(prev => prev.filter(n => n._k !== k));

    const aprobadosCount = edits.filter(e => e.aprobado).length + nuevos.filter(n => n.descripcion.trim()).length;
    // Bloquear si algún ítem "traer de obra" no tiene obra elegida.
    const faltaOrigen = edits.some(e => e.aprobado && e.fuente === 'obra' && !e.origen_obra_id)
        || nuevos.some(n => n.descripcion.trim() && n.fuente === 'obra' && !n.origen_obra_id);

    // Decisión por ítem: "¿Cómo se consigue?" (Comprar / Traer de obra) + select de
    // obra + nota de origen. Función que retorna JSX (no componente) para no remontar.
    const renderDecision = (
        fuente: 'comprar' | 'obra',
        origenObraId: number | null,
        nota: string,
        onFuente: (f: 'comprar' | 'obra') => void,
        onObra: (id: number | null) => void,
        onNota: (v: string) => void
    ) => (
        <div>
            <div className="text-sm font-semibold text-brand-dark mb-1.5">¿Cómo se consigue?</div>
            <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => onFuente('comprar')}
                    className={cn("h-11 inline-flex items-center justify-center gap-2 rounded-lg text-sm font-bold border-2 transition-colors",
                        fuente === 'comprar' ? "bg-amber-500 text-white border-amber-500" : "bg-card text-brand-dark border-border hover:border-amber-300")}>
                    <ShoppingBag className="h-4 w-4" /> Comprar
                </button>
                <button type="button" onClick={() => onFuente('obra')}
                    className={cn("h-11 inline-flex items-center justify-center gap-2 rounded-lg text-sm font-bold border-2 transition-colors",
                        fuente === 'obra' ? "bg-brand-primary text-white border-brand-primary" : "bg-card text-brand-dark border-border hover:border-brand-primary/40")}>
                    <MapPin className="h-4 w-4" /> Traer de obra/bodega
                </button>
            </div>
            {fuente === 'obra' && (
                <div className="mt-2 space-y-2">
                    <select value={origenObraId ?? ''} onChange={ev => onObra(ev.target.value ? Number(ev.target.value) : null)}
                        className={cn(inputBase, !origenObraId && "border-red-300")}>
                        <option value="">¿De qué obra se trae?</option>
                        {obras.map(o => <option key={o.id} value={o.id}>{o.nombre}</option>)}
                    </select>
                    <input value={nota} onChange={ev => onNota(ev.target.value)}
                        placeholder="Nota: dónde buscarlo (opcional)" className={inputBase} />
                </div>
            )}
        </div>
    );

    return (
        <div className={embedded
            ? "space-y-4"
            : "shrink-0 border border-border bg-card rounded-2xl p-4 md:p-5 mb-4 space-y-4"}>
            {embedded ? (
                <p className="text-xs text-muted-foreground">
                    Para cada ítem revisa la cantidad y elige si se <strong>compra</strong> o se <strong>trae de otra obra</strong>. Después confirma.
                </p>
            ) : (
                <div>
                    <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-5 w-5 text-brand-primary" />
                        <h4 className="text-base font-bold text-foreground">Revisar y aprobar materiales</h4>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                        Para cada ítem revisa la cantidad y elige si se <strong>compra</strong> o se <strong>trae de otra obra</strong>. Después confirma.
                    </p>
                </div>
            )}

            <ul className="space-y-3 max-h-[52vh] overflow-y-auto -mr-1 pr-1">
                {edits.map((e, idx) => {
                    const key = `e${e.id}`;
                    const isExp = expanded.has(key);
                    return (
                        <li key={e.id} className={cn("rounded-2xl border p-4", e.aprobado ? "border-border bg-card" : "border-border bg-muted/40 opacity-70")}>
                            {/* Encabezado: número + nombre grande + quitar/incluir */}
                            <div className="flex items-start gap-3">
                                <span className="shrink-0 mt-0.5 w-7 h-7 rounded-lg bg-amber-100 text-amber-800 text-xs font-black flex items-center justify-center dark:bg-amber-950/40 dark:text-amber-300">{idx + 1}</span>
                                <p className={cn("flex-1 min-w-0 text-base font-bold text-brand-dark leading-snug break-words", !e.aprobado && "line-through text-muted-foreground")}>{e.descripcion || 'Ítem'}</p>
                                <button type="button" onClick={() => setEdit(e.id, { aprobado: !e.aprobado })}
                                    className={cn("shrink-0 text-xs font-bold px-2.5 py-1.5 rounded-lg transition-colors", e.aprobado ? "text-muted-foreground hover:text-destructive hover:bg-destructive/10" : "text-green-700 dark:text-green-300 hover:bg-brand-primary/10")}>
                                    {e.aprobado ? 'Quitar' : 'Incluir'}
                                </button>
                            </div>

                            {e.aprobado && (
                                <div className="mt-3 space-y-3">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-semibold text-muted-foreground shrink-0">Cantidad</span>
                                        <input type="number" min={1} value={e.cantidad_aprobada}
                                            onChange={ev => setEdit(e.id, { cantidad_aprobada: parseInt(ev.target.value) || 0 })}
                                            className="w-20 h-11 px-2 text-base font-bold text-center rounded-lg border border-border bg-card outline-none focus:ring-2 focus:ring-brand-primary/30" />
                                        <input value={e.unidad} onChange={ev => setEdit(e.id, { unidad: ev.target.value })}
                                            placeholder="unidad (sacos, kg...)"
                                            className="flex-1 min-w-0 h-11 px-3 text-sm rounded-lg border border-border bg-card outline-none focus:ring-2 focus:ring-brand-primary/30" />
                                    </div>

                                    {renderDecision(e.fuente, e.origen_obra_id, e.nota_aprobador,
                                        f => setEdit(e.id, { fuente: f }),
                                        o => setEdit(e.id, { origen_obra_id: o }),
                                        v => setEdit(e.id, { nota_aprobador: v }))}

                                    <div>
                                        <button type="button" onClick={() => toggleExp(key)}
                                            className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 dark:text-green-300 hover:underline">
                                            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", isExp && "rotate-180")} />
                                            Corregir nombre{e.fuente === 'comprar' ? ' o nota' : ''}
                                        </button>
                                        {isExp && (
                                            <div className="mt-2 space-y-2">
                                                <input value={e.descripcion} onChange={ev => setEdit(e.id, { descripcion: ev.target.value })}
                                                    placeholder="Nombre del ítem" className={inputBase} />
                                                {e.fuente === 'comprar' && (
                                                    <input value={e.nota_aprobador} onChange={ev => setEdit(e.id, { nota_aprobador: ev.target.value })}
                                                        placeholder="Nota del aprobador (opcional)" className={inputBase} />
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </li>
                    );
                })}

                {nuevos.map(n => (
                    <li key={`n${n._k}`} className="rounded-2xl border border-dashed border-brand-primary/40 bg-brand-primary/[0.03] p-4">
                        <div className="flex items-start gap-3">
                            <span className="shrink-0 mt-1 px-2 h-6 rounded-lg bg-brand-primary/10 text-green-700 dark:text-green-300 text-caption font-black flex items-center justify-center">NUEVO</span>
                            <input value={n.descripcion} autoFocus onChange={ev => setNuevo(n._k, { descripcion: ev.target.value })}
                                placeholder="Nombre del ítem nuevo"
                                className="flex-1 min-w-0 h-11 px-3 text-base font-bold rounded-lg border border-border bg-card outline-none focus:ring-2 focus:ring-brand-primary/30" />
                            <button type="button" onClick={() => delNuevo(n._k)}
                                className="shrink-0 mt-1 text-xs font-bold px-2.5 py-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10">Quitar</button>
                        </div>
                        <div className="mt-3 space-y-3">
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-semibold text-muted-foreground shrink-0">Cantidad</span>
                                <input type="number" min={1} value={n.cantidad} onChange={ev => setNuevo(n._k, { cantidad: parseInt(ev.target.value) || 0 })}
                                    className="w-20 h-11 px-2 text-base font-bold text-center rounded-lg border border-border bg-card outline-none focus:ring-2 focus:ring-brand-primary/30" />
                                <input value={n.unidad} onChange={ev => setNuevo(n._k, { unidad: ev.target.value })} placeholder="unidad (sacos, kg...)"
                                    className="flex-1 min-w-0 h-11 px-3 text-sm rounded-lg border border-border bg-card outline-none focus:ring-2 focus:ring-brand-primary/30" />
                            </div>
                            {renderDecision(n.fuente, n.origen_obra_id, n.observacion,
                                f => setNuevo(n._k, { fuente: f }),
                                o => setNuevo(n._k, { origen_obra_id: o }),
                                v => setNuevo(n._k, { observacion: v }))}
                        </div>
                    </li>
                ))}
            </ul>

            <button type="button" onClick={addNuevo}
                className="w-full h-11 inline-flex items-center justify-center gap-2 text-sm font-bold text-green-700 dark:text-green-300 bg-brand-primary/5 hover:bg-brand-primary/10 border border-brand-primary/20 rounded-xl transition-colors">
                <Plus className="h-4 w-4" /> Agregar otro ítem
            </button>

            {aprobadosCount === 0 && (
                <p className="text-xs text-destructive">Quitaste todos los ítems. Si no se comprará nada, usa "Rechazar".</p>
            )}
            {faltaOrigen && aprobadosCount > 0 && (
                <p className="text-xs text-destructive">Elige de qué obra/bodega se trae en los ítems marcados "Traer de obra/bodega".</p>
            )}

            <div className="flex flex-col-reverse sm:flex-row gap-2 pt-1">
                <button onClick={onCancel} className="h-12 px-5 text-sm font-bold text-muted-foreground hover:text-brand-dark transition-colors">Cancelar</button>
                <button
                    onClick={() => onConfirm(
                        edits,
                        nuevos.filter(n => n.descripcion.trim()).map(n => ({
                            descripcion: n.descripcion.trim(),
                            cantidad: Number(n.cantidad) || 1,
                            unidad: n.unidad.trim() || undefined,
                            observacion: n.observacion.trim() || undefined,
                            fuente: n.fuente,
                            origen_obra_id: n.fuente === 'obra' ? n.origen_obra_id : null,
                        }))
                    )}
                    disabled={loading || aprobadosCount === 0 || faltaOrigen}
                    className="flex-1 h-12 text-sm font-bold text-white bg-green-600 rounded-xl hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all">
                    {loading ? 'Aprobando...' : 'Confirmar Aprobación'}
                </button>
            </div>
        </div>
    );
};

const MaterialesRecepcionPanel: React.FC<{
    loading: boolean;
    onConfirm: (observacion: string, tipo: 'parcial' | 'total') => void;
    onCancel: () => void;
    /** En modal: el Modal aporta título y marco → no renderiza su card de color ni su header propio. */
    embedded?: boolean;
    /** Si ya hubo viajes previos (estado recepcion_parcial), ajusta los textos. */
    yaIniciada?: boolean;
}> = ({ loading, onConfirm, onCancel, embedded = false, yaIniciada = false }) => {
    const [obs, setObs] = useState('');
    return (
        <div className={embedded
            ? "space-y-3"
            : "shrink-0 border border-blue-200 bg-blue-50/30 dark:border-blue-900 dark:bg-blue-950/20 rounded-xl p-4 mb-4 space-y-3"}>
            {!embedded && (
                <div className="flex items-center gap-2">
                    <PackageCheck className="h-4 w-4 text-blue-700 dark:text-blue-400" />
                    <h4 className="text-sm font-bold text-blue-800 dark:text-blue-300">Registrar entrega</h4>
                </div>
            )}
            <p className="text-label text-muted-foreground">
                Registra lo que llegó en este viaje. Si la entrega viene en <strong>varios viajes</strong>, usa
                {' '}<strong>"Registrar viaje"</strong> (la solicitud queda abierta y queda el registro con tu nombre);
                cuando llegue <strong>todo</strong>, usa <strong>"Cerrar entrega"</strong>. Anota diferencias o sobrantes si aplica.
            </p>
            <textarea value={obs} onChange={e => setObs(e.target.value)} rows={3}
                placeholder='Observaciones de este viaje (ej. "llegaron 10, se usaron 6, sobran 4")...'
                className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-card resize-none outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
            <div className="flex flex-col sm:flex-row gap-2 pt-1">
                <button onClick={() => onConfirm(obs.trim(), 'parcial')} disabled={loading}
                    className="flex-1 py-2.5 text-xs font-bold text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-900 rounded-xl hover:bg-blue-200 dark:hover:bg-blue-900/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all">
                    {loading ? '...' : (yaIniciada ? 'Registrar otro viaje' : 'Registrar viaje (parcial)')}
                </button>
                <button onClick={() => onConfirm(obs.trim(), 'total')} disabled={loading}
                    className="flex-1 py-2.5 text-xs font-bold text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all">
                    {loading ? 'Confirmando...' : 'Cerrar entrega (total)'}
                </button>
            </div>
            <button onClick={onCancel} className="w-full py-1.5 text-xs font-bold text-muted-foreground hover:text-brand-dark transition-colors">Cancelar</button>
        </div>
    );
};

// ── Helpers read-only del flujo "Solicitud de Materiales" ──
// Columna izquierda del detalle ("Lo que se pide"). Solo lectura: no edita
// nada ni participa en el payload de aprobación. Estilo fila tipo Vehículos.
const MatEmpty: React.FC<{ children: string }> = ({ children }) => (
    <p className="text-xs text-muted-foreground py-1 pl-1 italic">{children}</p>
);

const MatRequestRow: React.FC<{
    it: {
        descripcion: string; cantidad: number; cantidad_aprobada?: number | null;
        unidad: string | null; aprobado?: boolean; fuente?: 'comprar' | 'obra';
        origen_obra_nombre?: string | null; observacion?: string | null;
        nota_aprobador?: string | null; agregado_por_aprobador?: boolean;
    };
    estado: string;
}> = ({ it, estado }) => {
    const rechazado = it.aprobado === false;
    const ajustada = it.cantidad_aprobada != null && Number(it.cantidad_aprobada) !== Number(it.cantidad);
    const cant = it.cantidad_aprobada != null ? Number(it.cantidad_aprobada) : Number(it.cantidad);
    return (
        <div className={cn(
            "flex items-start justify-between gap-2 p-3 rounded-xl bg-muted/40 border border-border",
            rechazado && "opacity-60"
        )}>
            <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                <div className="flex flex-wrap items-center gap-1.5">
                    <span className={cn("text-xs font-bold text-brand-dark", rechazado && "line-through")}>{it.descripcion}</span>
                    {it.agregado_por_aprobador && (
                        <span className="px-1.5 py-0.5 rounded-full bg-brand-primary/10 text-green-700 dark:text-green-300 text-micro font-bold uppercase">+ aprobador</span>
                    )}
                    {rechazado && (
                        <span className="px-1.5 py-0.5 rounded-full bg-destructive/10 text-destructive text-micro font-bold uppercase">No se compra</span>
                    )}
                    {/* La fuente la decide el aprobador → chip solo cuando ya está decidida. */}
                    {estado !== 'pendiente' && !rechazado && it.fuente === 'obra' && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-brand-primary/10 text-green-700 dark:text-green-300 text-micro font-bold">
                            <MapPin className="h-2.5 w-2.5" /> Traer de {it.origen_obra_nombre || 'otra obra'}
                        </span>
                    )}
                    {estado !== 'pendiente' && !rechazado && it.fuente !== 'obra' && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground border border-border text-micro font-bold">
                            <ShoppingBag className="h-2.5 w-2.5" /> Comprar
                        </span>
                    )}
                </div>
                <p className="text-label text-muted-foreground">
                    {ajustada ? (
                        <><span className="line-through text-muted-foreground/60 mr-1">{Number(it.cantidad)}</span><span className="text-foreground font-bold">{cant}</span></>
                    ) : (
                        <span className="font-semibold">{cant}</span>
                    )}
                    {it.unidad ? ` ${it.unidad}` : ''}
                </p>
                {it.observacion && <p className="text-caption text-muted-foreground/70 italic">{it.observacion}</p>}
                {it.nota_aprobador && (
                    <p className="text-caption text-muted-foreground inline-flex items-center gap-1">
                        <MessageSquare className="h-2.5 w-2.5 shrink-0" /> {it.nota_aprobador}
                    </p>
                )}
            </div>
        </div>
    );
};

// Sección de detalle estilo Vehículos (etiqueta uppercase + contenido). Solo lectura.
const DetailSection: React.FC<{ icon: React.ReactNode; title: string; children: React.ReactNode }> = ({ icon, title, children }) => (
    <section>
        <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-black text-brand-dark/50 uppercase tracking-widest flex items-center gap-1.5">
                {icon} {title}
            </span>
        </div>
        <div className="space-y-1.5">{children}</div>
    </section>
);

interface StockLocation {
    type: string;
    id: number;
    nombre: string;
    cantidad: number;
    /** Solo aplica cuando type === 'bodega' (mig 060). */
    responsable_nombre?: string | null;
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
        // Solicitud de Materiales: ediciones del aprobador a ítems custom + nuevos.
        items_custom?: Array<{ id: number; descripcion?: string; unidad?: string; cantidad_aprobada?: number; aprobado?: boolean; nota_aprobador?: string; fuente?: 'comprar' | 'obra'; origen_obra_id?: number | null }>;
        items_custom_nuevos?: { descripcion: string; cantidad: number; unidad?: string; observacion?: string; fuente?: 'comprar' | 'obra'; origen_obra_id?: number | null }[];
    }) => Promise<boolean>;
    onCrearFaltante?: (transferenciaId: number) => Promise<{ id: number; codigo: string; items: number } | null>;
    onRecibir: (
        items: { item_id: number; cantidad_recibida: number; observacion?: string }[],
        tipo?: 'parcial' | 'total',
        observacion?: string
    ) => Promise<boolean>;
    /** Fetcher del historial de eventos de recepción. Inyectado por el panel padre. */
    onFetchRecepciones?: (id: number) => Promise<TransferenciaRecepcion[]>;
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

// recepcion_parcial entra como step 1 (junto con aprobada/en_transito) porque
// aún no termina el flujo — la TRF sigue abierta hasta el cierre total.
const STEP_INDEX: Record<string, number> = {
    pendiente: 0, aprobada: 1, en_transito: 1, recepcion_parcial: 1, recibida: 2,
    rechazada: -1, cancelada: -1,
};

// Auditoría 4.2: usar helper centralizado de fechas (utils/fechas.ts) para formato día/mes/año.
// fmtDateTime queda local porque incluye hora — caso particular no contemplado por el helper común.
const fmtDate = (d: string | null) => fmtFecha(d);

const fmtDateTime = (d: string | null) =>
    d ? new Date(d).toLocaleString('es-CL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';

const TransferenciaDetail: React.FC<Props> = ({
    transferencia: t, obras, actionLoading, hasPermission, userId,
    onBack, onFetchStock, onAprobar, onCrearFaltante, onRecibir, onFetchRecepciones, onRechazar, onRechazarRecepcion, onCancelar,
}) => {
    const items: TransferenciaItem[] = t.items || [];
    // Items personalizados (fuera de catálogo). Schema mínimo, no comparte interfaz
    // con TransferenciaItem porque no tiene item_id ni splits.
    interface TransferenciaItemCustom {
        id: number;
        descripcion: string;
        cantidad: number;
        unidad: string | null;
        observacion: string | null;
        compra_realizada?: boolean;
        // Aprobación (migración 070): el aprobador ajusta cantidad, quita ítems,
        // corrige descripción/unidad, agrega ítems y deja nota.
        cantidad_aprobada?: number | null;
        aprobado?: boolean;
        nota_aprobador?: string | null;
        agregado_por_aprobador?: boolean;
        // Origen (migración 071): comprar | traer de otra obra (sobrante).
        fuente?: 'comprar' | 'obra';
        origen_obra_id?: number | null;
        origen_obra_nombre?: string | null;
    }
    const itemsCustom: TransferenciaItemCustom[] = (t as { items_custom?: TransferenciaItemCustom[] }).items_custom || [];
    const cfg = estadoConfig[t.estado] || estadoConfig.pendiente;
    const itemDetail = useItemDetail();
    const Icon = cfg.icon;

    const origen = t.origen_obra_nombre
        || (t.origen_bodega_nombre
            ? formatBodegaNombreResponsable(t.origen_bodega_nombre, t.origen_bodega_responsable_nombre)
            : null)
        || '—';
    const destino = t.destino_obra_nombre
        || (t.destino_bodega_nombre
            ? formatBodegaNombreResponsable(t.destino_bodega_nombre, t.destino_bodega_responsable_nombre)
            : null)
        || '—';

    // ── Action permissions + SoD identity checks ──
    // SoD: solicitante ≠ aprobador ≠ transportista ≠ receptor. UI oculta el
    // botón cuando el usuario actual tiene rol previo en la TRF. Backend
    // valida igual con 403 (defensa en profundidad). El permiso especial
    // `sod_bypass` permite a un usuario ejecutar acciones consecutivas
    // (obras unipersonales, emergencias) — queda en audit log.
    const hasBypass = hasPermission('inventario.transferencias.sod_bypass');
    const isSolicitante = t.solicitante_id === userId;
    const isAprobador = (t as any).aprobador_id === userId;
    const isTransportista = (t as any).transportista_id === userId;

    const canAprobar =
        t.estado === 'pendiente' &&
        hasPermission('inventario.transferencias.aprobar') &&
        (!isSolicitante || hasBypass);
    const canRechazar = canAprobar;
    const canDespachar =
        t.estado === 'aprobada' &&
        hasPermission('inventario.transferencias.despachar') &&
        (!isAprobador || hasBypass);
    const canRecibir =
        (t.estado === 'en_transito' || t.estado === 'aprobada' || t.estado === 'recepcion_parcial') &&
        hasPermission('inventario.transferencias.recibir') &&
        // si estado aprobada (sin paso por despacho), bloquea si soy el aprobador
        (t.estado === 'aprobada' ? (!isAprobador || hasBypass) : (!isTransportista || hasBypass));
    // Rechazo de recepción: solo en en_transito (antes de recibir nada). Una
    // vez en recepcion_parcial el receptor ya movió stock, por lo que rechazar
    // dejaría inventario inconsistente. Para "abortar" desde parcial, usar
    // "Recepción Total" con cantidad=0 en los pendientes → cierra el flujo y
    // genera discrepancia por lo no llegado.
    const canRechazarRecepcion =
        t.estado === 'en_transito' &&
        hasPermission('inventario.transferencias.recibir') &&
        (!isTransportista || hasBypass) &&
        !!onRechazarRecepcion;
    // Cancelar: el solicitante siempre puede cancelar su propia TRF pendiente/aprobada
    // (caso de usuario que se arrepiente). Para cancelar TRF ajena se requiere permiso.
    // Punto 34: una transferencia DESPACHADA (en_transito) solo se cancela con el
    // permiso especial "Cancelar en Tránsito" (o sod_bypass) — su stock ya viaja.
    const puedeCancelarBase = hasPermission('inventario.transferencias.cancelar') || isSolicitante;
    const puedeCancelarEnTransito = hasPermission('inventario.transferencias.cancelar_en_transito') || hasBypass;
    const canCancelar =
        (['pendiente', 'aprobada'].includes(t.estado) && puedeCancelarBase) ||
        (t.estado === 'en_transito' && puedeCancelarEnTransito);

    // Banners SoD: alertar visualmente cuando el user actual no puede avanzar
    // la TRF por su rol previo. Educa al usuario sobre por qué la acción no
    // aparece (evita "¿por qué no veo el botón Aprobar?").
    const showSodBannerSolicitante =
        isSolicitante && t.estado === 'pendiente' &&
        hasPermission('inventario.transferencias.aprobar') && !hasBypass;
    const showSodBannerAprobador =
        isAprobador && t.estado === 'aprobada' &&
        hasPermission('inventario.transferencias.despachar') && !hasBypass;
    const showSodBannerTransportista =
        isTransportista && (t.estado === 'en_transito' || t.estado === 'recepcion_parcial') &&
        hasPermission('inventario.transferencias.recibir') && !hasBypass;
    // Pendiente entra en la lista porque RRHH/operaciones quieren notificar al
    // grupo WhatsApp para que el aprobador a cargo abra la app y revise la
    // factibilidad. El mensaje pendiente lleva las cantidades solicitadas
    // (la rama del `if` por estado en handleShareWhatsApp ya cubre eso).
    // recepcion_parcial también comparte (caso útil: "ya llegó la mitad, faltan X").
    const canCompartirWhatsApp = ['pendiente', 'aprobada', 'en_transito', 'recepcion_parcial', 'recibida'].includes(t.estado);
    const hasActions = canAprobar || canRechazar || canDespachar || canRecibir || canRechazarRecepcion || canCancelar || canCompartirWhatsApp;

    // ── Clipboard helper con fallback para navegadores sin clipboard API ──
    const copyToClipboard = async (text: string): Promise<boolean> => {
        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(text);
                return true;
            }
        } catch { /* fallback */ }
        try {
            const textArea = document.createElement('textarea');
            textArea.value = text;
            textArea.style.position = 'fixed';
            textArea.style.left = '-9999px';
            textArea.style.top = '0';
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            const ok = document.execCommand('copy');
            document.body.removeChild(textArea);
            return ok;
        } catch {
            return false;
        }
    };

    // ── WhatsApp share ──
    // Patrón replicado del módulo de asistencia (useAttendanceExport):
    //  1) Copia al portapapeles (respaldo ante mangling de URL)
    //  2) Muestra toast con botón "ENVIAR AHORA" — así window.open ocurre dentro
    //     de un user gesture fresco, evitando popup blockers en dispositivos
    //     lentos donde el gesto original se invalida tras los awaits.
    //  3) Fallback con setTimeout si todo el flujo peta.
    // Emojis construidos con String.fromCodePoint para blindar el encoding.
    const handleShareWhatsApp = async () => {
        const TOAST_ID = `wa-transfer-${t.id}`;
        const TRUCK = String.fromCodePoint(0x1F69B);
        const PIN = String.fromCodePoint(0x1F4CD);
        const TARGET = String.fromCodePoint(0x1F3AF);
        const BOX = String.fromCodePoint(0x1F4E6);
        const CART = String.fromCodePoint(0x1F6D2);
        const MEMO = String.fromCodePoint(0x1F4DD);
        const SPEECH = String.fromCodePoint(0x1F4AC);
        const WARN = String.fromCodePoint(0x26A0, 0xFE0F);
        const PERSON = String.fromCodePoint(0x1F464);
        const CHECK = String.fromCodePoint(0x2705);

        // Codepoints: 1F4C5 = 📅 calendar (fecha solicitud).
        const CALENDAR = String.fromCodePoint(0x1F4C5);

        const lines: string[] = [];
        lines.push(`${TRUCK} *TRANSFERENCIA ${t.codigo}*`);
        lines.push(`Estado: ${cfg.label}`);
        // Fecha de solicitud — requerimiento jefatura para notificación de
        // pendientes. fmtDateTime ya formatea día/mes hora:minuto en es-CL.
        if (t.fecha_solicitud) {
            lines.push(`${CALENDAR} Solicitada: ${fmtDateTime(t.fecha_solicitud)}`);
        }
        lines.push('');
        lines.push(`${PIN} *Retirar en:* ${origen}`);
        lines.push(`${TARGET} *Entregar en:* ${destino}`);
        lines.push('');
        if (items.length > 0) {
            // Etiqueta y cantidad dependen del estado para reflejar la columna real
            // (Solicit / Enviada / Recibida) — antes siempre mostraba enviada y
            // confundía al receptor cuando la recepción difería del despacho.
            // recepcion_parcial: ya llegó algo, falta más → muestra acumulado + pendiente.
            const itemsLabel =
                t.estado === 'recibida' ? 'Items recibidos' :
                t.estado === 'recepcion_parcial' ? 'Items con entrega en curso' :
                t.estado === 'aprobada' || t.estado === 'en_transito' ? 'Items enviados' :
                'Items solicitados';
            lines.push(`${BOX} *${itemsLabel} (${items.length}):*`);
            items.forEach((it) => {
                let cant: number;
                if (t.estado === 'recibida') {
                    cant = Number(it.cantidad_recibida) || Number(it.cantidad_enviada) || Number(it.cantidad_solicitada);
                } else if (t.estado === 'recepcion_parcial') {
                    cant = Number(it.cantidad_enviada) || Number(it.cantidad_solicitada);
                } else if (t.estado === 'aprobada' || t.estado === 'en_transito') {
                    cant = Number(it.cantidad_enviada) || Number(it.cantidad_solicitada);
                } else {
                    cant = Number(it.cantidad_solicitada);
                }
                const unidad = it.unidad ? ` ${it.unidad}` : '';
                const desc = it.item_descripcion || `Item #${it.item_id}`;
                lines.push(`• ${cant}${unidad} — ${desc}`);
                // En recepcion_parcial mostrar lo ya recibido y lo pendiente
                // — el aprobador/transportista necesita saber qué viaje queda.
                if (
                    t.estado === 'recepcion_parcial' &&
                    it.cantidad_enviada != null
                ) {
                    const recibida = Number(it.cantidad_recibida) || 0;
                    const pendiente = Number(it.cantidad_enviada) - recibida;
                    lines.push(`   _Recibidas: ${recibida} · Faltan: ${pendiente}_`);
                }
                // Si en recepción hubo discrepancia con lo enviado, anótala bajo el item
                // — facilita conciliación sin abrir la app.
                if (
                    t.estado === 'recibida' &&
                    it.cantidad_enviada != null &&
                    it.cantidad_recibida != null &&
                    Number(it.cantidad_enviada) !== Number(it.cantidad_recibida)
                ) {
                    const diff = Number(it.cantidad_recibida) - Number(it.cantidad_enviada);
                    const signo = diff > 0 ? '+' : '';
                    lines.push(`   _Enviadas: ${Number(it.cantidad_enviada)} (${signo}${diff})_`);
                }
                if (it.observacion) lines.push(`   _${it.observacion}_`);
            });
            lines.push('');
        }
        // Items personalizados (a comprar) — sección separada para que el
        // transportista/aprobador los identifique fácil.
        // Omitir ítems que el aprobador quitó (aprobado===false); usar cantidad
        // aprobada cuando exista.
        const customVisibles = itemsCustom.filter(it => it.aprobado !== false);
        const fmtCustom = (it: TransferenciaItemCustom) => {
            const cant = it.cantidad_aprobada != null ? it.cantidad_aprobada : it.cantidad;
            const unidad = it.unidad ? ` ${it.unidad}` : '';
            return `• ${cant}${unidad} — ${it.descripcion}`;
        };
        const aComprar = customVisibles.filter(it => it.fuente !== 'obra');
        const deObra = customVisibles.filter(it => it.fuente === 'obra');
        if (aComprar.length > 0) {
            lines.push(`${CART} *Por comprar (${aComprar.length}):*`);
            aComprar.forEach((it) => {
                lines.push(fmtCustom(it));
                if (it.observacion) lines.push(`   _${it.observacion}_`);
                if (it.nota_aprobador) lines.push(`   _Aprobador: ${it.nota_aprobador}_`);
            });
            lines.push('');
        }
        if (deObra.length > 0) {
            lines.push(`📍 *Traer de otra obra (${deObra.length}):*`);
            deObra.forEach((it) => {
                const origen = it.origen_obra_nombre ? ` → traer de ${it.origen_obra_nombre}` : '';
                lines.push(`${fmtCustom(it)}${origen}`);
                if (it.nota_aprobador) lines.push(`   _${it.nota_aprobador}_`);
                else if (it.observacion) lines.push(`   _${it.observacion}_`);
            });
            lines.push('');
        }
        if (t.motivo) lines.push(`${MEMO} *Motivo:* ${t.motivo}`);
        if (t.observaciones) lines.push(`${SPEECH} *Observaciones:* ${t.observaciones}`);
        if (t.requiere_pionetas) {
            lines.push(`${WARN} *Requiere ${t.cantidad_pionetas || ''} pionetas*`);
        }
        lines.push('');
        const solicitante = t.solicitante_nombre || '—';
        const aprobador = t.aprobador_nombre || '—';
        lines.push(`${PERSON} Solicitante: ${solicitante}`);
        lines.push(`${CHECK} Aprobador: ${aprobador}`);
        lines.push('');
        lines.push(`_Bóveda LOLS_`);

        const text = lines.join('\n');

        try {
            toast.loading('Preparando mensaje...', { id: TOAST_ID });

            const copied = await copyToClipboard(text);

            toast.success(copied ? '¡Mensaje listo!' : 'Mensaje preparado', {
                id: TOAST_ID,
                description: copied
                    ? 'Copiado al portapapeles. Pulsa ENVIAR AHORA para abrir WhatsApp.'
                    : 'Pulsa ENVIAR AHORA para abrir WhatsApp.',
                duration: 15000,
                action: {
                    label: 'ENVIAR AHORA',
                    onClick: async () => {
                        const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
                        if (isMobile && (navigator as any).share) {
                            try {
                                await (navigator as any).share({
                                    text,
                                    title: `Transferencia ${t.codigo}`,
                                });
                                return;
                            } catch (e: any) {
                                if (e?.name === 'AbortError') return;
                                // si falla share, caemos al open
                            }
                        }
                        // api.whatsapp.com preserva emojis mejor que wa.me
                        window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
                    },
                },
            });
        } catch (error: any) {
            console.error('Error preparing WhatsApp share', error);
            toast.error('Error al preparar el mensaje', { id: TOAST_ID, duration: 6000 });
            // Último recurso: abre WhatsApp tras un delay
            setTimeout(() => {
                window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
            }, 2000);
        }
    };

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

    // Receive state — cantidad_recibida representa "cantidad de ESTE viaje".
    // Para parciales, el default es lo PENDIENTE (enviada - recibida_acumulada),
    // no la enviada total. Permite que el usuario solo edite las cantidades que
    // efectivamente trajo el camión.
    const [receiveItems, setReceiveItems] = useState<{ item_id: number; cantidad_recibida: number; correcto: boolean; observacion: string }[]>([]);

    // Historial de eventos de recepción (parciales + total). Se carga cuando la
    // TRF está en recepcion_parcial o recibida y existe al menos 1 evento.
    const [recepciones, setRecepciones] = useState<TransferenciaRecepcion[]>([]);
    const [historialOpen, setHistorialOpen] = useState(false);

    // Cierre final con merma:
    // - `cierreFinal` checkbox dentro del form. Marca "esta es la última entrega"
    //   cuando hay pendientes sin recibir. Oculta el botón "Faltan más viajes"
    //   (contradictorio) y dispara directo el cierre total sin modal.
    // - `confirmMermaOpen` modal defensivo cuando el user clickea "Esta es toda
    //   la entrega" con cantidades < Falta SIN haber marcado el checkbox.
    const [cierreFinal, setCierreFinal] = useState(false);
    const [confirmMermaOpen, setConfirmMermaOpen] = useState(false);

    // Reject state
    const [rejectMotivo, setRejectMotivo] = useState('');

    // Helper: cantidad ya recibida acumulada por item (de transferencia_items).
    // Usada para calcular "pendiente" en cada viaje sucesivo.
    // Number() defensivo: mysql2 puede devolver DECIMAL como string.
    const recibidaPrevia = (item: TransferenciaItem) => Number(item.cantidad_recibida) || 0;
    const pendientePorItem = (item: TransferenciaItem) =>
        (Number(item.cantidad_enviada) || Number(item.cantidad_solicitada)) - recibidaPrevia(item);

    // Reset forms when transferencia changes.
    // useEffect (no useMemo): los useMemo no garantizan ejecutar side effects
    // de forma confiable y React puede skipearlos en re-renders idénticos.
    useEffect(() => {
        setActiveForm(null);
        setStockData({});
        setApprovalItems(items.map(i => ({
            item_id: i.item_id,
            cantidad_solicitada: i.cantidad_solicitada,
            splits: [],
        })));
        // Default cantidad este viaje = pendiente (lo que aún no ha llegado).
        // Permite al usuario simplemente confirmar si trajeron todo lo pendiente.
        setReceiveItems(items.map(i => ({
            item_id: i.item_id,
            cantidad_recibida: pendientePorItem(i),
            correcto: true,
            observacion: '',
        })));
        setRejectMotivo('');
        setRecepciones([]);
        setHistorialOpen(false);
        setCierreFinal(false);
        setConfirmMermaOpen(false);
        // Historial empieza cerrado pero se abre automáticamente cuando se
        // detectan eventos previos (efecto separado abajo).
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [t.id]);

    // Cargar historial de recepciones cuando la TRF tiene eventos previos.
    // Disparado al cambiar de TRF o cuando se cierra el form de recepción
    // (después de un parcial) para reflejar el nuevo evento.
    useEffect(() => {
        if (!onFetchRecepciones) return;
        if (t.estado !== 'recepcion_parcial' && t.estado !== 'recibida') return;
        let cancelled = false;
        onFetchRecepciones(t.id).then(rows => {
            if (cancelled) return;
            setRecepciones(rows);
            // Default open si hay 1+ viajes previos — info contextual relevante
            // al receptor (saber qué llegó antes para ajustar el viaje actual).
            if (rows.length > 0) setHistorialOpen(true);
        });
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [t.id, t.estado, activeForm]);

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

    // Nota: `correcto` y `observacion` del state se mantienen en el shape por
    // back-compat con onRecibir(), pero ya no se exponen en UI tras el rediseño
    // V2. Toda discrepancia se infiere de la diferencia entre enviada y recibida.

    // Flujo "Solicitud de Materiales" (ítems custom, sin catálogo) usa el layout
    // de dos columnas (izq = lo que se pide, der = acciones). El catálogo
    // (items.length > 0) se mantiene 1:1 con renderCatalogo().
    const isMateriales = items.length === 0;

    const renderCatalogo = () => (
        <div className="flex flex-col flex-1 min-h-0 overflow-y-auto p-3 md:p-6">
            {/* Mobile back */}
            <button onClick={onBack} className="md:hidden flex items-center gap-1 mb-3 text-xs text-muted-foreground hover:text-brand-dark transition-colors shrink-0">
                <ChevronLeft className="h-4 w-4" /> Volver
            </button>

            {/* ── Header — chip estado + menú "Acciones ▾" ── */}
            <div className="flex items-start justify-between gap-3 mb-4 shrink-0">
                <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-lg font-black text-brand-dark tracking-tight">{t.codigo}</h2>
                        {t.tipo_flujo && t.tipo_flujo !== 'solicitud' && (
                            <span className={cn("text-caption font-bold px-1.5 py-0.5 rounded-md border", (tipoFlujoConfig[t.tipo_flujo] || tipoFlujoConfig.solicitud).color)}>
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
                        <div className="text-label text-muted-foreground mt-1 italic">
                            Motivo: {t.motivo}
                        </div>
                    )}
                </div>
                <div className="flex items-start gap-2 shrink-0">
                    <div className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-bold shrink-0", cfg.color)}>
                        <Icon className="h-3.5 w-3.5" />
                        {cfg.label}
                    </div>
                    {!activeForm && (
                        <TransferenciaActionsMenu
                            canAprobar={canAprobar}
                            canRechazar={canRechazar}
                            canRecibir={canRecibir}
                            canRechazarRecepcion={canRechazarRecepcion}
                            canCancelar={canCancelar}
                            canCompartirWhatsApp={canCompartirWhatsApp}
                            actionLoading={actionLoading}
                            onAprobar={() => setActiveForm('aprobar')}
                            onRechazar={() => setActiveForm('rechazar')}
                            onRecibir={() => setActiveForm('recibir')}
                            onRechazarRecepcion={() => setActiveForm('rechazar_recepcion')}
                            onCancelar={async () => { await onCancelar(); }}
                            onWhatsApp={handleShareWhatsApp}
                            isPendiente={t.estado === 'pendiente'}
                        />
                    )}
                </div>
            </div>

            {/* ── Timeline Stepper (3 steps) ── */}
            <div className="shrink-0 mb-5">
                {isTerminated ? (
                    <div className={cn("flex items-center gap-2 px-4 py-3 rounded-xl border", t.estado === 'rechazada' ? "bg-red-50 border-red-200 dark:bg-red-950/40 dark:border-red-900" : "bg-muted border-border")}>
                        {t.estado === 'rechazada' ? <XCircle className="h-4 w-4 text-red-500" /> : <Ban className="h-4 w-4 text-muted-foreground" />}
                        <div>
                            <p className={cn("text-xs font-bold", t.estado === 'rechazada' ? "text-red-700 dark:text-red-300" : "text-muted-foreground")}>
                                {t.estado === 'rechazada' ? 'Transferencia Rechazada' : 'Transferencia Cancelada'}
                            </p>
                            {t.observaciones_rechazo && (
                                <p className="text-caption text-muted-foreground mt-0.5">{t.observaciones_rechazo}</p>
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
                                        <div className={cn("flex-1 h-0.5 mx-2", idx <= activeStep ? "bg-brand-primary" : "bg-muted")} />
                                    )}
                                    <div className="flex flex-col items-center gap-1.5">
                                        <div className={cn(
                                            "w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all",
                                            completed
                                                ? "bg-brand-primary border-brand-primary text-white"
                                                : "bg-card border-border text-muted-foreground/40",
                                            isCurrent && "ring-4 ring-brand-primary/20 scale-110"
                                        )}>
                                            <StepIcon className="h-4.5 w-4.5" />
                                        </div>
                                        <span className={cn(
                                            "text-caption font-bold whitespace-nowrap",
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
            {items.length > 0 && (
                <div className="shrink-0 mb-5">
                    <h4 className="text-xs font-bold text-brand-dark mb-2 flex items-center gap-1.5">
                        <Package className="h-3.5 w-3.5" />
                        Items ({items.length})
                    </h4>
                    <div className="border border-border rounded-xl overflow-hidden">
                        <table className="w-full text-label">
                            <thead>
                                <tr className="bg-muted">
                                    <th className="text-left px-3 py-2 font-bold text-brand-dark">Item</th>
                                    <th className="text-center px-2 py-2 font-bold text-brand-dark w-16">Solicit.</th>
                                    <th className="text-center px-2 py-2 font-bold text-brand-dark w-16">Enviada</th>
                                    <th className="text-center px-2 py-2 font-bold text-brand-dark w-16">Recibida</th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.map((item, idx) => (
                                    <tr key={item.id || idx} className={cn(idx % 2 === 0 ? "bg-card" : "bg-muted/40")}>
                                        <td className="px-3 py-1.5 font-medium text-brand-dark">
                                            <button type="button" onClick={() => itemDetail.openItem(item.item_id)} className="text-left hover:underline hover:text-brand-primary transition-colors cursor-pointer">
                                                {item.item_descripcion || `Item #${item.item_id}`}
                                            </button>
                                        </td>
                                        <td className="px-2 py-1.5 text-center font-semibold">{Number(item.cantidad_solicitada)}</td>
                                        <td className="px-2 py-1.5 text-center">{item.cantidad_enviada != null ? Number(item.cantidad_enviada) : '—'}</td>
                                        <td className="px-2 py-1.5 text-center">{item.cantidad_recibida != null ? Number(item.cantidad_recibida) : '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ── Historial de recepciones (parciales + total) ──
                Solo se muestra si hubo al menos 1 evento. Permite al receptor
                ver cuándo y qué llegó en viajes anteriores antes de registrar
                el siguiente. Datos vienen del endpoint GET /:id/recepciones. */}
            {recepciones.length > 0 && (
                <div className="shrink-0 mb-5">
                    <button
                        type="button"
                        onClick={() => setHistorialOpen(o => !o)}
                        className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-muted/60 hover:bg-muted border border-border rounded-xl transition-all"
                    >
                        <h4 className="text-xs font-bold text-brand-dark flex items-center gap-1.5">
                            <History className="h-3.5 w-3.5" />
                            Historial de recepciones ({recepciones.length})
                        </h4>
                        {historialOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                    </button>
                    {historialOpen && (
                        <div className="mt-2 space-y-2">
                            {recepciones.map((rec, idx) => (
                                <div
                                    key={rec.id}
                                    className="border border-border rounded-xl p-3 bg-muted/40"
                                >
                                    <div className="flex items-center justify-between mb-1.5">
                                        <div className="flex items-center gap-1.5">
                                            <span className="text-caption font-bold text-muted-foreground">#{idx + 1}</span>
                                            <span className="text-caption font-bold px-2 py-0.5 rounded-full border border-border bg-muted text-muted-foreground">
                                                {rec.tipo === 'total' ? 'Total · cierre' : 'Parcial'}
                                            </span>
                                            <span className="text-caption text-muted-foreground">{fmtDateTime(rec.fecha_recepcion)}</span>
                                        </div>
                                        <span className="text-caption text-muted-foreground">
                                            por <strong className="text-brand-dark">{rec.receptor_nombre || `Usuario #${rec.receptor_id}`}</strong>
                                        </span>
                                    </div>
                                    <ul className="space-y-0.5 ml-2">
                                        {rec.items.map(ri => (
                                            <li key={ri.id} className="text-label flex justify-between">
                                                <span className="text-brand-dark">
                                                    <span className="font-semibold">{Number(ri.cantidad_recibida)}</span>
                                                    {ri.unidad ? <span className="text-muted-foreground"> {ri.unidad}</span> : null}
                                                    <span className="text-muted-foreground"> · {ri.item_descripcion || `Item #${ri.item_id}`}</span>
                                                </span>
                                                {ri.observacion && (
                                                    <span className="text-caption text-muted-foreground italic ml-2">{ri.observacion}</span>
                                                )}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* ── Items Personalizados (a comprar) ── */}
            {itemsCustom.length > 0 && (
                <div className="shrink-0 mb-5">
                    <h4 className="text-xs font-bold text-brand-dark mb-2 flex items-center gap-1.5">
                        <ShoppingBag className="h-3.5 w-3.5" />
                        Items personalizados ({itemsCustom.length})
                    </h4>
                    <div className="border border-border rounded-xl overflow-hidden bg-muted/30">
                        <table className="w-full text-label">
                            <thead>
                                <tr className="bg-muted">
                                    <th className="text-left px-3 py-2 font-bold text-brand-dark">Descripción</th>
                                    <th className="text-center px-2 py-2 font-bold text-brand-dark w-20">Cantidad</th>
                                    <th className="text-left px-2 py-2 font-bold text-brand-dark w-24">Unidad</th>
                                </tr>
                            </thead>
                            <tbody>
                                {itemsCustom.map((it, idx) => {
                                    const rechazado = it.aprobado === false;
                                    const ajustada = it.cantidad_aprobada != null && Number(it.cantidad_aprobada) !== Number(it.cantidad);
                                    return (
                                        <tr key={it.id || idx} className={cn(idx % 2 === 0 ? "bg-card" : "bg-muted/40", rechazado && "opacity-50")}>
                                            <td className="px-3 py-1.5 font-medium text-brand-dark">
                                                <div className="flex flex-wrap items-center gap-1.5">
                                                    <span className={cn(rechazado && "line-through")}>{it.descripcion}</span>
                                                    {it.agregado_por_aprobador && (
                                                        <span className="px-1.5 py-0.5 rounded-full bg-brand-primary/10 text-green-700 dark:text-green-300 text-micro font-bold uppercase">+ aprobador</span>
                                                    )}
                                                    {rechazado && (
                                                        <span className="px-1.5 py-0.5 rounded-full bg-destructive/10 text-destructive text-micro font-bold uppercase">No se compra</span>
                                                    )}
                                                    {/* La fuente la decide el aprobador → solo mostrar el chip cuando ya
                                                        está decidida (no en 'pendiente', donde 'comprar' es solo el default). */}
                                                    {t.estado !== 'pendiente' && !rechazado && it.fuente === 'obra' && (
                                                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-brand-primary/10 text-green-700 dark:text-green-300 text-micro font-bold"><MapPin className="h-2.5 w-2.5" /> Traer de {it.origen_obra_nombre || 'otra obra'}</span>
                                                    )}
                                                    {t.estado !== 'pendiente' && !rechazado && it.fuente !== 'obra' && (
                                                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground border border-border text-micro font-bold"><ShoppingBag className="h-2.5 w-2.5" /> Comprar</span>
                                                    )}
                                                </div>
                                                {it.observacion && (
                                                    <div className="text-caption text-muted-foreground italic mt-0.5">{it.observacion}</div>
                                                )}
                                                {it.nota_aprobador && (
                                                    <div className="text-caption text-muted-foreground mt-0.5 inline-flex items-center gap-1"><MessageSquare className="h-2.5 w-2.5 shrink-0" /> {it.nota_aprobador}</div>
                                                )}
                                            </td>
                                            <td className="px-2 py-1.5 text-center font-semibold">
                                                {ajustada ? (
                                                    <span><span className="line-through text-muted-foreground/60 mr-1">{Number(it.cantidad)}</span><span className="text-foreground">{Number(it.cantidad_aprobada)}</span></span>
                                                ) : (
                                                    <span className={cn(rechazado && "line-through text-muted-foreground")}>{Number(it.cantidad_aprobada != null ? it.cantidad_aprobada : it.cantidad)}</span>
                                                )}
                                            </td>
                                            <td className="px-2 py-1.5 text-left text-muted-foreground">{it.unidad || '—'}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ── Info ── */}
            <div className="shrink-0 mb-5 space-y-2">
                {t.observaciones && (
                    <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted rounded-lg px-3 py-2">
                        <MessageSquare className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                        <span>{t.observaciones}</span>
                    </div>
                )}
                {Boolean(t.requiere_pionetas) && (
                    <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 rounded-lg px-3 py-2">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                        <span>Requiere {t.cantidad_pionetas || ''} pionetas</span>
                    </div>
                )}
                <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted rounded-lg px-3 py-2">
                    <Users className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <div className="space-y-0.5">
                        <p>Solicitante: <span className="font-medium text-brand-dark">{t.solicitante_nombre || '—'}</span> · {fmtDateTime(t.fecha_solicitud)}</p>
                        {t.fecha_aprobacion && <p>Aprobador: <span className="font-medium text-brand-dark">{t.aprobador_nombre || '—'}</span> · {fmtDate(t.fecha_aprobacion)}</p>}
                        {t.fecha_recepcion && (
                            <p>Recepción: {fmtDate(t.fecha_recepcion)}
                                {t.receptor_nombre ? <> · por <span className="font-medium text-brand-dark">{t.receptor_nombre}</span></> : null}
                                {recepciones.length > 0 && <span className="text-brand-primary font-semibold"> · {recepciones.length} viaje{recepciones.length !== 1 ? 's' : ''}</span>}
                            </p>
                        )}
                    </div>
                </div>
            </div>

            {/* ── SoD Banner: explica por qué el botón de acción no aparece ── */}
            {(showSodBannerSolicitante || showSodBannerAprobador || showSodBannerTransportista) && !activeForm && (
                <div className="shrink-0 mb-3 bg-amber-50 border border-amber-200 dark:bg-amber-950/40 dark:border-amber-900 rounded-xl p-3 flex items-start gap-2.5 text-sm">
                    <Info className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                    <div>
                        <strong className="text-amber-900 dark:text-amber-300">SoD activo:</strong>
                        <span className="text-amber-800 dark:text-amber-300">
                            {showSodBannerSolicitante && ' tú creaste esta solicitud — otro usuario con permiso "Aprobar Transferencia" debe revisarla. '}
                            {showSodBannerAprobador && ' tú aprobaste esta transferencia — otro usuario debe despacharla o recibirla. '}
                            {showSodBannerTransportista && ' tú despachaste esta transferencia — otro usuario debe confirmar la recepción. '}
                            Si no hay otra persona disponible, contacta al admin para que conceda el permiso "Bypass SoD".
                        </span>
                    </div>
                </div>
            )}


            {/* ════════════════════════════════════════════════
                ── APPROVAL FORM — splits multi-origen + quick-fix ──
               ════════════════════════════════════════════════ */}
            {activeForm === 'aprobar' && items.length === 0 && (
                <MaterialesAprobacionPanel
                    items={itemsCustom}
                    obras={obras}
                    loading={actionLoading}
                    onConfirm={async (edits, nuevos) => {
                        const ok = await onAprobar({ items: [], items_custom: edits, items_custom_nuevos: nuevos });
                        if (ok) setActiveForm(null);
                    }}
                    onCancel={() => setActiveForm(null)}
                />
            )}
            {activeForm === 'aprobar' && items.length > 0 && (() => {
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
                                            <button type="button" onClick={() => itemDetail.openItem(item.item_id)} className="text-xs font-bold text-brand-dark text-left hover:underline hover:text-brand-primary transition-colors cursor-pointer">
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
                                            <p className="text-caption text-red-600 dark:text-red-400 mb-2 flex items-center gap-1">
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
                                                                ? <Warehouse className="h-3 w-3 text-amber-600 dark:text-amber-400 shrink-0" />
                                                                : <MapPin className="h-3 w-3 text-green-700 dark:text-green-400 shrink-0" />
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
                                            <p className="mt-1 text-micro text-red-600 dark:text-red-400 font-medium flex items-center gap-0.5">
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
                <div className="shrink-0 border border-red-200 bg-red-50/30 dark:border-red-900 dark:bg-red-950/20 rounded-xl p-4 mb-4 space-y-3">
                    <h4 className="text-sm font-bold text-red-800 dark:text-red-300 flex items-center gap-1.5">
                        <XCircle className="h-4 w-4" /> Rechazar Transferencia
                    </h4>
                    <textarea
                        value={rejectMotivo}
                        onChange={e => setRejectMotivo(e.target.value)}
                        placeholder="Motivo del rechazo..."
                        className="w-full px-3 py-2 text-xs border border-red-200 dark:border-red-900 rounded-xl resize-none h-20 focus:ring-2 focus:ring-red-300/20 dark:focus:ring-red-500/20 outline-none"
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
                <div className="shrink-0 border border-red-200 bg-red-50/30 dark:border-red-900 dark:bg-red-950/20 rounded-xl p-4 mb-4 space-y-3">
                    <h4 className="text-sm font-bold text-red-800 dark:text-red-300 flex items-center gap-1.5">
                        <XCircle className="h-4 w-4" /> Rechazar Recepción
                    </h4>
                    <p className="text-label text-muted-foreground">
                        Rechaza físicamente el material recibido. La transferencia pasa a "rechazada" y el stock no se actualiza.
                    </p>
                    <textarea
                        value={rejectMotivo}
                        onChange={e => setRejectMotivo(e.target.value)}
                        placeholder="Motivo del rechazo de recepción..."
                        className="w-full px-3 py-2 text-xs border border-red-200 dark:border-red-900 rounded-xl resize-none h-20 focus:ring-2 focus:ring-red-300/20 dark:focus:ring-red-500/20 outline-none"
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
                ── RECEIVE FORM — parcial vs total ──
                Por ítem: Enviada total / Recibida previa (de viajes anteriores)
                / Pendiente (lo que aún falta llegar). El usuario ingresa cuánto
                trajo ESTE viaje. Dos botones:
                  · Recepción Parcial → estado recepcion_parcial, más viajes vendrán.
                  · Recepción Total   → estado recibida, cierra el flujo, gaps =
                    discrepancia.
               ════════════════════════════════════════════ */}
            {activeForm === 'recibir' && items.length === 0 && (
                <MaterialesRecepcionPanel
                    loading={actionLoading}
                    yaIniciada={t.estado === 'recepcion_parcial'}
                    onConfirm={async (obs, tipo) => {
                        const ok = await onRecibir([], tipo, obs);
                        if (ok) setActiveForm(null);
                    }}
                    onCancel={() => setActiveForm(null)}
                />
            )}
            {activeForm === 'recibir' && items.length > 0 && (() => {
                // Cálculos derivados para la UI:
                // - totalRecibidoEsteViaje = suma de inputs (info en footer)
                // - totalFaltaGlobal = suma de pendientes (lo que el camión debería traer)
                // - hayFaltantes = true si suma_inputs < suma_falta (al menos 1 ítem no completa)
                //   → habilita checkbox "Esta es la entrega final" y modal de confirmación.
                const totalRecibidoEsteViaje = receiveItems.reduce((s, ri) => s + (ri.cantidad_recibida || 0), 0);
                const totalFaltaGlobal = items.reduce((s, it) => s + pendientePorItem(it), 0);
                const hayFaltantes = items.some((it, idx) => {
                    const ri = receiveItems[idx];
                    if (!ri) return false;
                    return ri.cantidad_recibida < pendientePorItem(it);
                });

                // Ítems que quedarán sin recibir si se cierra ahora — usado en
                // el banner amber del checkbox y en el modal de confirmación.
                const faltantesAlCerrar = items
                    .map((it, idx) => {
                        const ri = receiveItems[idx];
                        if (!ri) return null;
                        const faltante = pendientePorItem(it) - ri.cantidad_recibida;
                        if (faltante <= 0) return null;
                        return {
                            descripcion: it.item_descripcion || `Item #${it.item_id}`,
                            cantidad: faltante,
                            unidad: it.unidad || '',
                        };
                    })
                    .filter((x): x is { descripcion: string; cantidad: number; unidad: string } => x !== null);

                // Handler único de cierre total. Llamado desde:
                // 1. Botón "Esta es toda la entrega" sin faltantes → directo
                // 2. Botón "Esta es toda la entrega" con checkbox marcado → directo
                // 3. Modal de confirmación tras detectar faltantes sin checkbox
                const handleCerrarTotal = async () => {
                    const ok = await onRecibir(
                        receiveItems.map(ri => ({
                            item_id: ri.item_id,
                            cantidad_recibida: ri.cantidad_recibida,
                        })),
                        'total'
                    );
                    if (ok) setActiveForm(null);
                };

                const handleClickCerrar = () => {
                    if (hayFaltantes && !cierreFinal) {
                        setConfirmMermaOpen(true);
                    } else {
                        handleCerrarTotal();
                    }
                };

                const handleParcial = async () => {
                    const ok = await onRecibir(
                        receiveItems.map(ri => ({
                            item_id: ri.item_id,
                            cantidad_recibida: ri.cantidad_recibida,
                        })),
                        'parcial'
                    );
                    if (ok) setActiveForm(null);
                };

                // Quick-fill: rellena todos al pendiente / vacía todos.
                const setAll = (mode: 'pendiente' | 'cero') => {
                    setReceiveItems(receiveItems.map((ri, idx) => ({
                        ...ri,
                        cantidad_recibida: mode === 'pendiente' ? pendientePorItem(items[idx]) : 0,
                    })));
                };

                return (
                <div className="shrink-0 border border-brand-primary/30 bg-brand-primary/5 rounded-xl mb-4 overflow-hidden">
                    {/* Header */}
                    <div className="px-4 py-3 border-b border-brand-primary/20 bg-card/60">
                        <h4 className="text-sm font-bold text-brand-dark flex items-center gap-1.5">
                            <PackageCheck className="h-4 w-4 text-brand-primary" /> Recepción de cargamento
                        </h4>
                        <p className="text-label text-muted-foreground mt-0.5">
                            Marca qué llegó este viaje. Si falta algo, podrás registrar otros viajes después.
                        </p>
                    </div>

                    {/* Tabla densa: una fila por ítem */}
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                            <thead>
                                <tr className="bg-muted/40 border-b border-border">
                                    <th className="text-left px-3 py-2 font-bold text-brand-dark">Ítem</th>
                                    <th className="text-center px-2 py-2 font-bold text-brand-dark w-20">Enviada</th>
                                    <th className="text-center px-2 py-2 font-bold text-brand-dark w-20">Falta</th>
                                    <th className="text-left px-3 py-2 font-bold text-brand-dark w-44">
                                        <div className="flex items-center justify-between gap-2">
                                            <span>Llegó este viaje</span>
                                            <span className="flex gap-1.5">
                                                <button
                                                    type="button"
                                                    onClick={() => setAll('pendiente')}
                                                    className="text-micro font-bold text-brand-primary hover:underline"
                                                    title="Rellenar todo al pendiente"
                                                >
                                                    todo
                                                </button>
                                                <span className="text-muted-foreground">·</span>
                                                <button
                                                    type="button"
                                                    onClick={() => setAll('cero')}
                                                    className="text-micro font-bold text-muted-foreground hover:underline"
                                                    title="Vaciar todos los inputs"
                                                >
                                                    nada
                                                </button>
                                            </span>
                                        </div>
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.map((item, idx) => {
                                    const ri = receiveItems[idx];
                                    if (!ri) return null;
                                    const enviada = Number(item.cantidad_enviada) || Number(item.cantidad_solicitada);
                                    const falta = pendientePorItem(item);
                                    const sobrante = ri.cantidad_recibida > falta ? ri.cantidad_recibida - falta : 0;
                                    const incompleto = ri.cantidad_recibida < falta;
                                    return (
                                        <tr key={item.id || idx} className={cn(idx % 2 === 0 ? "bg-card" : "bg-muted")}>
                                            <td className="px-3 py-1.5 text-brand-dark">
                                                <button
                                                    type="button"
                                                    onClick={() => itemDetail.openItem(item.item_id)}
                                                    className="text-left font-medium hover:underline hover:text-brand-primary transition-colors cursor-pointer"
                                                >
                                                    {item.item_descripcion || `Item #${item.item_id}`}
                                                </button>
                                                {item.unidad && <span className="text-caption text-muted-foreground ml-1">({item.unidad})</span>}
                                            </td>
                                            <td className="text-center text-muted-foreground">{enviada}</td>
                                            <td className={cn(
                                                "text-center font-bold",
                                                falta === 0 ? "text-green-600 dark:text-green-400" : "text-amber-700 dark:text-amber-300"
                                            )}>
                                                {falta}
                                            </td>
                                            <td className="px-3 py-1.5">
                                                <div className="flex items-center gap-1.5">
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            const updated = [...receiveItems];
                                                            updated[idx] = { ...updated[idx], cantidad_recibida: Math.max(0, updated[idx].cantidad_recibida - 1) };
                                                            setReceiveItems(updated);
                                                        }}
                                                        disabled={ri.cantidad_recibida <= 0}
                                                        className="h-7 w-7 flex items-center justify-center rounded-lg border border-border bg-card text-brand-dark hover:border-brand-primary/30 hover:bg-brand-primary/5 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                                                        aria-label={`Restar 1 a ${item.item_descripcion}`}
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
                                                        className={cn(
                                                            "w-14 px-2 py-1 border rounded-lg text-center text-xs font-bold",
                                                            sobrante > 0 ? "border-amber-400 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200" : "border-border"
                                                        )}
                                                        aria-label={`Cantidad recibida de ${item.item_descripcion}`}
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            const updated = [...receiveItems];
                                                            updated[idx] = { ...updated[idx], cantidad_recibida: updated[idx].cantidad_recibida + 1 };
                                                            setReceiveItems(updated);
                                                        }}
                                                        className="h-7 w-7 flex items-center justify-center rounded-lg border border-border bg-card text-brand-dark hover:border-brand-primary/30 hover:bg-brand-primary/5 transition-all"
                                                        aria-label={`Sumar 1 a ${item.item_descripcion}`}
                                                    >
                                                        <Plus className="h-3 w-3" />
                                                    </button>
                                                    {sobrante > 0 && (
                                                        <span
                                                            className="ml-1 text-micro font-bold text-amber-700 bg-amber-100 border border-amber-300 dark:text-amber-200 dark:bg-amber-500/15 dark:border-amber-800 px-1.5 py-0.5 rounded-full"
                                                            title="Vino más de lo enviado — se registrará como sobrante al cerrar"
                                                        >
                                                            +{sobrante} sobrante
                                                        </span>
                                                    )}
                                                    {incompleto && falta > 0 && ri.cantidad_recibida > 0 && (
                                                        <span
                                                            className="ml-1 text-micro font-medium text-muted-foreground"
                                                            title={`Faltan ${falta - ri.cantidad_recibida} para completar este ítem`}
                                                        >
                                                            faltan {falta - ri.cantidad_recibida}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* Sticky footer: checkbox + totales + botones */}
                    <div className="border-t border-brand-primary/20 bg-muted/40 px-4 py-3 space-y-3">
                        {/* Checkbox "entrega final" — solo visible si hay faltantes */}
                        {hayFaltantes && (
                            <label className="flex items-start gap-2 cursor-pointer group">
                                <input
                                    type="checkbox"
                                    checked={cierreFinal}
                                    onChange={e => setCierreFinal(e.target.checked)}
                                    className="mt-0.5 h-4 w-4 rounded border-amber-400 text-amber-600 focus:ring-amber-500 cursor-pointer"
                                />
                                <span className="text-xs text-brand-dark">
                                    <span className="font-bold">Esta es la entrega final</span> — los ítems faltantes quedarán como merma.
                                    <Info className="inline h-3 w-3 ml-0.5 text-muted-foreground" />
                                    <span className="block text-caption text-muted-foreground mt-0.5">
                                        Marca esta opción si NO van a venir más viajes. Los ítems no recibidos se registrarán como discrepancia.
                                    </span>
                                </span>
                            </label>
                        )}

                        {/* Banner amber resumen — solo si checkbox marcado */}
                        {cierreFinal && faltantesAlCerrar.length > 0 && (
                            <div className="bg-amber-50 border border-amber-200 dark:bg-amber-950/40 dark:border-amber-900 rounded-lg px-3 py-2 text-label text-amber-900 dark:text-amber-200">
                                <div className="font-bold mb-1 flex items-center gap-1.5">
                                    <AlertTriangle className="h-3.5 w-3.5" /> Se registrarán como merma:
                                </div>
                                <ul className="ml-5 space-y-0.5 list-disc">
                                    {faltantesAlCerrar.map((f, i) => (
                                        <li key={i}>
                                            <span className="font-bold">{f.cantidad}</span>
                                            {f.unidad ? ` ${f.unidad}` : ''} · {f.descripcion}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {/* Totales */}
                        <div className="flex items-center justify-between text-label text-muted-foreground">
                            <span>
                                Total este viaje: <span className="font-bold text-brand-dark">{totalRecibidoEsteViaje}</span>
                                {totalFaltaGlobal > 0 && (
                                    <> · Pendiente global: <span className="font-bold text-amber-700 dark:text-amber-300">{totalFaltaGlobal}</span></>
                                )}
                            </span>
                            <span>{items.length} ítem{items.length === 1 ? '' : 's'}</span>
                        </div>

                        {/* Botones de acción */}
                        <div className="flex flex-wrap gap-2">
                            {/* "Faltan más viajes" — oculto si checkbox marcado (contradictorio) */}
                            {!cierreFinal && (
                                <button
                                    onClick={handleParcial}
                                    disabled={actionLoading || totalRecibidoEsteViaje === 0}
                                    title={
                                        totalRecibidoEsteViaje === 0
                                            ? 'Marca al menos 1 unidad de algún ítem antes de registrar'
                                            : 'Registra lo de este viaje. La transferencia queda abierta esperando próximos viajes.'
                                    }
                                    className="flex-1 min-w-[160px] py-2.5 text-xs font-bold text-white bg-purple-600 rounded-xl hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-1.5"
                                >
                                    <PackageOpen className="h-3.5 w-3.5" />
                                    {actionLoading ? 'Registrando...' : 'Faltan más viajes'}
                                </button>
                            )}
                            <button
                                onClick={handleClickCerrar}
                                disabled={actionLoading}
                                title="Cierra la transferencia. Cualquier diferencia entre lo enviado y lo recibido se registra como discrepancia."
                                className="flex-1 min-w-[160px] py-2.5 text-xs font-bold text-white bg-green-600 rounded-xl hover:bg-green-700 disabled:opacity-50 transition-all flex items-center justify-center gap-1.5"
                            >
                                <PackageCheck className="h-3.5 w-3.5" />
                                {actionLoading ? 'Cerrando...' : 'Esta es toda la entrega'}
                            </button>
                            <button onClick={() => setActiveForm(null)} className="px-4 py-2.5 text-xs font-bold text-muted-foreground hover:text-brand-dark transition-colors">
                                Cancelar
                            </button>
                        </div>
                    </div>

                    {/* Modal de confirmación defensivo — si el user clickea cerrar con
                        faltantes y NO marcó el checkbox. Defensa contra cierre accidental. */}
                    <Modal
                        isOpen={confirmMermaOpen}
                        onClose={() => setConfirmMermaOpen(false)}
                        title="¿Cerrar transferencia?"
                        size="sm"
                        footer={
                            <div className="flex justify-end gap-2 w-full">
                                <button
                                    onClick={() => setConfirmMermaOpen(false)}
                                    className="px-4 py-2 text-xs font-bold text-muted-foreground hover:text-brand-dark transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={async () => {
                                        setConfirmMermaOpen(false);
                                        await handleCerrarTotal();
                                    }}
                                    disabled={actionLoading}
                                    className="px-4 py-2 text-xs font-bold text-white bg-amber-600 rounded-xl hover:bg-amber-700 disabled:opacity-50 transition-all"
                                >
                                    Sí, cerrar con merma
                                </button>
                            </div>
                        }
                    >
                        <div className="space-y-3 text-sm">
                            <p className="text-brand-dark">Quedan estos ítems sin recibir:</p>
                            <ul className="ml-5 space-y-1 list-disc text-xs">
                                {faltantesAlCerrar.map((f, i) => (
                                    <li key={i}>
                                        <span className="font-bold">{f.cantidad}</span>
                                        {f.unidad ? ` ${f.unidad}` : ''} · {f.descripcion}
                                    </li>
                                ))}
                            </ul>
                            <p className="text-xs text-muted-foreground bg-amber-50 border border-amber-200 dark:bg-amber-950/40 dark:border-amber-900 rounded-lg px-3 py-2">
                                Se registrarán como discrepancia/merma. La transferencia se cerrará y <strong>no podrás registrar más viajes</strong>.
                            </p>
                        </div>
                    </Modal>
                </div>
                );
            })()}

        </div>
    );

    // ── Layout dos columnas (solo flujo Solicitud de Materiales) ──
    // IZQUIERDA = "Lo que se pide" (solo lectura). DERECHA = acciones.
    // Responsive: apila vertical < xl (botones grandes a ancho completo);
    // lado a lado en xl (≥1280px). Móvil mantiene el toggle lista↔detalle
    // del panel padre + el botón "Volver".
    const renderMateriales = () => (
        <div className="flex flex-col flex-1 min-h-0 p-3 md:p-6 overflow-hidden">
            {/* Header con chip estado + menú "Acciones ▾" */}
            <div className="flex items-center gap-3 mb-4 shrink-0">
                <button onClick={onBack} className="md:hidden p-2 rounded-xl hover:bg-muted text-muted-foreground">
                    <ChevronLeft className="h-5 w-5" />
                </button>
                <div className="flex-1 min-w-0">
                    <p className="text-caption uppercase font-black text-muted-foreground tracking-widest">Detalle solicitud</p>
                    <h4 className="text-base font-black text-brand-dark truncate">{t.codigo}</h4>
                    <p className="text-label text-muted-foreground truncate">{origen} → {destino}</p>
                </div>
                <span className={cn("hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-label font-bold shrink-0", cfg.color)}>
                    <Icon className="h-3 w-3" /> {cfg.label}
                </span>
                <TransferenciaActionsMenu
                    canAprobar={canAprobar}
                    canRechazar={canRechazar}
                    canRecibir={canRecibir}
                    canRechazarRecepcion={canRechazarRecepcion}
                    canCancelar={canCancelar}
                    canCompartirWhatsApp={canCompartirWhatsApp}
                    actionLoading={actionLoading}
                    onAprobar={() => setActiveForm('aprobar')}
                    onRechazar={() => setActiveForm('rechazar')}
                    onRecibir={() => setActiveForm('recibir')}
                    onRechazarRecepcion={() => setActiveForm('rechazar_recepcion')}
                    onCancelar={async () => { await onCancelar(); }}
                    onWhatsApp={handleShareWhatsApp}
                    isPendiente={t.estado === 'pendiente'}
                />
                <button onClick={onBack} className="hidden md:flex p-1.5 rounded-full hover:bg-muted text-muted-foreground shrink-0">
                    <XIcon className="h-4 w-4" />
                </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto space-y-5">
                {/* Estado: stepper o banner terminado */}
                {isTerminated ? (
                    <div className={cn("flex items-center gap-2 px-4 py-3 rounded-xl border", t.estado === 'rechazada' ? "bg-red-50 border-red-200 dark:bg-red-950/40 dark:border-red-900" : "bg-muted border-border")}>
                        {t.estado === 'rechazada' ? <XCircle className="h-4 w-4 text-red-500" /> : <Ban className="h-4 w-4 text-muted-foreground" />}
                        <div>
                            <p className={cn("text-xs font-bold", t.estado === 'rechazada' ? "text-red-700 dark:text-red-300" : "text-muted-foreground")}>
                                {t.estado === 'rechazada' ? 'Solicitud Rechazada' : 'Solicitud Cancelada'}
                            </p>
                            {t.observaciones_rechazo && (
                                <p className="text-caption text-muted-foreground mt-0.5">{t.observaciones_rechazo}</p>
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
                                        <div className={cn("flex-1 h-0.5 mx-2", idx <= activeStep ? "bg-brand-primary" : "bg-muted")} />
                                    )}
                                    <div className="flex flex-col items-center gap-1.5">
                                        <div className={cn(
                                            "w-9 h-9 rounded-full flex items-center justify-center border-2 transition-all",
                                            completed ? "bg-brand-primary border-brand-primary text-white" : "bg-card border-border text-muted-foreground/40",
                                            isCurrent && "ring-4 ring-brand-primary/20 scale-110"
                                        )}>
                                            <StepIcon className="h-4 w-4" />
                                        </div>
                                        <span className={cn("text-caption font-bold whitespace-nowrap", completed ? "text-brand-primary" : "text-muted-foreground/40")}>
                                            {step.label}
                                        </span>
                                    </div>
                                </React.Fragment>
                            );
                        })}
                    </div>
                )}

                {/* SoD banner */}
                {(showSodBannerSolicitante || showSodBannerAprobador || showSodBannerTransportista) && (
                    <div className="bg-amber-50 border border-amber-200 dark:bg-amber-950/40 dark:border-amber-900 rounded-xl p-3 flex items-start gap-2.5 text-sm">
                        <Info className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                        <div>
                            <strong className="text-amber-900 dark:text-amber-300">SoD activo:</strong>
                            <span className="text-amber-800 dark:text-amber-300">
                                {showSodBannerSolicitante && ' tú creaste esta solicitud — otro usuario con permiso "Aprobar Transferencia" debe revisarla. '}
                                {showSodBannerAprobador && ' tú aprobaste esta transferencia — otro usuario debe despacharla o recibirla. '}
                                {showSodBannerTransportista && ' tú despachaste esta transferencia — otro usuario debe confirmar la recepción. '}
                                Si no hay otra persona disponible, contacta al admin para que conceda el permiso "Bypass SoD".
                            </span>
                        </div>
                    </div>
                )}

                {/* Materiales pedidos (solo lectura) */}
                <DetailSection icon={<ShoppingBag className="h-3.5 w-3.5" />} title={`Materiales pedidos (${itemsCustom.length})`}>
                    {itemsCustom.length === 0
                        ? <MatEmpty>Sin materiales en esta solicitud</MatEmpty>
                        : itemsCustom.map((it, idx) => <MatRequestRow key={it.id || idx} it={it} estado={t.estado} />)}
                </DetailSection>

                {/* Historial de entregas — un bloque por cada viaje, con su receptor.
                    Útil cuando la solicitud se entrega en múltiples viajes (parciales):
                    deja registro de quién recibió y qué llegó en cada instancia. */}
                {recepciones.length > 0 && (
                    <DetailSection icon={<History className="h-3.5 w-3.5" />} title={`Historial de entregas (${recepciones.length})`}>
                        {recepciones.map((rec, idx) => (
                            <div key={rec.id} className="p-3 rounded-xl bg-muted/40 border border-border">
                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-caption font-bold text-muted-foreground">Viaje #{idx + 1}</span>
                                        <span className="text-micro font-bold px-1.5 py-0.5 rounded-full border border-border bg-muted text-muted-foreground leading-none">
                                            {rec.tipo === 'total' ? 'Total · cierre' : 'Parcial'}
                                        </span>
                                    </div>
                                    <span className="text-caption text-muted-foreground">{fmtDateTime(rec.fecha_recepcion)}</span>
                                </div>
                                <p className="text-label text-muted-foreground mt-1">
                                    Recibido por <span className="font-semibold text-brand-dark">{rec.receptor_nombre || `Usuario #${rec.receptor_id}`}</span>
                                </p>
                                {rec.items && rec.items.length > 0 && (
                                    <ul className="mt-1 space-y-0.5 ml-1">
                                        {rec.items.map(ri => (
                                            <li key={ri.id} className="text-caption text-muted-foreground">
                                                <span className="font-semibold text-brand-dark">{Number(ri.cantidad_recibida)}</span>
                                                {ri.unidad ? ` ${ri.unidad}` : ''} · {ri.item_descripcion || `Item #${ri.item_id}`}
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        ))}
                    </DetailSection>
                )}

                {/* Información */}
                <DetailSection icon={<Users className="h-3.5 w-3.5" />} title="Información">
                    {t.motivo && (
                        <div className="text-xs text-muted-foreground"><span className="font-semibold text-brand-dark">Motivo:</span> {t.motivo}</div>
                    )}
                    {t.observaciones && (
                        <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted rounded-lg px-3 py-2">
                            <MessageSquare className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                            <span>{t.observaciones}</span>
                        </div>
                    )}
                    <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted rounded-lg px-3 py-2">
                        <Users className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                        <div className="space-y-0.5">
                            <p>Solicitante: <span className="font-medium text-brand-dark">{t.solicitante_nombre || '—'}</span> · {fmtDateTime(t.fecha_solicitud)}</p>
                            {t.fecha_aprobacion && <p>Aprobador: <span className="font-medium text-brand-dark">{t.aprobador_nombre || '—'}</span> · {fmtDate(t.fecha_aprobacion)}</p>}
                            {t.fecha_recepcion && (
                                <p>Recepción: {fmtDate(t.fecha_recepcion)}
                                    {t.receptor_nombre ? <> · por <span className="font-medium text-brand-dark">{t.receptor_nombre}</span></> : null}
                                    {recepciones.length > 0 && <span className="text-brand-primary font-semibold"> · {recepciones.length} viaje{recepciones.length !== 1 ? 's' : ''}</span>}
                                </p>
                            )}
                        </div>
                    </div>
                </DetailSection>
            </div>

            {/* ── MODALES (solo flujo materiales) ── */}
            <Modal isOpen={activeForm === 'aprobar'} onClose={() => setActiveForm(null)} title="Revisar y aprobar materiales" size="lg">
                <MaterialesAprobacionPanel
                    embedded
                    items={itemsCustom}
                    obras={obras}
                    loading={actionLoading}
                    onConfirm={async (edits, nuevos) => {
                        const ok = await onAprobar({ items: [], items_custom: edits, items_custom_nuevos: nuevos });
                        if (ok) setActiveForm(null);
                    }}
                    onCancel={() => setActiveForm(null)}
                />
            </Modal>

            <Modal isOpen={activeForm === 'recibir'} onClose={() => setActiveForm(null)} title={t.estado === 'recepcion_parcial' ? 'Registrar otro viaje' : 'Registrar entrega'} size="md">
                <MaterialesRecepcionPanel
                    embedded
                    loading={actionLoading}
                    yaIniciada={t.estado === 'recepcion_parcial'}
                    onConfirm={async (obs, tipo) => {
                        const ok = await onRecibir([], tipo, obs);
                        if (ok) setActiveForm(null);
                    }}
                    onCancel={() => setActiveForm(null)}
                />
            </Modal>

            <Modal isOpen={activeForm === 'rechazar'} onClose={() => setActiveForm(null)} title="Rechazar solicitud" size="sm">
                <div className="space-y-3">
                    <textarea
                        value={rejectMotivo}
                        onChange={e => setRejectMotivo(e.target.value)}
                        placeholder="Motivo del rechazo..."
                        className="w-full px-3 py-2 text-sm border border-border rounded-xl resize-none h-24 focus:ring-2 focus:ring-red-300/20 dark:focus:ring-red-500/20 outline-none"
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
                            className="flex-1 py-2.5 text-sm font-bold text-white bg-red-600 rounded-xl hover:bg-red-700 disabled:opacity-50 transition-all"
                        >
                            {actionLoading ? 'Rechazando...' : 'Confirmar Rechazo'}
                        </button>
                        <button onClick={() => setActiveForm(null)} className="px-4 py-2.5 text-sm font-bold text-muted-foreground hover:text-brand-dark transition-colors">
                            Cancelar
                        </button>
                    </div>
                </div>
            </Modal>

            <Modal isOpen={activeForm === 'rechazar_recepcion'} onClose={() => setActiveForm(null)} title="Rechazar recepción" size="sm">
                <div className="space-y-3">
                    <p className="text-xs text-muted-foreground">
                        Rechaza físicamente el material recibido. La solicitud pasa a "rechazada" y el stock no se actualiza.
                    </p>
                    <textarea
                        value={rejectMotivo}
                        onChange={e => setRejectMotivo(e.target.value)}
                        placeholder="Motivo del rechazo de recepción..."
                        className="w-full px-3 py-2 text-sm border border-border rounded-xl resize-none h-24 focus:ring-2 focus:ring-red-300/20 dark:focus:ring-red-500/20 outline-none"
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
                            className="flex-1 py-2.5 text-sm font-bold text-white bg-red-600 rounded-xl hover:bg-red-700 disabled:opacity-50 transition-all"
                        >
                            {actionLoading ? 'Rechazando...' : 'Confirmar Rechazo'}
                        </button>
                        <button onClick={() => setActiveForm(null)} className="px-4 py-2.5 text-sm font-bold text-muted-foreground hover:text-brand-dark transition-colors">
                            Cancelar
                        </button>
                    </div>
                </div>
            </Modal>
        </div>
    );

    return (
        <>
            {isMateriales ? renderMateriales() : renderCatalogo()}

            {/* Item Detail Modal — compartido por ambos flujos */}
            <ItemDetailModal
                isOpen={!!itemDetail.selectedItemId}
                onClose={itemDetail.closeItem}
                itemData={itemDetail.itemData}
                stockLocations={itemDetail.stockLocations}
                loading={itemDetail.loading}
                stockLoading={itemDetail.stockLoading}
            />
        </>
    );
};

export default TransferenciaDetail;
