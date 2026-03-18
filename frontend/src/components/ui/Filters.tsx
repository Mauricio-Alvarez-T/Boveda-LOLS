import React from 'react';
import { cn } from '../../utils/cn';

export interface FilterSelectOption {
    value: string | number;
    label: string;
}

interface FilterSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
    label: React.ReactNode;
    options: FilterSelectOption[];
    placeholder?: string;
}

export const FilterSelect = React.forwardRef<HTMLSelectElement, FilterSelectProps>(
    ({ className, label, options, placeholder = 'Seleccionar...', ...props }, ref) => {
        return (
            <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    {label}
                </label>
                <select
                    className={cn(
                        "w-full bg-white border border-border rounded-xl p-2.5 text-sm text-brand-dark focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary transition-all",
                        className
                    )}
                    ref={ref}
                    {...props}
                >
                    <option value="">{placeholder}</option>
                    {options.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                            {opt.label}
                        </option>
                    ))}
                </select>
            </div>
        );
    }
);

FilterSelect.displayName = "FilterSelect";

interface FilterToggleProps {
    label: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
    className?: string;
}

export const FilterToggle: React.FC<FilterToggleProps> = ({ label, checked, onChange, className }) => {
    return (
        <div className={cn("space-y-2 flex flex-col justify-end pb-1", className)}>
            <div
                className="flex items-center gap-3 cursor-pointer group"
                onClick={() => onChange(!checked)}
            >
                <div
                    className={cn(
                        "w-10 h-5 rounded-full transition-colors relative shrink-0",
                        checked ? "bg-brand-primary" : "bg-border"
                    )}
                >
                    <div className={cn(
                        "absolute top-1 left-1 w-3 h-3 bg-white rounded-full transition-transform",
                        checked ? "translate-x-5" : "translate-x-0"
                    )} />
                </div>
                <span className="text-sm font-medium text-muted-foreground group-hover:text-brand-dark transition-colors">
                    {label}
                </span>
            </div>
        </div>
    );
};
