import React, { useState } from 'react';
import { cn } from '../../utils/cn';
import { Check, X } from 'lucide-react';
import type { ResumenData } from '../../hooks/inventario/useInventarioData';

interface Props {
    data: ResumenData;
    canEdit: boolean;
    onUpdateStock: (itemId: number, obraId: number | null, bodegaId: number | null, data: { cantidad: number }) => Promise<boolean>;
    onRefresh: () => void;
}

const fmt = (n: number) => n.toLocaleString('es-CL');
const fmtMoney = (n: number) => `$${n.toLocaleString('es-CL')}`;

const ResumenMensualTable: React.FC<Props> = ({ data, canEdit, onUpdateStock, onRefresh }) => {
    const { obras, bodegas, categorias } = data;
    const [editingCell, setEditingCell] = useState<string | null>(null);
    const [editValue, setEditValue] = useState('');

    const startEdit = (key: string, currentValue: number) => {
        if (!canEdit) return;
        setEditingCell(key);
        setEditValue(String(currentValue || ''));
    };

    const cancelEdit = () => {
        setEditingCell(null);
        setEditValue('');
    };

    const saveEdit = async (itemId: number, obraId: number | null, bodegaId: number | null) => {
        const num = parseInt(editValue, 10);
        if (isNaN(num) || num < 0) { cancelEdit(); return; }
        const ok = await onUpdateStock(itemId, obraId, bodegaId, { cantidad: num });
        if (ok) onRefresh();
        cancelEdit();
    };

    const renderEditableQty = (
        cellKey: string,
        cantidad: number,
        itemId: number,
        obraId: number | null,
        bodegaId: number | null,
        hasValue: boolean
    ) => {
        if (editingCell === cellKey) {
            return (
                <div className="flex items-center justify-center gap-0.5">
                    <input
                        type="number"
                        value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                        onKeyDown={e => {
                            if (e.key === 'Enter') saveEdit(itemId, obraId, bodegaId);
                            if (e.key === 'Escape') cancelEdit();
                        }}
                        className="w-14 px-1 py-0.5 text-[11px] border rounded text-center focus:ring-1 focus:ring-brand-primary outline-none"
                        autoFocus
                        min={0}
                    />
                    <button onClick={() => saveEdit(itemId, obraId, bodegaId)} className="p-0.5 text-brand-accent hover:bg-brand-accent/10 rounded">
                        <Check className="h-3 w-3" />
                    </button>
                    <button onClick={cancelEdit} className="p-0.5 text-destructive hover:bg-destructive/10 rounded">
                        <X className="h-3 w-3" />
                    </button>
                </div>
            );
        }

        return (
            <span
                onClick={() => startEdit(cellKey, cantidad)}
                className={cn(
                    hasValue ? "font-semibold text-brand-dark" : "text-muted-foreground/40",
                    canEdit && "cursor-pointer hover:bg-brand-primary/10 hover:ring-1 hover:ring-brand-primary/30 rounded px-1 py-0.5 transition-all"
                )}
                title={canEdit ? 'Click para editar' : undefined}
            >
                {hasValue ? cantidad : ''}
            </span>
        );
    };

    return (
        <div className="overflow-x-auto">
            <table className="w-full text-[11px] border-collapse min-w-[900px]">
                <thead>
                    {/* Header row 1: location names */}
                    <tr className="bg-brand-primary/5">
                        <th className="sticky left-0 bg-white z-10 px-2 py-2 text-left font-bold text-brand-dark border-b border-r border-[#E8E8ED] w-8">#</th>
                        <th className="sticky left-8 bg-white z-10 px-2 py-2 text-left font-bold text-brand-dark border-b border-r border-[#E8E8ED] min-w-[180px]">Descripción</th>
                        <th className="px-2 py-2 text-right font-bold text-brand-dark border-b border-r border-[#E8E8ED] w-16">V. Arriendo</th>
                        {obras.map(o => (
                            <th key={`obra_${o.id}`} colSpan={2} className="px-2 py-2 text-center font-bold text-brand-dark border-b border-r border-[#E8E8ED] bg-blue-50/50">
                                {o.nombre}
                            </th>
                        ))}
                        {bodegas.map(b => (
                            <th key={`bodega_${b.id}`} className="px-2 py-2 text-center font-bold text-brand-dark border-b border-r border-[#E8E8ED] bg-amber-50/50">
                                {b.nombre}
                            </th>
                        ))}
                        <th className="px-2 py-2 text-right font-bold text-brand-dark border-b border-r border-[#E8E8ED] bg-green-50/50">Total Arriendo</th>
                        <th className="px-2 py-2 text-right font-bold text-brand-dark border-b border-[#E8E8ED] bg-green-50/50">Total Unid.</th>
                    </tr>
                    {/* Header row 2: Cant / Total sub-headers */}
                    <tr className="bg-[#F9F9FB]">
                        <th className="sticky left-0 bg-[#F9F9FB] z-10 border-b border-r border-[#E8E8ED]" />
                        <th className="sticky left-8 bg-[#F9F9FB] z-10 border-b border-r border-[#E8E8ED]" />
                        <th className="border-b border-r border-[#E8E8ED]" />
                        {obras.map(o => (
                            <React.Fragment key={`sub_obra_${o.id}`}>
                                <th className="px-1 py-1 text-center text-[9px] text-muted-foreground font-semibold border-b border-r border-[#E8E8ED] uppercase tracking-wider">Cant</th>
                                <th className="px-1 py-1 text-center text-[9px] text-muted-foreground font-semibold border-b border-r border-[#E8E8ED] uppercase tracking-wider">Total</th>
                            </React.Fragment>
                        ))}
                        {bodegas.map(b => (
                            <th key={`sub_bod_${b.id}`} className="px-1 py-1 text-center text-[9px] text-muted-foreground font-semibold border-b border-r border-[#E8E8ED] uppercase tracking-wider">Cant</th>
                        ))}
                        <th className="border-b border-r border-[#E8E8ED]" />
                        <th className="border-b border-[#E8E8ED]" />
                    </tr>
                </thead>
                <tbody>
                    {categorias.map(cat => (
                        <React.Fragment key={cat.id}>
                            {/* Category header row */}
                            <tr className="bg-brand-primary/10">
                                <td colSpan={3 + obras.length * 2 + bodegas.length + 2} className="px-3 py-1.5 font-black text-[10px] uppercase tracking-widest text-brand-primary">
                                    {cat.nombre}
                                </td>
                            </tr>
                            {/* Item rows */}
                            {cat.items.map((item, idx) => (
                                <tr key={item.id} className={cn("hover:bg-blue-50/30 transition-colors", idx % 2 === 0 ? "bg-white" : "bg-[#FAFAFA]")}>
                                    <td className="sticky left-0 bg-inherit z-10 px-2 py-1 text-right text-muted-foreground border-r border-[#F0F0F5]">{item.nro_item}</td>
                                    <td className="sticky left-8 bg-inherit z-10 px-2 py-1 font-medium text-brand-dark border-r border-[#F0F0F5] truncate max-w-[200px]">{item.descripcion}</td>
                                    <td className="px-2 py-1 text-right text-muted-foreground border-r border-[#F0F0F5]">{fmtMoney(item.valor_arriendo)}</td>
                                    {obras.map(o => {
                                        const ub = item.ubicaciones[`obra_${o.id}`];
                                        const cellKey = `obra_${o.id}_item_${item.id}`;
                                        return (
                                            <React.Fragment key={cellKey}>
                                                <td className="px-2 py-1 text-center border-r border-[#F0F0F5]">
                                                    {renderEditableQty(cellKey, ub?.cantidad || 0, item.id, o.id, null, !!(ub && ub.cantidad > 0))}
                                                </td>
                                                <td className={cn("px-2 py-1 text-right border-r border-[#F0F0F5]", ub && ub.total > 0 ? "text-brand-dark" : "text-muted-foreground/40")}>
                                                    {ub && ub.total > 0 ? fmtMoney(ub.total) : ''}
                                                </td>
                                            </React.Fragment>
                                        );
                                    })}
                                    {bodegas.map(b => {
                                        const ub = item.ubicaciones[`bodega_${b.id}`];
                                        const cellKey = `bodega_${b.id}_item_${item.id}`;
                                        return (
                                            <td key={cellKey} className="px-2 py-1 text-center border-r border-[#F0F0F5]">
                                                {renderEditableQty(cellKey, ub?.cantidad || 0, item.id, null, b.id, !!(ub && ub.cantidad > 0))}
                                            </td>
                                        );
                                    })}
                                    <td className="px-2 py-1 text-right font-semibold text-brand-accent border-r border-[#F0F0F5]">
                                        {item.total_arriendo > 0 ? fmtMoney(item.total_arriendo) : ''}
                                    </td>
                                    <td className="px-2 py-1 text-right font-semibold text-brand-dark">
                                        {item.total_cantidad > 0 ? fmt(item.total_cantidad) : ''}
                                    </td>
                                </tr>
                            ))}
                        </React.Fragment>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

export default ResumenMensualTable;
