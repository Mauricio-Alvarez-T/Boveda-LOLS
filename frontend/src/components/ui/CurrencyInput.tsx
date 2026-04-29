import React, { useState, useEffect } from 'react';
import { cn } from '../../utils/cn';
import { formatCLP, parseCLP } from '../../utils/currency';

interface CurrencyInputProps {
    label?: string;
    error?: string;
    placeholder?: string;
    value: number;
    onChange: (value: number) => void;
    onBlur?: () => void;
    className?: string;
}

export const CurrencyInput = React.forwardRef<HTMLInputElement, CurrencyInputProps>(
    ({ label, error, placeholder, value, onChange, onBlur, className }, ref) => {
        const [display, setDisplay] = useState<string>(value ? formatCLP(value) : '');

        useEffect(() => {
            setDisplay(value ? formatCLP(value) : '');
        }, [value]);

        const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
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
                    className={cn(
                        "flex h-11 w-full rounded-xl border border-border bg-white px-4 py-2 text-base text-brand-dark placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/30 focus-visible:border-brand-primary transition-all hover:border-[#B0B0B5]",
                        error && "border-destructive focus-visible:ring-destructive/30 focus-visible:border-destructive",
                        className
                    )}
                />
                {error && (
                    <p className="text-xs text-destructive font-medium ml-0.5">{error}</p>
                )}
            </div>
        );
    }
);

CurrencyInput.displayName = 'CurrencyInput';
