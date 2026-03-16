import React from 'react';
import { cn } from '../../utils/cn';

export interface SelectOption {
    value: string | number;
    label: string;
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
    label?: string;
    options: SelectOption[];
    error?: string;
    helperText?: string;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
    ({ className, label, options, error, helperText, ...props }, ref) => {
        return (
            <div className="w-full space-y-1.5">
                {label && (
                    <label className="text-sm font-medium text-muted-foreground ml-0.5">
                        {label}
                    </label>
                )}
                <div className="relative group">
                    <select
                        className={cn(
                            "flex h-11 w-full items-center justify-between rounded-xl border border-input bg-white px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 appearance-none transition-all duration-200",
                            error && "border-destructive focus-visible:ring-destructive/30 focus-visible:border-destructive",
                            className
                        )}
                        ref={ref}
                        {...props}
                    >
                        <option value="" className="bg-white text-brand-dark">Seleccionar...</option>
                        {options.map((opt) => (
                            <option key={opt.value} value={opt.value} className="bg-white text-brand-dark">
                                {opt.label}
                            </option>
                        ))}
                    </select>
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                    </div>
                </div>
                {error && (
                    <p className="text-xs text-destructive font-medium ml-0.5">
                        {error}
                    </p>
                )}
                {helperText && !error && (
                    <p className="text-xs text-muted-foreground ml-0.5">
                        {helperText}
                    </p>
                )}
            </div>
        );
    }
);

Select.displayName = "Select";
