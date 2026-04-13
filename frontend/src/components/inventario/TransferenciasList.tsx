import React, { useEffect } from 'react';
import { ArrowRight, Clock, CheckCircle2, Truck, PackageCheck, XCircle, Ban } from 'lucide-react';
import { cn } from '../../utils/cn';
import type { Transferencia } from '../../types/entities';

interface Props {
    transferencias: Transferencia[];
    loading: boolean;
    onSelect: (t: Transferencia) => void;
    onRefresh: () => void;
}

const estadoConfig: Record<string, { label: string; color: string; icon: React.ElementType }> = {
    pendiente: { label: 'Pendiente', color: 'bg-amber-100 text-amber-700 border-amber-200', icon: Clock },
    aprobada: { label: 'Aprobada', color: 'bg-blue-100 text-blue-700 border-blue-200', icon: CheckCircle2 },
    en_transito: { label: 'En Tránsito', color: 'bg-indigo-100 text-indigo-700 border-indigo-200', icon: Truck },
    recibida: { label: 'Recibida', color: 'bg-green-100 text-green-700 border-green-200', icon: PackageCheck },
    rechazada: { label: 'Rechazada', color: 'bg-red-100 text-red-700 border-red-200', icon: XCircle },
    cancelada: { label: 'Cancelada', color: 'bg-gray-100 text-gray-500 border-gray-200', icon: Ban },
};

const TransferenciasList: React.FC<Props> = ({ transferencias, loading, onSelect, onRefresh }) => {
    useEffect(() => { onRefresh(); }, []);

    if (loading) return <div className="py-8 text-center text-muted-foreground text-sm">Cargando...</div>;

    if (!transferencias.length) {
        return (
            <div className="py-12 text-center text-muted-foreground">
                <Truck className="h-10 w-10 mx-auto opacity-20 mb-3" />
                <p className="text-sm font-medium">No hay transferencias registradas</p>
            </div>
        );
    }

    return (
        <div className="space-y-2">
            {transferencias.map(t => {
                const cfg = estadoConfig[t.estado] || estadoConfig.pendiente;
                const Icon = cfg.icon;
                const origen = (t as any).origen_obra_nombre || (t as any).origen_bodega_nombre || '—';
                const destino = (t as any).destino_obra_nombre || (t as any).destino_bodega_nombre || '—';
                return (
                    <div
                        key={t.id}
                        onClick={() => onSelect(t)}
                        className="flex items-center gap-3 px-4 py-3 rounded-xl border border-[#E8E8ED] hover:border-brand-primary/30 hover:bg-brand-primary/[0.02] transition-all cursor-pointer group"
                    >
                        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                                <span className="text-xs font-bold text-brand-dark">{t.codigo}</span>
                                <span className={cn("text-[9px] font-bold px-2 py-0.5 rounded-full border", cfg.color)}>
                                    {cfg.label}
                                </span>
                            </div>
                            <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                <span className="font-medium">{origen}</span>
                                <ArrowRight className="h-3 w-3" />
                                <span className="font-medium">{destino}</span>
                            </div>
                        </div>
                        <div className="text-right shrink-0">
                            <p className="text-[10px] text-muted-foreground">
                                {new Date(t.fecha_solicitud).toLocaleDateString('es-CL', { day: '2-digit', month: 'short' })}
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                                {(t as any).solicitante_nombre || ''}
                            </p>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

export default TransferenciasList;
