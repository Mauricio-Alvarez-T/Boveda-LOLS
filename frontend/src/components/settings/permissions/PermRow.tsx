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

const verboColors: Record<Verbo, string> = {
    ver:      'bg-blue-100 text-blue-800',
    crear:    'bg-emerald-100 text-emerald-800',
    editar:   'bg-amber-100 text-amber-800',
    eliminar: 'bg-red-100 text-red-800',
    aprobar:  'bg-purple-100 text-purple-800',
    enviar:   'bg-indigo-100 text-indigo-800',
    exportar: 'bg-teal-100 text-teal-800',
    otro:     'bg-gray-100 text-gray-700',
};

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
            ? 'bg-amber-50/40'
            : entry.sensible === 'critico'
            ? 'bg-red-50/30'
            : '';

    return (
        <div
            className={cn(
                'group flex items-center gap-3 px-3 py-2 border-b border-gray-100 hover:bg-gray-50 transition-colors',
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
                    <span className="text-sm font-medium text-gray-900 truncate">{def.nombre}</span>
                    <span
                        className={cn(
                            'text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded shrink-0',
                            verboColors[entry.verbo]
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
