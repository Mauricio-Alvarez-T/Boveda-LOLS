import React from 'react';
import { FileText, CheckCircle2, Truck, PackageCheck, Ban, ShoppingBag, Package } from 'lucide-react';
import { cn } from '../../../utils/cn';
import type { ItemInventario } from '../../../types/entities';
import type { Origen, Destino, InferResult, WizardState } from '../../../utils/inferMovimiento';

/** Paso 3: revisar el flujo inferido + recorrido (SoD) + motivo/observaciones/pionetas. */
export const PasoRevisar: React.FC<{
    infer: InferResult;
    state: WizardState;
    catalogo: ItemInventario[];
    nombreUbi: (u: Origen | Destino | null) => string;
    onMotivo: (v: string) => void;
    onObservaciones: (v: string) => void;
    onRequierePionetas: (v: boolean) => void;
    onCantidadPionetas: (v: number) => void;
}> = ({ infer, state, catalogo, nombreUbi, onMotivo, onObservaciones, onRequierePionetas, onCantidadPionetas }) => {
    const tipoFlujo = infer.tipoFlujo;
    const conAprobacion = tipoFlujo != null && !['push_directo', 'orden_gerencia'].includes(tipoFlujo);
    const motivoRequerido = tipoFlujo === 'orden_gerencia';
    const aplicaPionetas = tipoFlujo != null && ['solicitud', 'devolucion', 'intra_obra'].includes(tipoFlujo);

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
                    <Nodo icon={<FileText className="h-4 w-4" />} label="Solicitás vos" />
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

            <div>
                <p className="text-label font-black text-brand-dark/60 uppercase tracking-widest mb-2 flex items-center gap-1.5"><Package className="h-3.5 w-3.5" /> Ítems ({itemRows.length})</p>
                {itemRows.length === 0 ? <p className="text-caption text-muted-foreground italic">Sin ítems de catálogo.</p> : (
                    <ul className="space-y-1">
                        {itemRows.map(r => (
                            <li key={r.item_id} className="flex justify-between text-xs">
                                <span className="text-brand-dark truncate">{r.item?.descripcion || `Item #${r.item_id}`}</span>
                                <span className="font-bold shrink-0 ml-2">{r.cantidad} {r.item?.unidad || ''}</span>
                            </li>
                        ))}
                    </ul>
                )}
                {state.itemsCustom.length > 0 && (
                    <>
                        <p className="text-label font-black text-brand-dark/60 uppercase tracking-widest mt-3 mb-2 flex items-center gap-1.5"><ShoppingBag className="h-3.5 w-3.5" /> A comprar ({state.itemsCustom.length})</p>
                        <ul className="space-y-1">
                            {state.itemsCustom.map((c, i) => (
                                <li key={i} className="flex justify-between text-xs">
                                    <span className="text-brand-dark truncate">{c.descripcion}</span>
                                    <span className="font-bold shrink-0 ml-2">{c.cantidad} {c.unidad || ''}</span>
                                </li>
                            ))}
                        </ul>
                    </>
                )}
            </div>

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
