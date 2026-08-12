import React from 'react';
import { Eye, EyeOff, Sigma } from 'lucide-react';
import { cn } from '../../utils/cn';
import type { BodegaVirtualModo } from '../../hooks/inventario/useInventarioData';

/**
 * Botón cíclico del modo Bodega Virtual (mig 099):
 *   ocultar → mostrar (sin sumar) → sumar → ocultar → ...
 * Color = significado: neutral (oculta), info/azul (visible sin alterar nada),
 * warning/ámbar (ALTERA los totales mostrados).
 */

const CONFIG: Record<BodegaVirtualModo, {
    label: string; icon: React.ElementType; classes: string; next: string;
}> = {
    ocultar: {
        label: 'Virtual oculta',
        icon: EyeOff,
        classes: 'bg-card border-border text-muted-foreground hover:border-brand-primary/30',
        next: 'Click: mostrar la Bodega Virtual sin sumar a los totales',
    },
    mostrar: {
        label: 'Virtual visible',
        icon: Eye,
        classes: 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-500/15 dark:border-blue-800/60 dark:text-blue-300',
        next: 'Click: sumar la Bodega Virtual a los totales',
    },
    sumar: {
        label: 'Virtual sumando',
        icon: Sigma,
        classes: 'bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-500/15 dark:border-amber-800/60 dark:text-amber-300',
        next: 'Click: ocultar la Bodega Virtual',
    },
};

interface Props {
    modo: BodegaVirtualModo;
    onCycle: () => void;
    className?: string;
}

const BodegaVirtualToggle: React.FC<Props> = ({ modo, onCycle, className }) => {
    const cfg = CONFIG[modo];
    const Icon = cfg.icon;
    return (
        // eslint-disable-next-line no-restricted-syntax -- toggle cíclico (color = estado)
        <button
            type="button"
            onClick={onCycle}
            title={cfg.next}
            aria-label={`Bodega Virtual: ${cfg.label}. ${cfg.next}`}
            className={cn(
                'flex items-center justify-center gap-1.5 px-3 py-2 md:py-1.5 text-label font-semibold rounded-xl border transition-all whitespace-nowrap shrink-0',
                cfg.classes,
                className,
            )}
        >
            <Icon className="h-3 w-3 shrink-0" />
            {cfg.label}
        </button>
    );
};

export default BodegaVirtualToggle;
