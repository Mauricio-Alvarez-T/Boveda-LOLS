import React, { useState, useRef, useEffect } from 'react';
import { cn } from '../../utils/cn';
import { ChevronDown, Search } from 'lucide-react';

export interface FilterSelectOption {
    value: string | number;
    label: string;
}

interface FilterSelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'onChange'> {
    label: React.ReactNode;
    options: FilterSelectOption[];
    placeholder?: string;
    value?: string | number;
    onChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void;
}

export const FilterSelect = React.forwardRef<HTMLDivElement, FilterSelectProps>(
    ({ className, label, options, placeholder = 'Seleccionar...', value, onChange, ...props }, ref) => {
        const [isOpen, setIsOpen] = useState(false);
        const [searchQuery, setSearchQuery] = useState('');
        const containerRef = useRef<HTMLDivElement>(null);

        // Click outside listener
        useEffect(() => {
            const handleClickOutside = (event: MouseEvent) => {
                if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                    setIsOpen(false);
                    setSearchQuery(''); // Limpiar búsqueda al cerrar
                }
            };
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }, []);

        const filteredOptions = options.filter(opt => 
            opt.label.toLowerCase().includes(searchQuery.toLowerCase())
        );

        const selectedOption = options.find(opt => opt.value === value);

        const handleSelect = (selectedValue: string | number) => {
            if (onChange) {
                // Simular un evento de select para mantener compatibilidad
                onChange({ target: { value: String(selectedValue) } } as React.ChangeEvent<HTMLSelectElement>);
            }
            setIsOpen(false);
            setSearchQuery('');
        };

        return (
            <div className="space-y-2 relative" ref={containerRef || ref}>
                <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    {label}
                </label>
                
                <button
                    type="button"
                    onClick={() => setIsOpen(!isOpen)}
                    className={cn(
                        "w-full bg-white border rounded-xl p-2.5 text-sm text-brand-dark focus:outline-none focus:ring-2 focus:ring-brand-primary/30 transition-all text-left flex items-center justify-between",
                        isOpen ? "border-brand-primary" : "border-border hover:border-brand-primary/50",
                        className
                    )}
                >
                    <span className="truncate pr-2">{selectedOption ? selectedOption.label : placeholder}</span>
                    <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform shrink-0", isOpen && "rotate-180")} />
                </button>

                {isOpen && (
                    <div className="absolute z-[100] w-full min-w-[200px] mt-1 bg-white/95 backdrop-blur-md border border-border rounded-xl shadow-[0_12px_40px_rgb(0,0,0,0.15)] overflow-hidden">
                        <div className="p-2 border-b border-border relative bg-background/50">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
                            <input 
                                type="text"
                                className="w-full bg-white border border-border rounded-lg py-1.5 pl-9 pr-3 text-sm focus:ring-2 focus:ring-brand-primary/20 outline-none transition-all placeholder:text-muted-foreground/40"
                                placeholder="Buscar..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                                autoFocus
                            />
                        </div>
                        <ul className="max-h-64 overflow-y-auto custom-scrollbar py-1">
                            <li 
                                className={cn(
                                    "px-4 py-2.5 text-sm cursor-pointer hover:bg-brand-primary/5 transition-colors",
                                    (value === '' || value === undefined) && "bg-brand-primary/10 font-bold text-brand-primary"
                                )}
                                onClick={() => handleSelect('')}
                            >
                                {placeholder}
                            </li>
                            {filteredOptions.length === 0 ? (
                                <li className="px-4 py-6 text-sm text-muted-foreground text-center italic">No hay resultados</li>
                            ) : (
                                filteredOptions.map(opt => (
                                    <li
                                        key={opt.value}
                                        className={cn(
                                            "px-4 py-2.5 text-sm cursor-pointer hover:bg-brand-primary/5 transition-all",
                                            value === String(opt.value) && "bg-brand-primary/10 font-bold text-brand-primary border-r-4 border-brand-primary"
                                        )}
                                        onClick={() => handleSelect(opt.value)}
                                    >
                                        {opt.label}
                                    </li>
                                ))
                            )}
                        </ul>
                    </div>
                )}
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
