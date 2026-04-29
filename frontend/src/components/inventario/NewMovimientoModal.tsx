import React from 'react';
import { ClipboardList, Truck, ArrowLeftRight, Undo2, Building2, Crown } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { cn } from '../../utils/cn';

export type TipoMovimiento = 'solicitud' | 'push_directo' | 'intra_bodega' | 'devolucion' | 'intra_obra' | 'orden_gerencia';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (tipo: TipoMovimiento) => void;
}

interface Option {
    tipo: TipoMovimiento;
    icon: React.ReactNode;
    title: string;
    subtitle: string;
    description: string;
    accent: string;
}

const OPTIONS: Option[] = [
    {
        tipo: 'solicitud',
        icon: <ClipboardList className="h-5 w-5" />,
        title: 'Solicitud estándar',
        subtitle: 'Obra pide a bodega',
        description: 'Flujo con aprobación: pendiente → aprobada → en tránsito → recibida.',
        accent: 'brand-primary',
    },
    {
        tipo: 'push_directo',
        icon: <Truck className="h-5 w-5" />,
        title: 'Push directo',
        subtitle: 'Bodega → Obra, sin aprobación',
        description: 'El bodeguero despacha directo. Queda en tránsito hasta que la obra reciba.',
        accent: 'emerald-500',
    },
    {
        tipo: 'intra_bodega',
        icon: <ArrowLeftRight className="h-5 w-5" />,
        title: 'Intra-bodega',
        subtitle: 'Bodega → Bodega',
        description: 'Movimiento instantáneo entre bodegas. Se registra como recibida inmediatamente.',
        accent: 'blue-500',
    },
    {
        tipo: 'devolucion',
        icon: <Undo2 className="h-5 w-5" />,
        title: 'Devolución',
        subtitle: 'Obra → Bodega',
        description: 'Obra devuelve material (cierre de obra). Requiere aprobación del dueño de bodega.',
        accent: 'amber-500',
    },
    {
        tipo: 'intra_obra',
        icon: <Building2 className="h-5 w-5" />,
        title: 'Intra-obra',
        subtitle: 'Obra → Obra',
        description: 'Traslado entre obras. Requiere aprobación del jefe de obra destino.',
        accent: 'indigo-500',
    },
    {
        tipo: 'orden_gerencia',
        icon: <Crown className="h-5 w-5" />,
        title: 'Orden de gerencia',
        subtitle: 'Bypasa aprobación',
        description: 'Orden ejecutiva PM/dueño. Nace en tránsito, motivo obligatorio.',
        accent: 'purple-500',
    },
];

const NewMovimientoModal: React.FC<Props> = ({ isOpen, onClose, onSelect }) => {
    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Nuevo movimiento de inventario">
            <div className="space-y-2">
                <p className="text-xs text-muted-foreground mb-3">
                    Elige el tipo de movimiento. Cada flujo tiene sus propios pasos.
                </p>
                {OPTIONS.map(opt => (
                    <button
                        key={opt.tipo}
                        type="button"
                        onClick={() => onSelect(opt.tipo)}
                        className={cn(
                            'w-full text-left p-3 rounded-xl border transition-all',
                            'border-[#E8E8ED] hover:border-brand-primary/50 hover:bg-brand-primary/5',
                            'flex gap-3 items-start'
                        )}
                    >
                        <div className={cn(
                            'shrink-0 w-10 h-10 rounded-lg flex items-center justify-center',
                            `bg-${opt.accent}/10 text-${opt.accent}`
                        )}>
                            {opt.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-bold text-brand-dark">{opt.title}</span>
                                <span className="text-[10px] text-muted-foreground font-medium">{opt.subtitle}</span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">{opt.description}</p>
                        </div>
                    </button>
                ))}
            </div>
        </Modal>
    );
};

export default NewMovimientoModal;
