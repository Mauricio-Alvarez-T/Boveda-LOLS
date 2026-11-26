import React, { useState, useEffect } from 'react';
import { cn } from '../../utils/cn';
import { formatCLP, parseCLP } from '../../utils/currency';
import { FieldError } from './FieldError';
import { MontoInput } from './MontoInput';

interface CurrencyInputProps {
    label?: string;
    error?: string;
    placeholder?: string;
    value: number;
    onChange: (value: number) => void;
    onBlur?: () => void;
    className?: string;
    disabled?: boolean;
    /** Acepta hasta 2 decimales con coma o punto («$1.250,75»). Por defecto, solo
     *  pesos enteros como siempre (sueldos, cobros, etc.). Ver `MontoInput`. */
    decimales?: boolean;
}

export const CurrencyInput = React.forwardRef<HTMLInputElement, CurrencyInputProps>(
    ({ label, error, placeholder, value, onChange, onBlur, className, disabled = false, decimales = false }, ref) => {
        const [display, setDisplay] = useState<string>(value ? formatCLP(value) : '');

        useEffect(() => {
            setDisplay(value ? formatCLP(value) : '');
        }, [value]);

        const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
            if (disabled) return;
            const parsed = parseCLP(e.target.value);
            onChange(parsed);
            setDisplay(parsed ? formatCLP(parsed) : e.target.value.replace(/[^\d$.,]/g, ''));
        };

        const clases = cn(
            "flex h-11 w-full rounded-xl border border-border bg-card px-4 py-2 text-base text-brand-dark placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/30 focus-visible:border-brand-primary transition-all hover:border-[var(--border-hover)]",
            error && "border-destructive focus-visible:ring-destructive/30 focus-visible:border-destructive",
            disabled && "bg-gray-100 text-gray-500 cursor-not-allowed hover:border-border",
            className
        );

        return (
            <div className="w-full space-y-1.5">
                {label && (
                    <label className="text-sm font-medium text-muted-foreground ml-0.5">
                        {label}
                    </label>
                )}
                {decimales ? (
                    <MontoInput
                        ref={ref}
                        value={value}
                        onChange={onChange}
                        onBlur={onBlur}
                        placeholder={placeholder || '$0'}
                        disabled={disabled}
                        aria-disabled={disabled}
                        className={clases}
                    />
                ) : (
                    <input
                        ref={ref}
                        type="text"
                        inputMode="numeric"
                        value={display}
                        onChange={handleChange}
                        onBlur={onBlur}
                        placeholder={placeholder || '$0'}
                        disabled={disabled}
                        aria-disabled={disabled}
                        className={clases}
                    />
                )}
                <FieldError message={error} />
            </div>
        );
    }
);

CurrencyInput.displayName = 'CurrencyInput';
