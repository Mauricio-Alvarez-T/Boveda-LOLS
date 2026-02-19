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
                    <label className="text-sm font-medium text-[#6E6E73] ml-0.5">
                        {label}
                    </label>
                )}
                <div className="relative group">
                    <select
                        className={cn(
                            "flex h-11 w-full items-center justify-between rounded-xl border border-input bg-white px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 appearance-none transition-all duration-200",
                            error && "border-[#FF3B30] focus-visible:ring-[#FF3B30]/30 focus-visible:border-[#FF3B30]",
                            className
                        )}
                        ref={ref}
                        {...props}
                    >
                        <option value="" className="bg-white text-[#1D1D1F]">Seleccionar...</option>
                        {options.map((opt) => (
                            <option key={opt.value} value={opt.value} className="bg-white text-[#1D1D1F]">
                                {opt.label}
                            </option>
                        ))}
                    </select>
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-[#6E6E73]">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                    </div>
                </div>
                {error && (
                    <p className="text-xs text-[#FF3B30] font-medium ml-0.5">
                        {error}
                    </p>
                )}
                {helperText && !error && (
                    <p className="text-xs text-[#6E6E73] ml-0.5">
                        {helperText}
                    </p>
                )}
            </div>
        );
    }
);

Select.displayName = "Select";
