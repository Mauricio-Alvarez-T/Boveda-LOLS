import React from 'react';
import { FileText, CheckCircle2, Truck, PackageCheck, Ban, ShoppingBag, Package, Minus, Plus, Trash2 } from 'lucide-react';
import { cn } from '../../../utils/cn';
import type { ItemInventario } from '../../../types/entities';
import type { Origen, Destino, InferResult, WizardState, ItemInput, CustomItemInput } from '../../../utils/inferMovimiento';

/**
 * Paso 3: revisar el flujo inferido + recorrido (SoD) + ítems EDITABLES (cambiar
 * cantidad / quitar, tanto de catálogo como de "otros materiales") + motivo /
 * observaciones / pionetas.
 */
export const PasoRevisar: React.FC<{
    infer: InferResult;
    state: WizardState;
    catalogo: ItemInventario[];
    /** Ítems fuera de catálogo en crudo (para editar por índice). */
    customItems: CustomItemInput[];
    nombreUbi: (u: Origen | Destino | null) => string;
    setCart: React.Dispatch<React.SetStateAction<ItemInput[]>>;
    setCustomItems: React.Dispatch<React.SetStateAction<CustomItemInput[]>>;
    onMotivo: (v: string) => void;
    onObservaciones: (v: string) => void;
    onRequierePionetas: (v: boolean) => void;
    onCantidadPionetas: (v: number) => void;
}> = ({ infer, state, catalogo, customItems, nombreUbi, setCart, setCustomItems, onMotivo, onObservaciones, onRequierePionetas, onCantidadPionetas }) => {
    const tipoFlujo = infer.tipoFlujo;
    const conAprobacion = tipoFlujo != null && !['push_directo', 'orden_gerencia'].includes(tipoFlujo);
    const motivoRequerido = tipoFlujo === 'orden_gerencia';
    const aplicaPionetas = tipoFlujo != null && ['solicitud', 'devolucion', 'intra_obra'].includes(tipoFlujo);

    const updateQty = (id: number, c: number) => {
        if (c < 1) { setCart(prev => prev.filter(l => l.item_id !== id)); return; }
        setCart(prev => prev.map(l => l.item_id === id ? { ...l, cantidad: c } : l));
    };
    const updCustom = (i: number, patch: Partial<CustomItemInput>) => setCustomItems(prev => prev.map((c, idx) => idx === i ? { ...c, ...patch } : c));
    const delCustom = (i: number) => setCustomItems(prev => prev.filter((_, idx) => idx !== i));

    const itemRows = state.items.map(l => ({ ...l, item: catalogo.find(c => c.id === l.item_id) }));

    const Nodo = ({ icon, label, nota }: { icon: React.ReactNode; label: string; nota?: string }) => (
        <div className="flex flex-col items-center gap-1 text-center shrink-0 w-16">
            <div className="h-8 w-8 rounded-full bg-brand-primary/10 text-brand-primary flex items-center justify-center">{icon}</div>
            <span className="text-micro font-bold text-brand-dark leading-tight">{label}</span>
            {nota && <span className="text-micro text-muted-foreground">{nota}</span>}
        </div>
    );

    return (
        <div className="space-y-4">
            <div className="rounded-xl border border-brand-primary/30 bg-brand-primary/5 px-3 py-2.5">
                <p className="text-sm text-brand-dark"><strong>{infer.tipoFlujoLabel}</strong></p>
                <p className="text-caption text-muted-foreground">{nombreUbi(state.origen)} → {nombreUbi(state.destino)}</p>
            </div>

            <div>
                <p className="text-label font-black text-brand-dark/60 uppercase tracking-widest mb-2">Recorrido</p>
                <div className="flex items-start justify-between gap-0.5">
                    <Nodo icon={<FileText className="h-4 w-4" />} label="Tú solicitas" />
                    <div className="flex-1 h-0.5 bg-border mt-4" />
                    {conAprobacion
                        ? <Nodo icon={<CheckCircle2 className="h-4 w-4" />} label="Aprobación" nota="pendiente" />
                        : <Nodo icon={<Ban className="h-4 w-4" />} label="Sin aprobación" nota="directo" />}
                    <div className="flex-1 h-0.5 bg-border mt-4" />
                    <Nodo icon={<Truck className="h-4 w-4" />} label="Despacho" />
                    <div className="flex-1 h-0.5 bg-border mt-4" />
                    <Nodo icon={<PackageCheck className="h-4 w-4" />} label="Recepción" />
                </div>
            </div>

            {itemRows.length > 0 && (
                <div>
                    <p className="text-label font-black text-brand-dark/60 uppercase tracking-widest mb-2 flex items-center gap-1.5"><Package className="h-3.5 w-3.5" /> Ítems ({itemRows.length})</p>
                    <ul className="space-y-1.5">
                        {itemRows.map(r => (
                            <li key={r.item_id} className="flex items-center gap-2">
                                <span className="flex-1 min-w-0 text-xs text-brand-dark truncate">{r.item?.descripcion || `Item #${r.item_id}`}</span>
                                <div className="shrink-0 flex items-center gap-1">
                                    <button type="button" onClick={() => updateQty(r.item_id, r.cantidad - 1)} className="h-7 w-7 rounded-md bg-muted flex items-center justify-center"><Minus className="h-3 w-3" /></button>
                                    <input type="number" inputMode="decimal" min={0} value={r.cantidad} onChange={e => updateQty(r.item_id, parseInt(e.target.value) || 0)} className="w-12 h-7 px-1 text-label font-bold text-center border border-border rounded-md" />
                                    <button type="button" onClick={() => updateQty(r.item_id, r.cantidad + 1)} className="h-7 w-7 rounded-md bg-brand-primary/10 text-brand-primary flex items-center justify-center"><Plus className="h-3 w-3" /></button>
                                    <span className="text-caption text-muted-foreground w-8 truncate">{r.item?.unidad || ''}</span>
                                    <button type="button" onClick={() => updateQty(r.item_id, 0)} className="text-muted-foreground/50 hover:text-destructive ml-0.5"><Trash2 className="h-3.5 w-3.5" /></button>
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {customItems.length > 0 && (
                <div>
                    <p className="text-label font-black text-brand-dark/60 uppercase tracking-widest mb-2 flex items-center gap-1.5"><ShoppingBag className="h-3.5 w-3.5" /> Otros materiales ({customItems.filter(c => c.descripcion.trim()).length})</p>
                    <ul className="space-y-2">
                        {customItems.map((c, i) => (
                            <li key={i} className="flex items-center gap-2">
                                <input value={c.descripcion} onChange={e => updCustom(i, { descripcion: e.target.value })} placeholder="Descripción del material" className="flex-1 min-w-0 h-9 px-2.5 text-xs border border-border rounded-lg" />
                                <input type="number" inputMode="decimal" min={1} value={c.cantidad} onChange={e => updCustom(i, { cantidad: parseInt(e.target.value) || 0 })} className="w-14 h-9 px-1 text-xs text-center border border-border rounded-lg" />
                                <input value={c.unidad || ''} onChange={e => updCustom(i, { unidad: e.target.value })} placeholder="unidad" className="w-16 h-9 px-2 text-xs border border-border rounded-lg" />
                                <button type="button" onClick={() => delCustom(i)} className="text-muted-foreground/50 hover:text-destructive shrink-0"><Trash2 className="h-4 w-4" /></button>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            <div className="space-y-3 pt-1">
                <div>
                    <label className="text-caption font-bold text-brand-dark block mb-1">Motivo {motivoRequerido ? <span className="text-red-500">*</span> : '(opcional)'}</label>
                    <input value={state.motivo} onChange={e => onMotivo(e.target.value)} placeholder={motivoRequerido ? 'Justificación de la orden (obligatorio)' : 'Opcional...'} className={cn('w-full h-10 px-3 text-sm border rounded-xl outline-none focus:ring-2 focus:ring-brand-primary/20', motivoRequerido && !state.motivo.trim() ? 'border-red-300' : 'border-border')} />
                </div>
                <div>
                    <label className="text-caption font-bold text-brand-dark block mb-1">Observaciones (opcional)</label>
                    <input value={state.observaciones} onChange={e => onObservaciones(e.target.value)} placeholder="Opcional..." className="w-full h-10 px-3 text-sm border border-border rounded-xl outline-none focus:ring-2 focus:ring-brand-primary/20" />
                </div>
                {aplicaPionetas && (
                    <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={state.requierePionetas} onChange={e => onRequierePionetas(e.target.checked)} className="h-4 w-4 accent-brand-primary" />
                        <span className="text-brand-dark">Requiere pionetas</span>
                        {state.requierePionetas && (
                            <input type="number" inputMode="decimal" min={0} value={state.cantidadPionetas} onChange={e => onCantidadPionetas(parseInt(e.target.value) || 0)} className="w-16 h-8 px-2 text-xs text-center border border-border rounded-md ml-1" />
                        )}
                    </label>
                )}
            </div>

            {infer.errores.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-800/60 dark:bg-amber-950/30 px-3 py-2 text-label font-medium text-amber-800 dark:text-amber-300">
                    {infer.errores[0]}
                </div>
            )}
        </div>
    );
};
