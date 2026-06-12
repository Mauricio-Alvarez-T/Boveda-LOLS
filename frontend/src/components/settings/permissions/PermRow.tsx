import React from 'react';
import { cn } from '../../../utils/cn';
import { SensibleBadge } from './SensibleBadge';
import type { PermNode } from '../../../utils/permisosTree';
import type { Verbo } from '../../../config/permisosHierarchy';

/**
 * Fila densa (1-línea ~44px) que representa un permiso individual.
 * - Indicador visual (dot estado).
 * - Nombre + verbo badge + sensible badge si aplica.
 * - Descripción truncada (tooltip en hover con texto completo).
 * - Control de la derecha (render-prop desde PermissionsTree).
 */

// Etiqueta de categoría (no estado de dato) → paleta neutra del DS
const verboBadge = 'bg-muted text-muted-foreground dark:bg-white/10';

const verboLabels: Record<Verbo, string> = {
    ver: 'Ver',
    crear: 'Crear',
    editar: 'Editar',
    eliminar: 'Eliminar',
    aprobar: 'Aprobar',
    enviar: 'Enviar',
    exportar: 'Exportar',
    otro: 'Otro',
};

interface Props {
    perm: PermNode;
    /** Render del control de la derecha — checkbox (rol) o tristate (usuario). */
    renderControl: (perm: PermNode) => React.ReactNode;
    /** Render meta opcional a la izquierda — status dot del modo usuario. */
    renderMeta?: (perm: PermNode) => React.ReactNode;
    /** Resaltado cuando el permiso está modificado respecto al original. */
    modified?: boolean;
}

export const PermRow: React.FC<Props> = ({ perm, renderControl, renderMeta, modified }) => {
    const { def, entry } = perm;
    const sensibleBg =
        entry.sensible === 'financiero'
            ? 'bg-amber-50/40 dark:bg-amber-950/20'
            : entry.sensible === 'critico'
            ? 'bg-red-50/30 dark:bg-red-950/20'
            : '';

    return (
        <div
            className={cn(
                'group flex items-center gap-3 px-3 py-2 border-b border-gray-100 dark:border-border hover:bg-gray-50 dark:hover:bg-white/5 transition-colors',
                sensibleBg,
                modified && 'border-l-2 border-l-amber-400'
            )}
        >
            {/* Meta slot (status dot en modo usuario) */}
            <div className="shrink-0 w-4 flex items-center justify-center">
                {renderMeta?.(perm)}
            </div>

            {/* Nombre + verbo + sensible badge */}
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-gray-900 dark:text-foreground truncate">{def.nombre}</span>
                    <span
                        className={cn(
                            'text-caption font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded shrink-0',
                            verboBadge
                        )}
                    >
                        {verboLabels[entry.verbo]}
                    </span>
                    {entry.sensible && <SensibleBadge type={entry.sensible} />}
                </div>
                {def.descripcion && (
                    <p
                        className="text-xs text-muted-foreground truncate mt-0.5"
                        title={def.descripcion}
                    >
                        {def.descripcion}
                    </p>
                )}
            </div>

            {/* Control */}
            <div className="shrink-0">{renderControl(perm)}</div>
        </div>
    );
};
