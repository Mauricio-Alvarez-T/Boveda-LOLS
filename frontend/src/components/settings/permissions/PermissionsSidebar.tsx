import React from 'react';
import { cn } from '../../../utils/cn';
import type { SeccionNode } from '../../../utils/permisosTree';
import type { Seccion } from '../../../config/permisosHierarchy';

/**
 * Sidebar izquierda con las 5 secciones principales.
 * - Resalta la sección activa con border-l-4.
 * - Muestra contador "active/total" por sección.
 * - Marca con 💵 si la sección contiene perms financieros, ⚠️ si críticos.
 */
interface Props {
    tree: SeccionNode[];
    activeSeccion: Seccion;
    onSelect: (s: Seccion) => void;
}

export const PermissionsSidebar: React.FC<Props> = ({ tree, activeSeccion, onSelect }) => {
    return (
        <nav role="navigation" aria-label="Secciones de permisos" className="flex flex-col py-2">
            {tree.map((sec) => {
                const isActive = sec.seccion === activeSeccion;
                return (
                    <button
                        key={sec.seccion}
                        type="button"
                        onClick={() => onSelect(sec.seccion)}
                        aria-current={isActive ? 'page' : undefined}
                        className={cn(
                            'group flex items-center justify-between gap-2 px-3 py-2.5 text-sm text-left transition-all border-l-4',
                            isActive
                                ? 'border-primary bg-primary/5 text-primary font-semibold'
                                : 'border-transparent text-gray-700 dark:text-muted-foreground hover:bg-gray-50 dark:hover:bg-white/5 hover:border-gray-300 dark:hover:border-border'
                        )}
                    >
                        <div className="flex items-center gap-2 min-w-0">
                            <span aria-hidden className="text-base shrink-0">{sec.icon}</span>
                            <span className="truncate">{sec.label}</span>
                            {sec.hasFinanciero && (
                                <span aria-hidden title="Contiene permisos financieros" className="text-xs">💵</span>
                            )}
                            {sec.hasCritico && (
                                <span aria-hidden title="Contiene permisos críticos" className="text-xs">⚠️</span>
                            )}
                        </div>
                        <span
                            className={cn(
                                'shrink-0 text-[11px] px-1.5 py-0.5 rounded font-mono',
                                isActive
                                    ? 'bg-primary/10 text-primary'
                                    : 'bg-gray-100 dark:bg-white/10 text-gray-600 dark:text-muted-foreground group-hover:bg-gray-200 dark:group-hover:bg-white/15'
                            )}
                        >
                            {sec.active}/{sec.total}
                        </span>
                    </button>
                );
            })}
        </nav>
    );
};
