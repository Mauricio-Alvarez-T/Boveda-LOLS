import React, { useState } from 'react';
import { cn } from '../../utils/cn';
import { parseCantidad } from '../../utils/parseCantidad';

/**
 * Campo de cantidad suelto (sin − / +) que acepta decimales con coma o punto.
 * Para materiales de construcción que se piden en fracciones (½ m³ de arena,
 * 0,25 ton de fierro).
 *
 * Es `type="text"` + `inputMode="decimal"` a propósito: con `type="number"`,
 * Safari en iPhone con teclado en español entrega "" al escribir «0,5».
 * Mientras se escribe guarda el texto tal cual (para no comerse la coma de «0,»);
 * al salir del campo vuelve a mostrar el número del padre.
 */
export const CantidadInput: React.FC<{
    value: number;
    onChange: (v: number) => void;
    invalid?: boolean;
    className?: string;
    ariaLabel?: string;
}> = ({ value, onChange, invalid = false, className, ariaLabel }) => {
    const [draft, setDraft] = useState<string | null>(null);
    return (
        <input
            type="text"
            inputMode="decimal"
            value={draft ?? (value ? String(value).replace('.', ',') : '')}
            onFocus={e => e.currentTarget.select()}
            onChange={e => {
                setDraft(e.target.value);
                onChange(parseCantidad(e.target.value) ?? 0);
            }}
            onBlur={() => setDraft(null)}
            placeholder="cant."
            aria-label={ariaLabel ?? 'Cantidad'}
            aria-invalid={invalid || undefined}
            className={cn(
                'px-1 text-xs text-center border rounded-lg',
                invalid ? 'border-red-400 dark:border-red-500/60' : 'border-border',
                className,
            )}
        />
    );
};
