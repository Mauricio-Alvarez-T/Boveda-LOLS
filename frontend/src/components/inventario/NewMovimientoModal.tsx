import React from 'react';
import { ClipboardList, Truck, ArrowLeftRight, Undo2, Building2, Crown, AlertTriangle, HardHat } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { cn } from '../../utils/cn';

export type TipoMovimiento = 'solicitud' | 'solicitud_materiales' | 'push_directo' | 'intra_bodega' | 'devolucion' | 'intra_obra' | 'orden_gerencia';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (tipo: TipoMovimiento) => void;
    /**
     * Gating granular por permiso. Cada flujo sólo aparece si el usuario tiene
     * el permiso correspondiente. Flujos especiales (push_directo, intra_bodega,
     * orden_gerencia) son críticos ⚠️ — el catálogo backend los marca como
     * sensible=critico para que el admin reciba un warning al concederlos.
     */
    hasPermission: (p: string) => boolean;
}

interface Option {
    tipo: TipoMovimiento;
    icon: React.ReactNode;
    title: string;
    subtitle: string;
    description: string;
    accent: string;
    /** Permiso requerido para que el flujo aparezca en el modal. */
    permiso: string;
    /** True = flujo especial que consolida roles (badge ⚠️ visible). */
    critico?: boolean;
}

const OPTIONS: Option[] = [
    {
        tipo: 'solicitud',
        icon: <ClipboardList className="h-5 w-5" />,
        title: 'Solicitud estándar',
        subtitle: 'Obra pide a bodega',
        description: 'Flujo con aprobación: pendiente → aprobada → en tránsito → recibida.',
        accent: 'brand-primary',
        permiso: 'inventario.transferencias.solicitar',
    },
    {
        tipo: 'solicitud_materiales',
        icon: <HardHat className="h-5 w-5" />,
        title: 'Solicitud de materiales',
        subtitle: 'Obra pide materiales de construcción',
        description: 'Solicita materiales (cemento, fierro, áridos, etc.). Flujo con aprobación.',
        accent: 'teal-500',
        permiso: 'inventario.transferencias.solicitud_materiales',
    },
    {
        tipo: 'push_directo',
        icon: <Truck className="h-5 w-5" />,
        title: 'Push directo',
        subtitle: 'Bodega → Obra, sin aprobación',
        description: 'El bodeguero despacha directo. Queda en tránsito hasta que la obra reciba.',
        accent: 'emerald-500',
        permiso: 'inventario.transferencias.push_directo',
        critico: true,
    },
    {
        tipo: 'intra_bodega',
        icon: <ArrowLeftRight className="h-5 w-5" />,
        title: 'Intra-bodega',
        subtitle: 'Bodega → Bodega',
        description: 'Movimiento instantáneo entre bodegas. Se registra como recibida inmediatamente.',
        accent: 'blue-500',
        permiso: 'inventario.transferencias.intra_bodega',
        critico: true,
    },
    {
        tipo: 'devolucion',
        icon: <Undo2 className="h-5 w-5" />,
        title: 'Devolución',
        subtitle: 'Obra → Bodega',
        description: 'Obra devuelve material (cierre de obra). Requiere aprobación del dueño de bodega.',
        accent: 'amber-500',
        permiso: 'inventario.transferencias.solicitar',
    },
    {
        tipo: 'intra_obra',
        icon: <Building2 className="h-5 w-5" />,
        title: 'Intra-obra',
        subtitle: 'Obra → Obra',
        description: 'Traslado entre obras. Requiere aprobación del jefe de obra destino.',
        accent: 'indigo-500',
        permiso: 'inventario.transferencias.solicitar',
    },
    {
        tipo: 'orden_gerencia',
        icon: <Crown className="h-5 w-5" />,
        title: 'Orden de gerencia',
        subtitle: 'Bypasa aprobación',
        description: 'Orden ejecutiva PM/dueño. Nace en tránsito, motivo obligatorio.',
        accent: 'purple-500',
        permiso: 'inventario.transferencias.orden_gerencia',
        critico: true,
    },
];

const NewMovimientoModal: React.FC<Props> = ({ isOpen, onClose, onSelect, hasPermission }) => {
    // Filtra opciones por permiso individual del usuario.
    const visibles = OPTIONS.filter(opt => hasPermission(opt.permiso));

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Nuevo movimiento de inventario">
            <div className="space-y-2">
                {visibles.length === 0 ? (
                    <div className="text-center py-8 text-sm text-muted-foreground">
                        No tienes permisos para crear movimientos.
                        <br />
                        Contacta al admin para que te asigne al menos "Solicitar Transferencia".
                    </div>
                ) : (
                    <>
                        <p className="text-xs text-muted-foreground mb-3">
                            Elige el tipo de movimiento. Cada flujo tiene sus propios pasos.
                        </p>
                        {visibles.map(opt => (
                            <button
                                key={opt.tipo}
                                type="button"
                                onClick={() => onSelect(opt.tipo)}
                                className={cn(
                                    'w-full text-left p-3 rounded-xl border transition-all',
                                    opt.critico
                                        ? 'border-amber-200 hover:border-amber-400 hover:bg-amber-50/50'
                                        : 'border-border hover:border-brand-primary/50 hover:bg-brand-primary/5',
                                    'flex gap-3 items-start'
                                )}
                            >
                                <div className={cn(
                                    'shrink-0 w-10 h-10 rounded-lg flex items-center justify-center',
                                    'bg-muted text-muted-foreground'
                                )}>
                                    {opt.icon}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="text-sm font-bold text-brand-dark">{opt.title}</span>
                                        {opt.critico && (
                                            <span className="inline-flex items-center gap-0.5 text-micro font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-800/60">
                                                <AlertTriangle className="h-2.5 w-2.5" />
                                                Crítico
                                            </span>
                                        )}
                                        <span className="text-caption text-muted-foreground font-medium">{opt.subtitle}</span>
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-0.5">{opt.description}</p>
                                </div>
                            </button>
                        ))}
                    </>
                )}
            </div>
        </Modal>
    );
};

export default NewMovimientoModal;
