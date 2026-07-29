import React from 'react';
import { cn } from '../../utils/cn';

export interface FieldErrorProps {
    /** Mensaje de error. Si es undefined/null/'' no se renderiza nada. */
    message?: string | null | false;
    /** Icono opcional (p.ej. <AlertCircle className="w-3 h-3" />) para filas editables/carrito. */
    icon?: React.ReactNode;
    /** Clases extra para casos especiales (indentación pl-8, mt-1, etc.). */
    className?: string;
    /** id para enlazar con aria-describedby del control. */
    id?: string;
}

/**
 * FieldError — error de validación de CAMPO inline (estándar de Bóveda LOLS).
 *
 * Estilo canónico: text-xs + rampa roja accesible (red-700/300) + font-medium ml-0.5.
 * (Antes usaba text-destructive, pero #FF3B30 a 12px sobre blanco da 3.55:1 y falla
 * el 4.5:1 de AA — regla 8 de la rúbrica: tokens saturados no van en texto chico.)
 * - No renderiza nada si no hay mensaje (mantiene el layout limpio).
 * - role="alert" para accesibilidad (lectores de pantalla anuncian el error).
 * - Si se pasa `icon`, se muestra en línea con gap-1 (variante carrito/fila editable),
 *   pero conserva tamaño/color/peso del estándar para uniformar las divergencias previas.
 */
export const FieldError: React.FC<FieldErrorProps> = ({ message, icon, className, id }) => {
    if (!message) return null;
    return (
        <p
            id={id}
            role="alert"
            className={cn(
                'text-xs text-red-700 dark:text-red-300 font-medium ml-0.5',
                icon && 'flex items-center gap-1',
                className
            )}
        >
            {icon}
            {message}
        </p>
    );
};

FieldError.displayName = 'FieldError';
