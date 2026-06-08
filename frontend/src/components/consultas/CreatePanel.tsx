import React from 'react';
import { Building2, Briefcase, FileText, UserPlus, PlusCircle } from 'lucide-react';
import { cn } from '../../utils/cn';

interface CreatePanelProps {
    hasPermission: (perm: string) => boolean;
    setModalType: (type: 'form' | 'empresa' | 'obra' | 'cargo' | 'tipodoc' | null) => void;
    setSelectedWorkerForAction: (worker: any) => void;
}

/**
 * Panel "Crear" — versión compacta horizontal estilo tabs de Inventario:
 * ícono pequeño (h-4 w-4) AL LADO del texto, padding chico, una sola fila.
 * Cada botón conserva su acción (abrir modal correspondiente).
 */
export const CreatePanel: React.FC<CreatePanelProps> = ({
    hasPermission,
    setModalType,
    setSelectedWorkerForAction
}) => {
    const items: { perm: string; label: string; icon: React.ElementType; onClick: () => void }[] = [
        {
            perm: 'trabajadores.crear', label: 'Trabajador', icon: UserPlus,
            onClick: () => { setSelectedWorkerForAction(null); setModalType('form'); }
        },
        {
            perm: 'empresas.crear', label: 'Empresa', icon: Building2,
            onClick: () => setModalType('empresa')
        },
        {
            perm: 'obras.crear', label: 'Obra / Proyecto', icon: PlusCircle,
            onClick: () => setModalType('obra')
        },
        {
            perm: 'cargos.crear', label: 'Cargo', icon: Briefcase,
            onClick: () => setModalType('cargo')
        },
        {
            perm: 'sistema.tipos_doc.gestionar', label: 'Tipo de Docto', icon: FileText,
            onClick: () => setModalType('tipodoc')
        },
    ];
    const visible = items.filter(it => hasPermission(it.perm));
    if (visible.length === 0) return null;

    return (
        <div className="flex items-center gap-1 p-2 bg-card/80 backdrop-blur-xl rounded-2xl border border-border overflow-x-auto scrollbar-none shadow-sm">
            {visible.map(item => {
                const Icon = item.icon;
                return (
                    <button
                        key={item.label}
                        onClick={item.onClick}
                        title={`Nuevo ${item.label}`}
                        className={cn(
                            "flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-[0.12em] whitespace-nowrap shrink-0 transition-all",
                            "text-muted-foreground hover:bg-background hover:text-brand-primary"
                        )}
                    >
                        <Icon className="h-4 w-4 shrink-0 text-muted-foreground/60 group-hover:text-brand-primary" />
                        <span>{item.label}</span>
                    </button>
                );
            })}
        </div>
    );
};
