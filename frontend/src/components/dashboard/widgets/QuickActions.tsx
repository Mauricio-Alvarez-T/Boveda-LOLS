import React from 'react';
import { Users, CheckSquare, FileText, Settings } from 'lucide-react';
import { Button } from '../../ui/Button';
import type { Permission } from '../../../types';

interface Props {
    permisos: Permission[];
    onNavigate: (route: string) => void;
}

interface QuickAction {
    label: string;
    icon: React.ElementType;
    route: string;
    requiredModule: string;
    requiredAction: 'puede_ver' | 'puede_crear';
}

const ALL_ACTIONS: QuickAction[] = [
    { label: 'Gestionar Trabajadores', icon: Users, route: '/trabajadores', requiredModule: 'trabajadores', requiredAction: 'puede_ver' },
    { label: 'Registrar Asistencia', icon: CheckSquare, route: '/asistencia', requiredModule: 'asistencia', requiredAction: 'puede_crear' },
    { label: 'Exportar Fiscalización', icon: FileText, route: '/fiscalizacion', requiredModule: 'fiscalizacion', requiredAction: 'puede_ver' },
    { label: 'Configuración', icon: Settings, route: '/configuracion', requiredModule: 'configuracion', requiredAction: 'puede_ver' },
];

const QuickActions: React.FC<Props> = ({ permisos, onNavigate }) => {
    const canDo = (modulo: string, accion: string) => {
        const perm = permisos.find(p => p.modulo === modulo);
        return perm ? !!(perm as any)[accion] : false;
    };

    const availableActions = ALL_ACTIONS.filter(a => canDo(a.requiredModule, a.requiredAction));

    if (availableActions.length === 0) return null;

    return (
        <div>
            <h4 className="text-sm font-semibold text-[#1D1D1F] mb-4">Acciones Rápidas</h4>
            <div className="space-y-2">
                {availableActions.map(action => (
                    <Button
                        key={action.route}
                        variant="glass"
                        className="w-full justify-start text-xs"
                        onClick={() => onNavigate(action.route)}
                        leftIcon={<action.icon className="h-4 w-4" />}
                    >
                        {action.label}
                    </Button>
                ))}
            </div>
        </div>
    );
};

export default QuickActions;
