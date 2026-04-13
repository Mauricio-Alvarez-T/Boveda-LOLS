import React from 'react';
import { cn } from '../../utils/cn';
import type { ResumenData } from '../../hooks/inventario/useInventarioData';

interface Props {
    data: ResumenData;
}

const fmt = (n: number) => n.toLocaleString('es-CL');
const fmtMoney = (n: number) => `$${n.toLocaleString('es-CL')}`;

const ResumenMensualTable: React.FC<Props> = ({ data }) => {
    const { obras, bodegas, categorias } = data;

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
                                        return (
                                            <React.Fragment key={`${item.id}_obra_${o.id}`}>
                                                <td className={cn("px-2 py-1 text-center border-r border-[#F0F0F5]", ub && ub.cantidad > 0 ? "font-semibold text-brand-dark" : "text-muted-foreground/40")}>
                                                    {ub?.cantidad || ''}
                                                </td>
                                                <td className={cn("px-2 py-1 text-right border-r border-[#F0F0F5]", ub && ub.total > 0 ? "text-brand-dark" : "text-muted-foreground/40")}>
                                                    {ub && ub.total > 0 ? fmtMoney(ub.total) : ''}
                                                </td>
                                            </React.Fragment>
                                        );
                                    })}
                                    {bodegas.map(b => {
                                        const ub = item.ubicaciones[`bodega_${b.id}`];
                                        return (
                                            <td key={`${item.id}_bod_${b.id}`} className={cn("px-2 py-1 text-center border-r border-[#F0F0F5]", ub && ub.cantidad > 0 ? "font-semibold text-brand-dark" : "text-muted-foreground/40")}>
                                                {ub?.cantidad || ''}
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
