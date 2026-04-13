import React, { useState } from 'react';
import { cn } from '../../utils/cn';
import { Pencil, Check, X } from 'lucide-react';
import type { StockObraData } from '../../hooks/inventario/useInventarioData';

interface Props {
    data: StockObraData;
    canEdit: boolean;
    onUpdateStock: (itemId: number, obraId: number, data: { cantidad?: number; valor_arriendo_override?: number | null }) => Promise<boolean>;
    onUpdateDescuento: (obraId: number, porcentaje: number) => Promise<boolean>;
    onRefresh: () => void;
}

const fmtMoney = (n: number) => `$${n.toLocaleString('es-CL')}`;

const StockUbicacionTable: React.FC<Props> = ({ data, canEdit, onUpdateStock, onUpdateDescuento, onRefresh }) => {
    const [editingCell, setEditingCell] = useState<string | null>(null);
    const [editValue, setEditValue] = useState('');

    const startEdit = (key: string, currentValue: number) => {
        setEditingCell(key);
        setEditValue(String(currentValue));
    };

    const cancelEdit = () => {
        setEditingCell(null);
        setEditValue('');
    };

    const saveEdit = async (itemId: number, field: 'cantidad' | 'valor_arriendo') => {
        const num = parseFloat(editValue);
        if (isNaN(num) || num < 0) { cancelEdit(); return; }

        const payload = field === 'cantidad'
            ? { cantidad: Math.round(num) }
            : { valor_arriendo_override: num };

        const ok = await onUpdateStock(itemId, data.obra.id, payload);
        if (ok) onRefresh();
        cancelEdit();
    };

    const handleDescuentoSave = async () => {
        const num = parseFloat(editValue);
        if (isNaN(num) || num < 0 || num > 100) { cancelEdit(); return; }
        const ok = await onUpdateDescuento(data.obra.id, num);
        if (ok) onRefresh();
        cancelEdit();
    };

    const renderCell = (key: string, value: number, itemId: number, field: 'cantidad' | 'valor_arriendo') => {
        if (editingCell === key) {
            return (
                <div className="flex items-center gap-0.5">
                    <input
                        type="number"
                        value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') saveEdit(itemId, field); if (e.key === 'Escape') cancelEdit(); }}
                        className="w-16 px-1 py-0.5 text-[11px] border rounded text-right focus:ring-1 focus:ring-brand-primary outline-none"
                        autoFocus
                    />
                    <button onClick={() => saveEdit(itemId, field)} className="p-0.5 text-brand-accent hover:bg-brand-accent/10 rounded"><Check className="h-3 w-3" /></button>
                    <button onClick={cancelEdit} className="p-0.5 text-destructive hover:bg-destructive/10 rounded"><X className="h-3 w-3" /></button>
                </div>
            );
        }

        return (
            <div className="flex items-center justify-end gap-1 group">
                <span>{field === 'valor_arriendo' ? fmtMoney(value) : value}</span>
                {canEdit && (
                    <button onClick={() => startEdit(key, value)} className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-brand-primary/10 rounded transition-opacity">
                        <Pencil className="h-2.5 w-2.5 text-brand-primary" />
                    </button>
                )}
            </div>
        );
    };

    return (
        <div className="overflow-x-auto">
            <table className="w-full text-[11px] border-collapse">
                <thead>
                    <tr className="bg-brand-primary/5">
                        <th className="px-2 py-2 text-left font-bold text-brand-dark border-b border-[#E8E8ED] w-8">#</th>
                        <th className="px-2 py-2 text-left font-bold text-brand-dark border-b border-[#E8E8ED] min-w-[200px]">Descripción</th>
                        <th className="px-2 py-2 text-right font-bold text-brand-dark border-b border-[#E8E8ED] w-14">M2</th>
                        <th className="px-2 py-2 text-right font-bold text-brand-dark border-b border-[#E8E8ED] w-24">V. Arriendo</th>
                        <th className="px-2 py-2 text-center font-bold text-brand-dark border-b border-[#E8E8ED] w-10">UN</th>
                        <th className="px-2 py-2 text-right font-bold text-brand-dark border-b border-[#E8E8ED] w-16">Cantidad</th>
                        <th className="px-2 py-2 text-right font-bold text-brand-dark border-b border-[#E8E8ED] w-24">Total</th>
                    </tr>
                </thead>
                <tbody>
                    {data.categorias.map(cat => (
                        <React.Fragment key={cat.id}>
                            <tr className="bg-brand-primary/10">
                                <td colSpan={7} className="px-3 py-1.5 font-black text-[10px] uppercase tracking-widest text-brand-primary">
                                    {cat.nombre}
                                </td>
                            </tr>
                            {cat.items.map((item, idx) => (
                                <tr key={item.id} className={cn("hover:bg-blue-50/30 transition-colors", idx % 2 === 0 ? "bg-white" : "bg-[#FAFAFA]")}>
                                    <td className="px-2 py-1 text-right text-muted-foreground">{item.nro_item}</td>
                                    <td className="px-2 py-1 font-medium text-brand-dark truncate max-w-[250px]">{item.descripcion}</td>
                                    <td className="px-2 py-1 text-right text-muted-foreground">{item.m2 ? item.m2.toFixed(2) : ''}</td>
                                    <td className="px-2 py-1 text-right">
                                        {renderCell(`arr_${item.id}`, item.valor_arriendo, item.id, 'valor_arriendo')}
                                    </td>
                                    <td className="px-2 py-1 text-center text-muted-foreground">{item.unidad}</td>
                                    <td className="px-2 py-1 text-right">
                                        {renderCell(`cant_${item.id}`, item.cantidad, item.id, 'cantidad')}
                                    </td>
                                    <td className="px-2 py-1 text-right font-semibold text-brand-dark">
                                        {item.total > 0 ? fmtMoney(item.total) : ''}
                                    </td>
                                </tr>
                            ))}
                            {/* Subtotal row */}
                            <tr className="bg-[#F0F0F5] border-t border-[#E8E8ED]">
                                <td colSpan={5} className="px-3 py-1.5 text-right font-bold text-[10px] uppercase text-muted-foreground">
                                    Total {cat.nombre}
                                </td>
                                <td className="px-2 py-1.5 text-right font-bold text-brand-dark">{cat.subtotal_cantidad}</td>
                                <td className="px-2 py-1.5 text-right font-bold text-brand-accent">{fmtMoney(cat.subtotal_arriendo)}</td>
                            </tr>
                        </React.Fragment>
                    ))}
                    {/* Grand total */}
                    <tr className="bg-brand-primary/5 border-t-2 border-brand-primary/30">
                        <td colSpan={6} className="px-3 py-2 text-right font-black text-xs text-brand-dark">TOTAL FACTURACIÓN</td>
                        <td className="px-2 py-2 text-right font-black text-xs text-brand-primary">{fmtMoney(data.total_facturacion)}</td>
                    </tr>
                    {data.descuento_porcentaje > 0 && (
                        <tr className="bg-amber-50/50">
                            <td colSpan={6} className="px-3 py-2 text-right font-bold text-xs text-muted-foreground">
                                Descuento {data.descuento_porcentaje}%
                            </td>
                            <td className="px-2 py-2 text-right font-bold text-xs text-destructive">-{fmtMoney(data.descuento_monto)}</td>
                        </tr>
                    )}
                    {data.descuento_porcentaje > 0 && (
                        <tr className="bg-brand-accent/5 border-t-2 border-brand-accent/30">
                            <td colSpan={6} className="px-3 py-2 text-right font-black text-xs text-brand-dark">TOTAL CON DESCUENTO</td>
                            <td className="px-2 py-2 text-right font-black text-xs text-brand-accent">{fmtMoney(data.total_con_descuento)}</td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
};

export default StockUbicacionTable;
