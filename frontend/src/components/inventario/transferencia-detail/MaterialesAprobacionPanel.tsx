import React, { useState } from 'react';
import { CheckCircle2, ChevronDown, Plus, ShoppingBag, MapPin } from 'lucide-react';
import { cn } from '../../../utils/cn';

/**
 * Panel de aprobación del flujo "Solicitud de Materiales" (ítems custom a
 * comprar / traer de obra). El aprobador ajusta cantidad, quita/incluye, corrige
 * descripción, decide la fuente y agrega ítems nuevos. Extraído de
 * TransferenciaDetail.tsx (refactor Fase 1) — sin cambios de comportamiento.
 */
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
                <p className="text-xs text-red-700 dark:text-red-300">Quitaste todos los ítems. Si no se comprará nada, usa "Rechazar".</p>
            )}
            {faltaOrigen && aprobadosCount > 0 && (
                <p className="text-xs text-red-700 dark:text-red-300">Elige de qué obra/bodega se trae en los ítems marcados "Traer de obra/bodega".</p>
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

export default MaterialesAprobacionPanel;
