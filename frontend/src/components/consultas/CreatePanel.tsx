import React from 'react';
import { crearItems } from './crearItems';
import { Button } from '../ui/Button';

interface CreatePanelProps {
    hasPermission: (perm: string) => boolean;
    setModalType: (type: 'form' | 'empresa' | 'obra' | 'cargo' | 'tipodoc' | 'solicitud' | null) => void;
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
    const items = crearItems(setModalType, setSelectedWorkerForAction);
    const visible = items.filter(it => hasPermission(it.perm));
    if (visible.length === 0) return null;

    return (
        <div className="flex items-center gap-1 p-2 bg-card/80 backdrop-blur-xl rounded-2xl border border-border overflow-x-auto scrollbar-none shadow-sm">
            {visible.map(item => {
                const Icon = item.icon;
                return (
                    <Button
                        key={item.label}
                        variant="ghost"
                        size="sm"
                        onClick={item.onClick}
                        title={item.title ?? `Nuevo ${item.label}`}
                        leftIcon={<Icon className="h-4 w-4 shrink-0" />}
                        className="shrink-0 whitespace-nowrap uppercase tracking-[0.12em] text-caption font-black text-muted-foreground hover:text-brand-primary"
                    >
                        {item.label}
                    </Button>
                );
            })}
        </div>
    );
};
