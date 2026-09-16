import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
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

/** Alto máximo del popover (buscador + lista). Decide si abre hacia abajo o hacia arriba. */
const POPOVER_MAX = 320;

interface PosicionPopover { left: number; width: number; maxHeight: number; top?: number; bottom?: number }

export const FilterSelect = React.forwardRef<HTMLDivElement, FilterSelectProps>(
    ({ className, label, options, placeholder = 'Seleccionar...', value, onChange, ...props }, ref) => {
        const [isOpen, setIsOpen] = useState(false);
        const [searchQuery, setSearchQuery] = useState('');
        // El popover se dibuja en un PORTAL con position:fixed (2026-09-16). Antes era absolute dentro del
        // panel y funcionaba solo porque el panel era overflow-visible; en el rail vertical, que tiene
        // scroll propio, quedaba recortado a media lista.
        const [pos, setPos] = useState<PosicionPopover | null>(null);
        const containerRef = useRef<HTMLDivElement>(null);
        const triggerRef = useRef<HTMLButtonElement>(null);
        const popoverRef = useRef<HTMLDivElement>(null);

        const cerrar = useCallback(() => { setIsOpen(false); setSearchQuery(''); }, []);

        const medir = useCallback(() => {
            const el = triggerRef.current;
            if (!el) return;
            const r = el.getBoundingClientRect();
            const libreAbajo = window.innerHeight - r.bottom;
            const abajo = libreAbajo >= POPOVER_MAX || libreAbajo >= r.top;
            const base: PosicionPopover = {
                left: r.left,
                width: Math.max(r.width, 200),
                maxHeight: Math.max(160, Math.min(POPOVER_MAX, (abajo ? libreAbajo : r.top) - 12)),
            };
            setPos(abajo ? { ...base, top: r.bottom + 4 } : { ...base, bottom: window.innerHeight - r.top + 4 });
        }, []);

        useEffect(() => {
            if (!isOpen) return;
            const clickFuera = (e: MouseEvent) => {
                const t = e.target as Node;
                if (!containerRef.current?.contains(t) && !popoverRef.current?.contains(t)) cerrar();
            };
            const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') cerrar(); };
            // Cualquier scroll (el del rail incluido) cierra la lista: reposicionar en cada frame cuesta más
            // de lo que vale, y es lo mismo que hace un select nativo.
            const scroll = () => cerrar();
            document.addEventListener('mousedown', clickFuera);
            document.addEventListener('keydown', tecla);
            window.addEventListener('scroll', scroll, true);
            window.addEventListener('resize', medir);
            return () => {
                document.removeEventListener('mousedown', clickFuera);
                document.removeEventListener('keydown', tecla);
                window.removeEventListener('scroll', scroll, true);
                window.removeEventListener('resize', medir);
            };
        }, [isOpen, cerrar, medir]);

        const filteredOptions = options.filter(opt =>
            opt.label.toLowerCase().includes(searchQuery.toLowerCase())
        );

        // Convertir ambos a String para evitar fallos de coincidencia entre Number y String
        const selectedOption = options.find(opt => String(opt.value) === String(value));
        const isFilterActive = value !== undefined && value !== '' && value !== 'all';
        // Placeholder propio solo si el consumidor no trae el suyo (opción con value vacío).
        const conPlaceholderPropio = options.some(opt => opt.value === '' || opt.value === undefined);

        const handleSelect = (selectedValue: string | number) => {
            if (onChange) {
                // Simular un evento de select para mantener compatibilidad
                onChange({ target: { value: String(selectedValue) } } as React.ChangeEvent<HTMLSelectElement>);
            }
            cerrar();
        };

        return (
            <div className="space-y-2" ref={ref}>
                <div className="space-y-2" ref={containerRef}>
                    <label className={cn(
                        "text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-colors",
                        isFilterActive ? "text-brand-primary" : "text-muted-foreground/60"
                    )}>
                        {label}
                    </label>

                    {/* ── MOBILE: NATIVE SELECT ── */}
                    <div className="md:hidden relative">
                        <select
                            value={value ?? ''}
                            onChange={(e) => { if (onChange) onChange(e); }}
                            className={cn(
                                "w-full border rounded-xl p-2.5 text-sm transition-all appearance-none outline-none cursor-pointer",
                                "bg-card border-border hover:border-brand-primary/40 text-brand-dark",
                                isFilterActive && "bg-brand-primary/[0.03] border-brand-primary shadow-[0_0_0_1px_rgba(var(--brand-primary-rgb),0.1)] ring-1 ring-brand-primary/20 text-brand-primary font-semibold",
                                className
                            )}
                            {...props}
                        >
                            {!conPlaceholderPropio && (<option value="">{placeholder}</option>)}
                            {options.map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                        </select>
                        <ChevronDown className={cn(
                            "absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none transition-transform shrink-0",
                            isFilterActive ? "text-brand-primary" : "text-muted-foreground/40"
                        )} />
                    </div>

                    {/* ── DESKTOP: CUSTOM DROPDOWN WITH SEARCH ── */}
                    <div className="hidden md:block relative">
                        {/* eslint-disable-next-line no-restricted-syntax -- interno de primitiva: dropdown custom */}
                        <button
                            ref={triggerRef}
                            type="button"
                            aria-haspopup="listbox"
                            aria-expanded={isOpen}
                            onClick={() => { if (isOpen) { cerrar(); } else { medir(); setIsOpen(true); } }}
                            className={cn(
                                "w-full border rounded-xl p-2.5 text-sm transition-all text-left flex items-center justify-between",
                                "bg-card border-border hover:border-brand-primary/40",
                                isFilterActive && "bg-brand-primary/[0.03] border-brand-primary shadow-[0_0_0_1px_rgba(var(--brand-primary-rgb),0.1)] ring-1 ring-brand-primary/20 text-brand-primary font-semibold",
                                isOpen && "ring-4 ring-brand-primary/10 border-brand-primary",
                                className
                            )}
                        >
                            <span className="truncate pr-2">{selectedOption ? selectedOption.label : placeholder}</span>
                            <ChevronDown className={cn(
                                "h-4 w-4 transition-transform shrink-0",
                                isOpen ? "rotate-180 text-brand-primary" : "text-muted-foreground/40",
                                isFilterActive && "text-brand-primary"
                            )} />
                        </button>
                    </div>
                </div>

                {isOpen && pos && createPortal(
                    <div
                        ref={popoverRef}
                        role="listbox"
                        style={{ position: 'fixed', left: pos.left, width: pos.width, maxHeight: pos.maxHeight, top: pos.top, bottom: pos.bottom }}
                        className="z-[1200] flex flex-col bg-card/95 backdrop-blur-md border border-border rounded-xl shadow-[0_12px_40px_rgb(0,0,0,0.15)] overflow-hidden"
                    >
                        <div className="p-2 border-b border-border relative bg-background/50 shrink-0">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
                            <input
                                type="text"
                                className="w-full bg-card border border-border rounded-lg py-1.5 pl-9 pr-3 text-sm focus:ring-2 focus:ring-brand-primary/20 outline-none transition-all placeholder:text-muted-foreground/40"
                                placeholder="Buscar..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                                autoFocus
                            />
                        </div>
                        <ul className="flex-1 min-h-0 overflow-y-auto custom-scrollbar py-1">
                            {!conPlaceholderPropio && (
                                <li
                                    className={cn(
                                        "px-4 py-2.5 text-sm cursor-pointer hover:bg-brand-primary/5 transition-colors",
                                        (value === '' || value === undefined) && "bg-brand-primary/10 font-bold text-brand-primary"
                                    )}
                                    onClick={() => handleSelect('')}
                                >
                                    {placeholder}
                                </li>
                            )}
                            {filteredOptions.length === 0 ? (
                                <li className="px-4 py-6 text-sm text-muted-foreground text-center italic">No hay resultados</li>
                            ) : (
                                filteredOptions.map(opt => (
                                    <li
                                        key={opt.value}
                                        role="option"
                                        aria-selected={String(value) === String(opt.value)}
                                        className={cn(
                                            "px-4 py-2.5 text-sm cursor-pointer hover:bg-brand-primary/5 transition-all",
                                            String(value) === String(opt.value) && "bg-brand-primary/10 font-bold text-brand-primary border-r-4 border-brand-primary"
                                        )}
                                        onClick={() => handleSelect(opt.value)}
                                    >
                                        {opt.label}
                                    </li>
                                ))
                            )}
                        </ul>
                    </div>,
                    document.body
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

/** Interruptor de filtro. Fila entera clickeable: el rail es angosto y el área de toque importa. */
export const FilterToggle: React.FC<FilterToggleProps> = ({ label, checked, onChange, className }) => {
    return (
        <div
            role="switch"
            aria-checked={checked}
            tabIndex={0}
            onClick={() => onChange(!checked)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onChange(!checked); } }}
            className={cn(
                "flex items-center gap-3 cursor-pointer group min-h-11 rounded-xl border px-3 transition-colors outline-none",
                "focus-visible:ring-4 focus-visible:ring-brand-primary/10",
                checked ? "border-brand-primary bg-brand-primary/5" : "border-border bg-card hover:border-brand-primary/40",
                className
            )}
        >
            <div className={cn("w-10 h-5 rounded-full transition-colors relative shrink-0", checked ? "bg-brand-primary" : "bg-border")}>
                <div className={cn(
                    "absolute top-1 left-1 w-3 h-3 bg-card rounded-full transition-transform",
                    checked ? "translate-x-5" : "translate-x-0"
                )} />
            </div>
            <span className={cn(
                "text-sm font-medium transition-colors",
                checked ? "text-brand-primary font-semibold" : "text-muted-foreground group-hover:text-brand-dark"
            )}>
                {label}
            </span>
        </div>
    );
};
