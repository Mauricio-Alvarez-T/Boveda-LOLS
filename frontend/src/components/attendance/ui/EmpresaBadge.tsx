import React from 'react';
import { cn } from '../../../utils/cn';
import { empresaTag } from '../../../utils/empresaTag';

/**
 * Badge compacto de empresa (L/M/P/D) junto al trabajador en Asistencia.
 * El tooltip muestra el nombre legible de la empresa. No renderiza nada si el
 * trabajador no tiene empresa.
 */
export const EmpresaBadge: React.FC<{ empresaNombre?: string | null; className?: string }> = ({ empresaNombre, className }) => {
    const tag = empresaTag(empresaNombre);
    if (!tag) return null;
    return (
        <span
            title={`Empresa: ${tag.label}`}
            aria-label={`Empresa ${tag.label}`}
            className={cn(
                "inline-flex items-center justify-center h-4 min-w-[16px] px-1 rounded text-micro font-black leading-none shrink-0",
                tag.color,
                className
            )}
        >
            {tag.letra}
        </span>
    );
};
