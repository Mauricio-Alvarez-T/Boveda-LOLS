import React from 'react';
import { Eye, Plus, Edit, Trash2 } from 'lucide-react';
import { cn } from '../../utils/cn';

export interface Permission {
    modulo: string;
    puede_ver: boolean;
    puede_crear: boolean;
    puede_editar: boolean;
    puede_eliminar: boolean;
}

interface Props {
    permisos: Permission[];
    onChange: (permisos: Permission[]) => void;
    readonly?: boolean;
}

const MODULES = [
    { key: 'trabajadores', label: 'Trabajadores' },
    { key: 'asistencia', label: 'Asistencia' },
    { key: 'documentos', label: 'Documentos' },
    { key: 'fiscalizacion', label: 'Fiscalización' },
    { key: 'usuarios', label: 'Usuarios y Roles' },
    { key: 'empresas', label: 'Empresas' },
    { key: 'obras', label: 'Obras' },
    { key: 'cargos', label: 'Cargos' }
];

export const PermissionMatrix: React.FC<Props> = ({ permisos, onChange, readonly }) => {
    const handleToggle = (modulo: string, field: keyof Omit<Permission, 'modulo'>) => {
        if (readonly) return;

        const existing = permisos.find(p => p.modulo === modulo);
        let newPermisos: Permission[];

        if (existing) {
            newPermisos = permisos.map(p =>
                p.modulo === modulo ? { ...p, [field]: !p[field] } : p
            );
        } else {
            newPermisos = [
                ...permisos,
                {
                    modulo,
                    puede_ver: false,
                    puede_crear: false,
                    puede_editar: false,
                    puede_eliminar: false,
                    [field]: true
                }
            ];
        }
        onChange(newPermisos);
    };

    return (
        <div className="bg-background rounded-2xl border border-border overflow-hidden">
            <table className="w-full text-left border-collapse">
                <thead>
                    <tr className="bg-background border-bottom border-border">
                        <th className="px-4 py-3 text-[10px] font-bold text-muted-foreground uppercase">Módulo</th>
                        <th className="px-2 py-3 text-center text-[10px] font-bold text-muted-foreground uppercase">Ver</th>
                        <th className="px-2 py-3 text-center text-[10px] font-bold text-muted-foreground uppercase">Crear</th>
                        <th className="px-2 py-3 text-center text-[10px] font-bold text-muted-foreground uppercase">Editar</th>
                        <th className="px-2 py-3 text-center text-[10px] font-bold text-muted-foreground uppercase">Borrar</th>
                    </tr>
                </thead>
                <tbody>
                    {MODULES.map((mod) => {
                        const p = permisos.find(item => item.modulo === mod.key) || {
                            modulo: mod.key,
                            puede_ver: false,
                            puede_crear: false,
                            puede_editar: false,
                            puede_eliminar: false
                        };

                        return (
                            <tr key={mod.key} className="border-t border-border hover:bg-white/40 transition-colors">
                                <td className="px-4 py-2.5">
                                    <span className="text-sm font-medium text-brand-dark">{mod.label}</span>
                                </td>
                                <PermissionToggle
                                    active={p.puede_ver}
                                    onClick={() => handleToggle(mod.key, 'puede_ver')}
                                    icon={<Eye className="h-3.5 w-3.5" />}
                                    color="text-brand-primary"
                                />
                                <PermissionToggle
                                    active={p.puede_crear}
                                    onClick={() => handleToggle(mod.key, 'puede_crear')}
                                    icon={<Plus className="h-3.5 w-3.5" />}
                                    color="text-brand-accent"
                                />
                                <PermissionToggle
                                    active={p.puede_editar}
                                    onClick={() => handleToggle(mod.key, 'puede_editar')}
                                    icon={<Edit className="h-3.5 w-3.5" />}
                                    color="text-warning"
                                />
                                <PermissionToggle
                                    active={p.puede_eliminar}
                                    onClick={() => handleToggle(mod.key, 'puede_eliminar')}
                                    icon={<Trash2 className="h-3.5 w-3.5" />}
                                    color="text-destructive"
                                />
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
};

const PermissionToggle = ({ active, onClick, icon, color }: { active: boolean, onClick: () => void, icon: React.ReactNode, color: string }) => (
    <td className="px-2 py-2.5 text-center">
        <button
            type="button"
            onClick={onClick}
            className={cn(
                "h-8 w-8 rounded-lg flex items-center justify-center transition-all border shadow-sm",
                active
                    ? `bg-white border-border ${color} scale-110`
                    : "bg-background border-transparent text-muted opacity-50 grayscale"
            )}
        >
            {icon}
        </button>
    </td>
);
