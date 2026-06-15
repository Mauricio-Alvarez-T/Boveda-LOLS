import React from 'react';
import { Package } from 'lucide-react';
import { cn } from '../../../utils/cn';
import type { TransferenciaItem } from '../../../types/entities';
import { ProgressBar } from '../../ui/ProgressBar';

/**
 * Tabla de ítems de catálogo del detalle de transferencia (columnas
 * Solicitada / Enviada / Recibida / Progreso). Extraída de TransferenciaDetail.tsx
 * (Fase 1); la columna Progreso (barra Recibido/Pendiente por ítem) se sumó en Fase 3.
 * Retorna null si no hay ítems. `onOpenItem` abre el modal de detalle del ítem.
 */
export const ItemsTable: React.FC<{
    items: TransferenciaItem[];
    onOpenItem: (itemId: number) => void;
}> = ({ items, onOpenItem }) => {
    if (items.length === 0) return null;
    return (
        <div className="shrink-0 mb-5">
            <h4 className="text-xs font-bold text-brand-dark mb-2 flex items-center gap-1.5">
                <Package className="h-3.5 w-3.5" />
                Items ({items.length})
            </h4>
            <div className="border border-border rounded-xl overflow-hidden">
                <table className="w-full text-label">
                    <thead>
                        <tr className="bg-brand-primary">
                            <th className="text-left px-3 py-2 font-bold text-white">Item</th>
                            <th className="text-center px-2 py-2 font-bold text-white w-16">Solicit.</th>
                            <th className="text-center px-2 py-2 font-bold text-white w-16">Enviada</th>
                            <th className="text-center px-2 py-2 font-bold text-white w-16">Recibida</th>
                            <th className="text-center px-2 py-2 font-bold text-white w-24">Progreso</th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.map((item, idx) => {
                            const recibido = Number(item.cantidad_recibida) || 0;
                            const totalEsperado = item.cantidad_enviada != null
                                ? Number(item.cantidad_enviada)
                                : Number(item.cantidad_solicitada);
                            const pendiente = Math.max(0, totalEsperado - recibido);
                            return (
                                <tr key={item.id || idx} className={cn(idx % 2 === 0 ? "bg-card" : "bg-muted/40")}>
                                    <td className="px-3 py-1.5 font-medium text-brand-dark">
                                        <button type="button" onClick={() => onOpenItem(item.item_id)} className="text-left hover:underline hover:text-brand-primary transition-colors cursor-pointer">
                                            {item.item_descripcion || `Item #${item.item_id}`}
                                        </button>
                                    </td>
                                    <td className="px-2 py-1.5 text-center font-semibold">{Number(item.cantidad_solicitada)}</td>
                                    <td className="px-2 py-1.5 text-center">{item.cantidad_enviada != null ? Number(item.cantidad_enviada) : '—'}</td>
                                    <td className="px-2 py-1.5 text-center">{item.cantidad_recibida != null ? Number(item.cantidad_recibida) : '—'}</td>
                                    <td className="px-2 py-1.5">
                                        {totalEsperado > 0
                                            ? <ProgressBar recibido={recibido} pendiente={pendiente} compact showLabel />
                                            : <span className="text-micro text-muted-foreground/50 block text-center">—</span>}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
