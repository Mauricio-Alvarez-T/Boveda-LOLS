import React, { useState, useEffect } from 'react';
import { cn } from '../../utils/cn';
import { formatCLP, parseCLP } from '../../utils/currency';
import { FieldError } from './FieldError';

interface CurrencyInputProps {
    label?: string;
    error?: string;
    placeholder?: string;
    value: number;
    onChange: (value: number) => void;
    onBlur?: () => void;
    className?: string;
    disabled?: boolean;
}

export const CurrencyInput = React.forwardRef<HTMLInputElement, CurrencyInputProps>(
    ({ label, error, placeholder, value, onChange, onBlur, className, disabled = false }, ref) => {
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

        return (
            <div className="w-full space-y-1.5">
                {label && (
                    <label className="text-sm font-medium text-muted-foreground ml-0.5">
                        {label}
                    </label>
                )}
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
                    className={cn(
                        "flex h-11 w-full rounded-xl border border-border bg-card px-4 py-2 text-base text-brand-dark placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/30 focus-visible:border-brand-primary transition-all hover:border-[var(--border-hover)]",
                        error && "border-destructive focus-visible:ring-destructive/30 focus-visible:border-destructive",
                        disabled && "bg-gray-100 text-gray-500 cursor-not-allowed hover:border-border",
                        className
                    )}
                />
                <FieldError message={error} />
            </div>
        );
    }
);

CurrencyInput.displayName = 'CurrencyInput';
