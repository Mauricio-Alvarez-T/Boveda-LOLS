import React from 'react';
import { cn } from '../../utils/cn';
import { AlertCircle } from 'lucide-react';

export interface FormErrorProps {
    /** Mensaje de error a nivel de formulario/acción. Si es vacío no renderiza nada. */
    message?: string | null | false;
    className?: string;
}

/**
 * FormError — banner de error de ACCIÓN/FORMULARIO persistente en página.
 *
 * Para estados de error que permanecen en pantalla (no transitorios). Para errores
 * transitorios de API en catch usar showApiError() (toast), NO este banner.
 * Usa el token semántico `destructive` (no hex/red-* hardcodeado) para unificar la
 * paleta de todos los banners y respetar el tema claro/oscuro.
 */
export const FormError: React.FC<FormErrorProps> = ({ message, className }) => {
    if (!message) return null;
    return (
        <div
            role="alert"
            className={cn(
                'flex items-start gap-2 p-4 rounded-xl border-2 border-destructive/20 bg-destructive/10 text-sm font-semibold text-destructive',
                className
            )}
        >
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>{message}</span>
        </div>
    );
};

FormError.displayName = 'FormError';
