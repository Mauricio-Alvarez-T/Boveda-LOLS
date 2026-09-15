import type React from 'react';
import { Building2, Briefcase, FileText, UserPlus, PlusCircle } from 'lucide-react';

export type ModalCrear = 'form' | 'empresa' | 'obra' | 'cargo' | 'tipodoc' | 'solicitud' | null;

export interface CrearItem { perm: string; label: string; icon: React.ElementType; onClick: () => void; title?: string }

/** Catálogo único de acciones "Crear" (lo comparten el panel del header y la portada de Gestiones). */
export function crearItems(setModalType: (type: ModalCrear) => void, setSelectedWorkerForAction: (worker: null) => void): CrearItem[] {
    return [
        {
            perm: 'trabajadores.crear', label: 'Trabajador', icon: UserPlus,
            onClick: () => { setSelectedWorkerForAction(null); setModalType('form'); }
        },
        {
            // Ficha de ingreso digital: terreno SOLICITA (sin empresa); la oficina aprueba y crea.
            perm: 'trabajadores.solicitud.crear', label: 'Nuevo ingreso', icon: UserPlus,
            title: 'Solicitar ingreso de trabajador (ficha digital)',
            onClick: () => setModalType('solicitud')
        },
        { perm: 'empresas.crear', label: 'Empresa', icon: Building2, onClick: () => setModalType('empresa') },
        { perm: 'obras.crear', label: 'Obra / Proyecto', icon: PlusCircle, onClick: () => setModalType('obra') },
        { perm: 'cargos.crear', label: 'Cargo', icon: Briefcase, onClick: () => setModalType('cargo') },
        { perm: 'sistema.tipos_doc.gestionar', label: 'Tipo de Docto', icon: FileText, onClick: () => setModalType('tipodoc') },
    ];
}
