import React from 'react';
import { Minus, Plus } from 'lucide-react';
import { cn } from '../../utils/cn';

/**
 * Control de cantidad estándar (− input +) para todo el módulo de inventario/
 * transferencias. Unifica los 6 steppers que estaban inline con estilos distintos
 * (wizard, aprobación, recepción, facturas). Fase 4.3.
 * - `variant='inline'`: − muted, + verde (catálogo/revisar).
 * - `variant='card'`: ambos con borde + hover (recepción).
 * - `warning`: marca el input en rojo (exceso) o ámbar (sobrante).
 */
const SIZES = {
    sm: { btn: 'h-7 w-7', input: 'w-12 h-7', icon: 'h-3.5 w-3.5' },
    md: { btn: 'h-9 w-9', input: 'w-14 h-9', icon: 'h-3.5 w-3.5' },
    lg: { btn: 'h-10 w-10', input: 'w-16 h-10', icon: 'h-4 w-4' },
};

export const QtyStepper: React.FC<{
    value: number;
    onChange: (v: number) => void;
    min?: number;
    max?: number;
    unidad?: string | null;
    size?: 'sm' | 'md' | 'lg';
    variant?: 'inline' | 'card';
    warning?: 'exceso' | 'sobrante' | null;
    disabled?: boolean;
    ariaLabel?: string;
}> = ({ value, onChange, min = 0, max, unidad, size = 'md', variant = 'inline', warning = null, disabled = false, ariaLabel }) => {
    const s = SIZES[size];
    const clamp = (v: number) => {
        let n = Number.isFinite(v) ? v : min;
        if (n < min) n = min;
        if (max != null && n > max) n = max;
        return n;
    };

    const btnBase = 'flex items-center justify-center rounded-lg shrink-0 transition-colors disabled:opacity-40 disabled:cursor-not-allowed';
    const cardStyle = 'border border-border bg-card text-brand-dark hover:border-brand-primary/40 hover:bg-brand-primary/5';
    const inputBorder = warning === 'exceso'
        ? 'border-red-400 text-red-700 dark:border-red-500/40 dark:text-red-300'
        : warning === 'sobrante'
            ? 'border-amber-400 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200'
            : 'border-border';

    return (
        <div className="flex items-center gap-1 shrink-0">
            {/* eslint-disable-next-line no-restricted-syntax -- control compuesto stepper */}
            <button
                type="button"
                onClick={() => onChange(clamp(value - 1))}
                disabled={disabled || value <= min}
                aria-label={ariaLabel ? `Restar a ${ariaLabel}` : 'Restar'}
                className={cn(btnBase, s.btn, variant === 'card' ? cardStyle : 'bg-muted text-brand-dark')}
            >
                <Minus className={s.icon} />
            </button>
            <input
                type="number"
                inputMode="decimal"
                min={min}
                max={max}
                value={value}
                disabled={disabled}
                onChange={e => onChange(clamp(parseInt(e.target.value) || 0))}
                aria-label={ariaLabel}
                className={cn('px-1 text-center text-label font-bold border rounded-lg outline-none', s.input, inputBorder)}
            />
            {/* eslint-disable-next-line no-restricted-syntax -- control compuesto stepper */}
            <button
                type="button"
                onClick={() => onChange(clamp(value + 1))}
                disabled={disabled || (max != null && value >= max)}
                aria-label={ariaLabel ? `Sumar a ${ariaLabel}` : 'Sumar'}
                className={cn(btnBase, s.btn, variant === 'card' ? cardStyle : 'bg-brand-primary/10 text-brand-primary hover:bg-brand-primary/20')}
            >
                <Plus className={s.icon} strokeWidth={3} />
            </button>
            {unidad && <span className="text-caption text-muted-foreground ml-0.5 shrink-0">{unidad}</span>}
        </div>
    );
};
