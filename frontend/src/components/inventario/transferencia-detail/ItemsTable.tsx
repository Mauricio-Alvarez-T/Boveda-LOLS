import React from 'react';
import { Package } from 'lucide-react';
import { cn } from '../../../utils/cn';
import type { TransferenciaItem } from '../../../types/entities';

/**
 * Tabla de ítems de catálogo del detalle de transferencia (columnas
 * Solicitada / Enviada / Recibida). Extraída de TransferenciaDetail.tsx (Fase 1).
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
                                    <button type="button" onClick={() => onOpenItem(item.item_id)} className="text-left hover:underline hover:text-brand-primary transition-colors cursor-pointer">
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
    );
};
