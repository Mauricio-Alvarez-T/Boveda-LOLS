import React, { useState } from 'react';
import { ChevronDown, Plus, ShoppingBag, MapPin } from 'lucide-react';
import { cn } from '../../../utils/cn';
import { QtyStepper } from '../../ui/QtyStepper';
import { Button } from '../../ui/Button';

/**
 * Editor CONTROLADO de aprobación de ítems personalizados (fuente comprar/traer,
 * cantidad aprobada, nota, quitar/incluir, agregar nuevos). Se usa en la aprobación
 * de solicitudes MIXTAS (dentro de AprobarForm) y reúne la decisión por ítem del
 * antiguo MaterialesAprobacionPanel — pero sin botón de confirmar: el padre arma el
 * payload y dispara la aprobación combinada (catálogo + personalizados). Fase 4.3.
 */
export interface CustomItemSrc {
    id: number;
    descripcion: string;
    cantidad: number;
    unidad: string | null;
    cantidad_aprobada?: number | null;
    aprobado?: boolean;
    nota_aprobador?: string | null;
    fuente?: 'comprar' | 'obra';
    origen_obra_id?: number | null;
}
export interface CustomEdit {
    id: number; descripcion: string; unidad: string;
    cantidad_aprobada: number; aprobado: boolean; nota_aprobador: string;
    fuente: 'comprar' | 'obra'; origen_obra_id: number | null;
}
export interface CustomNuevo {
    _k: number; descripcion: string; cantidad: number; unidad: string; observacion: string;
    fuente: 'comprar' | 'obra'; origen_obra_id: number | null;
}

/** Estado inicial de ediciones desde los ítems custom de la transferencia. */
export const initCustomEdits = (items: CustomItemSrc[]): CustomEdit[] =>
    items.map(it => ({
        id: it.id,
        descripcion: it.descripcion,
        unidad: it.unidad || '',
        cantidad_aprobada: it.cantidad_aprobada != null ? Number(it.cantidad_aprobada) : (Number(it.cantidad) || 1),
        aprobado: it.aprobado !== false,
        nota_aprobador: it.nota_aprobador || '',
        fuente: (it.fuente === 'obra' ? 'obra' : 'comprar') as 'comprar' | 'obra',
        origen_obra_id: it.origen_obra_id ?? null,
    }));

/** Construye el payload items_custom_nuevos a partir del estado de nuevos. */
export const buildNuevosPayload = (nuevos: CustomNuevo[]) =>
    nuevos.filter(n => n.descripcion.trim()).map(n => ({
        descripcion: n.descripcion.trim(),
        cantidad: Number(n.cantidad) || 1,
        unidad: n.unidad.trim() || undefined,
        observacion: n.observacion.trim() || undefined,
        fuente: n.fuente,
        origen_obra_id: n.fuente === 'obra' ? n.origen_obra_id : null,
    }));

/** ¿Falta elegir obra en algún ítem marcado "traer de obra"? Bloquea el confirmar. */
export const customFaltaOrigen = (edits: CustomEdit[], nuevos: CustomNuevo[]) =>
    edits.some(e => e.aprobado && e.fuente === 'obra' && !e.origen_obra_id)
    || nuevos.some(n => n.descripcion.trim() && n.fuente === 'obra' && !n.origen_obra_id);

export const CustomAprobacionEditor: React.FC<{
    obras: { id: number; nombre: string }[];
    edits: CustomEdit[];
    setEdits: React.Dispatch<React.SetStateAction<CustomEdit[]>>;
    nuevos: CustomNuevo[];
    setNuevos: React.Dispatch<React.SetStateAction<CustomNuevo[]>>;
}> = ({ obras, edits, setEdits, nuevos, setNuevos }) => {
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const toggleExp = (key: string) =>
        setExpanded(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
    const inputBase = "w-full h-10 px-3 text-sm rounded-lg border border-border bg-card outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary";

    const setEdit = (id: number, patch: Partial<CustomEdit>) =>
        setEdits(prev => prev.map(e => (e.id === id ? { ...e, ...patch } : e)));
    const setNuevo = (k: number, patch: Partial<CustomNuevo>) =>
        setNuevos(prev => prev.map(n => (n._k === k ? { ...n, ...patch } : n)));
    const addNuevo = () => setNuevos(prev => [...prev, { _k: prev.length ? Math.max(...prev.map(p => p._k)) + 1 : 1, descripcion: '', cantidad: 1, unidad: '', observacion: '', fuente: 'comprar', origen_obra_id: null }]);
    const delNuevo = (k: number) => setNuevos(prev => prev.filter(n => n._k !== k));

    const renderDecision = (
        fuente: 'comprar' | 'obra', origenObraId: number | null, nota: string,
        onFuente: (f: 'comprar' | 'obra') => void, onObra: (id: number | null) => void, onNota: (v: string) => void
    ) => (
        <div>
            <div className="text-sm font-semibold text-brand-dark mb-1.5">¿Cómo se consigue?</div>
            <div className="grid grid-cols-2 gap-2">
                {/* eslint-disable-next-line no-restricted-syntax -- selector segmentado */}
                <button type="button" onClick={() => onFuente('comprar')}
                    className={cn("h-10 inline-flex items-center justify-center gap-2 rounded-lg text-sm font-bold border-2 transition-colors",
                        fuente === 'comprar' ? "bg-amber-500 text-white border-amber-500" : "bg-card text-brand-dark border-border hover:border-amber-300")}>
                    <ShoppingBag className="h-4 w-4" /> Comprar
                </button>
                {/* eslint-disable-next-line no-restricted-syntax -- selector segmentado */}
                <button type="button" onClick={() => onFuente('obra')}
                    className={cn("h-10 inline-flex items-center justify-center gap-2 rounded-lg text-sm font-bold border-2 transition-colors",
                        fuente === 'obra' ? "bg-brand-primary text-white border-brand-primary" : "bg-card text-brand-dark border-border hover:border-brand-primary/40")}>
                    <MapPin className="h-4 w-4" /> Traer de otra ubicación
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
        <div className="space-y-3">
            <ul className="space-y-3">
                {edits.map((e, idx) => {
                    const key = `e${e.id}`;
                    const isExp = expanded.has(key);
                    return (
                        <li key={e.id} className={cn("rounded-2xl border p-4", e.aprobado ? "border-border bg-card" : "border-border bg-muted/40 opacity-70")}>
                            <div className="flex items-start gap-3">
                                <span className="shrink-0 mt-0.5 w-7 h-7 rounded-lg bg-amber-100 text-amber-800 text-xs font-black flex items-center justify-center dark:bg-amber-950/40 dark:text-amber-300">{idx + 1}</span>
                                <p className={cn("flex-1 min-w-0 text-base font-bold text-brand-dark leading-snug break-words", !e.aprobado && "line-through text-muted-foreground")}>{e.descripcion || 'Ítem'}</p>
                                {/* eslint-disable-next-line no-restricted-syntax -- toggle estado quitar/incluir */}
                                <button type="button" onClick={() => setEdit(e.id, { aprobado: !e.aprobado })}
                                    className={cn("shrink-0 text-xs font-bold px-2.5 py-1.5 rounded-lg transition-colors", e.aprobado ? "text-muted-foreground hover:text-destructive hover:bg-destructive/10" : "text-green-700 dark:text-green-300 hover:bg-brand-primary/10")}>
                                    {e.aprobado ? 'Quitar' : 'Incluir'}
                                </button>
                            </div>
                            {e.aprobado && (
                                <div className="mt-3 space-y-3">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="text-sm font-semibold text-muted-foreground shrink-0">Cantidad</span>
                                        <QtyStepper value={e.cantidad_aprobada} onChange={v => setEdit(e.id, { cantidad_aprobada: v })} min={1} size="md" variant="card" ariaLabel={e.descripcion} />
                                        <input value={e.unidad} onChange={ev => setEdit(e.id, { unidad: ev.target.value })}
                                            placeholder="unidad (sacos, kg...)"
                                            className="flex-1 min-w-[100px] h-10 px-3 text-sm rounded-lg border border-border bg-card outline-none focus:ring-2 focus:ring-brand-primary/30" />
                                    </div>
                                    {renderDecision(e.fuente, e.origen_obra_id, e.nota_aprobador,
                                        f => setEdit(e.id, { fuente: f }),
                                        o => setEdit(e.id, { origen_obra_id: o }),
                                        v => setEdit(e.id, { nota_aprobador: v }))}
                                    <div>
                                        {/* eslint-disable-next-line no-restricted-syntax -- disclosure */}
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
                                className="flex-1 min-w-0 h-10 px-3 text-base font-bold rounded-lg border border-border bg-card outline-none focus:ring-2 focus:ring-brand-primary/30" />
                            <Button type="button" variant="destructive" size="sm" onClick={() => delNuevo(n._k)}
                                className="shrink-0 mt-1 text-xs font-bold">Quitar</Button>
                        </div>
                        <div className="mt-3 space-y-3">
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-semibold text-muted-foreground shrink-0">Cantidad</span>
                                <QtyStepper value={n.cantidad} onChange={v => setNuevo(n._k, { cantidad: v })} min={1} size="md" variant="card" ariaLabel={n.descripcion || 'nuevo'} />
                                <input value={n.unidad} onChange={ev => setNuevo(n._k, { unidad: ev.target.value })} placeholder="unidad (sacos, kg...)"
                                    className="flex-1 min-w-[100px] h-10 px-3 text-sm rounded-lg border border-border bg-card outline-none focus:ring-2 focus:ring-brand-primary/30" />
                            </div>
                            {renderDecision(n.fuente, n.origen_obra_id, n.observacion,
                                f => setNuevo(n._k, { fuente: f }),
                                o => setNuevo(n._k, { origen_obra_id: o }),
                                v => setNuevo(n._k, { observacion: v }))}
                        </div>
                    </li>
                ))}
            </ul>
            <Button type="button" variant="ghost" onClick={addNuevo} leftIcon={<Plus className="h-4 w-4" />}
                className="w-full text-sm font-bold text-green-700 dark:text-green-300 bg-brand-primary/5 hover:bg-brand-primary/10 border border-brand-primary/20">
                Agregar otro material
            </Button>
        </div>
    );
};
