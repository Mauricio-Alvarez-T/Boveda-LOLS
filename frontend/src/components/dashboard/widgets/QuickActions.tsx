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
    { label: 'Gestionar Trabajadores', icon: Users, route: '/consultas', requiredModule: 'trabajadores', requiredAction: 'puede_ver' },
    { label: 'Registrar Asistencia', icon: CheckSquare, route: '/asistencia', requiredModule: 'asistencia', requiredAction: 'puede_crear' },
    { label: 'Exportar Reportes', icon: FileText, route: '/consultas', requiredModule: 'fiscalizacion', requiredAction: 'puede_ver' },
    { label: 'Configuración', icon: Settings, route: '/configuracion', requiredModule: 'configuracion', requiredAction: 'puede_ver' },
];

const QuickActions: React.FC<Props> = ({ permisos, onNavigate }) => {
    const canDo = (modulo: string, accion: string) => {
        const accionMap: Record<string, string> = {
            puede_ver: 'ver',
            puede_crear: 'crear',
            puede_editar: 'editar',
            puede_eliminar: 'eliminar'
        };
        const key = `${modulo}.${accionMap[accion] || accion}`;
        return permisos.includes(key);
    };

    const availableActions = ALL_ACTIONS.filter(a => canDo(a.requiredModule, a.requiredAction));

    if (availableActions.length === 0) return null;

    return (
        <div>
            <h3 className="text-sm font-semibold text-foreground mb-4">Acciones rápidas</h3>
            {/* Botones del sistema (sin variant glass legacy): la acción de crear
                asistencia es la primaria (verde, único acento); el resto, neutras. */}
            <div className="flex flex-wrap gap-2">
                {availableActions.map(action => {
                    const isPrimary = action.requiredAction === 'puede_crear';
                    return (
                        <Button
                            key={action.route}
                            variant={isPrimary ? 'primary' : 'secondary'}
                            size="sm"
                            onClick={() => onNavigate(action.route)}
                            leftIcon={<action.icon className="h-4 w-4" />}
                        >
                            {action.label}
                        </Button>
                    );
                })}
            </div>
        </div>
    );
};

export default QuickActions;
