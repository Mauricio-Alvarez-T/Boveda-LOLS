import React from 'react';
import { crearItems } from './crearItems';
import { Button } from '../ui/Button';
import { BarraPaginada } from '../ui/BarraPaginada';

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
        // Si no caben (celular): de a páginas con flechas, sin botones cortados (ui/BarraPaginada, Marcos 2026-10-21).
        <div className="flex items-center p-2 bg-card/80 backdrop-blur-xl rounded-2xl border border-border shadow-sm">
        <BarraPaginada selector="[data-crear]" className="flex-1">{p => (
        <div className="flex shrink-0 items-center gap-1">
            {visible.map((item, i) => {
                const Icon = item.icon;
                return (
                    <Button
                        key={item.label}
                        data-crear
                        style={p.estiloOpcion(i)}
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
        )}</BarraPaginada>
        </div>
    );
};
