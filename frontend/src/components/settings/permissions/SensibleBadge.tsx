import React from 'react';

/**
 * Badge pequeño que marca un permiso como sensible (financiero o crítico).
 * Visible a la derecha del nombre en cada PermRow.
 */
interface Props {
    type: 'financiero' | 'critico';
}

export const SensibleBadge: React.FC<Props> = ({ type }) => {
    if (type === 'financiero') {
        return (
            <span
                className="inline-flex items-center gap-1 text-caption font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/40 text-amber-900 dark:text-amber-300 border border-amber-300 dark:border-amber-900"
                title="Permiso sensible: controla acceso a datos monetarios"
            >
                <span aria-hidden>💵</span>
                <span>$</span>
            </span>
        );
    }
    return (
        <span
            className="inline-flex items-center gap-1 text-caption font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-950/40 text-red-900 dark:text-red-300 border border-red-300 dark:border-red-900"
            title="Permiso crítico: acción destructiva o de configuración del sistema"
        >
            <span aria-hidden>⚠️</span>
            <span>Crítico</span>
        </span>
    );
};
