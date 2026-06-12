import React, { useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';
import { cn } from '../../../utils/cn';
import { IconButton } from '../../ui/IconButton';

/**
 * Input de búsqueda controlado con debounce visual (200ms).
 * Reporta el valor al padre vía `onChange`. Auto-focus opcional.
 */
interface Props {
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    className?: string;
    autoFocus?: boolean;
}

export const PermissionsSearchBar: React.FC<Props> = ({
    value,
    onChange,
    placeholder = 'Buscar permiso, módulo o descripción...',
    className,
    autoFocus,
}) => {
    // Estado local para typing fluido; debounce al padre.
    const [local, setLocal] = useState(value);

    useEffect(() => {
        setLocal(value);
    }, [value]);

    useEffect(() => {
        const t = setTimeout(() => {
            if (local !== value) onChange(local);
        }, 200);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [local]);

    return (
        <div className={cn('relative', className)}>
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <input
                type="text"
                value={local}
                onChange={(e) => setLocal(e.target.value)}
                placeholder={placeholder}
                autoFocus={autoFocus}
                aria-label="Buscar permiso"
                className="w-full pl-9 pr-9 py-2 text-sm rounded-lg border border-border bg-card focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
            {local && (
                <IconButton
                    onClick={() => setLocal('')}
                    aria-label="Limpiar búsqueda"
                    className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6"
                    icon={<X className="h-3.5 w-3.5" />}
                />
            )}
        </div>
    );
};
