import React from 'react';
import { Building2, Briefcase, FileText, UserPlus, PlusCircle } from 'lucide-react';

interface CreatePanelProps {
    hasPermission: (perm: string) => boolean;
    setModalType: (type: 'form' | 'empresa' | 'obra' | 'cargo' | 'tipodoc' | null) => void;
    setSelectedWorkerForAction: (worker: any) => void;
}

export const CreatePanel: React.FC<CreatePanelProps> = ({
    hasPermission,
    setModalType,
    setSelectedWorkerForAction
}) => (
    <div className="p-5 bg-white border border-[#E8E8ED] rounded-2xl shadow-sm grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
        {hasPermission('trabajadores.crear') && (
            <button
                onClick={() => {
                    setSelectedWorkerForAction(null);
                    setModalType('form');
                }}
                className="flex flex-col items-center justify-center p-4 rounded-xl border border-border hover:border-brand-primary/50 hover:bg-brand-primary/5 transition-all group gap-2"
            >
                <div className="h-10 w-10 rounded-full bg-brand-primary/10 flex items-center justify-center text-brand-primary group-hover:scale-110 transition-transform">
                    <UserPlus className="h-5 w-5" />
                </div>
                <span className="text-xs font-bold text-brand-dark uppercase tracking-tight">Trabajador</span>
            </button>
        )}

        {hasPermission('empresas.crear') && (
            <button
                onClick={() => setModalType('empresa')}
                className="flex flex-col items-center justify-center p-4 rounded-xl border border-border hover:border-brand-primary/50 hover:bg-brand-primary/5 transition-all group gap-2"
            >
                <div className="h-10 w-10 rounded-full bg-brand-primary/10 flex items-center justify-center text-brand-primary group-hover:scale-110 transition-transform">
                    <Building2 className="h-5 w-5" />
                </div>
                <span className="text-xs font-bold text-brand-dark uppercase tracking-tight">Empresa</span>
            </button>
        )}

        {hasPermission('obras.crear') && (
            <button
                onClick={() => setModalType('obra')}
                className="flex flex-col items-center justify-center p-4 rounded-xl border border-border hover:border-brand-primary/50 hover:bg-brand-primary/5 transition-all group gap-2"
            >
                <div className="h-10 w-10 rounded-full bg-brand-primary/10 flex items-center justify-center text-brand-primary group-hover:scale-110 transition-transform">
                    <PlusCircle className="h-5 w-5" />
                </div>
                <span className="text-xs font-bold text-brand-dark uppercase tracking-tight">Obra / Proyecto</span>
            </button>
        )}

        {hasPermission('cargos.crear') && (
            <button
                onClick={() => setModalType('cargo')}
                className="flex flex-col items-center justify-center p-4 rounded-xl border border-border hover:border-brand-primary/50 hover:bg-brand-primary/5 transition-all group gap-2"
            >
                <div className="h-10 w-10 rounded-full bg-brand-primary/10 flex items-center justify-center text-brand-primary group-hover:scale-110 transition-transform">
                    <Briefcase className="h-5 w-5" />
                </div>
                <span className="text-xs font-bold text-brand-dark uppercase tracking-tight">Cargo</span>
            </button>
        )}

        {hasPermission('sistema.tipos_doc.gestionar') && (
            <button
                onClick={() => setModalType('tipodoc')}
                className="flex flex-col items-center justify-center p-4 rounded-xl border border-border hover:border-brand-primary/50 hover:bg-brand-primary/5 transition-all group gap-2"
            >
                <div className="h-10 w-10 rounded-full bg-brand-primary/10 flex items-center justify-center text-brand-primary group-hover:scale-110 transition-transform">
                    <FileText className="h-5 w-5" />
                </div>
                <span className="text-xs font-bold text-brand-dark uppercase tracking-tight">Tipo de Docto</span>
            </button>
        )}
    </div>
);
