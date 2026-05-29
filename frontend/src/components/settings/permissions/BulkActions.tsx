import React from 'react';
import { Check, X as XIcon } from 'lucide-react';
import type { PermNode } from '../../../utils/permisosTree';

/**
 * Botones "Marcar todos / Desmarcar todos" para una subsección.
 * Sólo se usa en modo rol (binario). En modo usuario los overrides
 * son tristate y requieren acciones individuales.
 */
interface Props {
    perms: PermNode[];
    onBulk: (claves: string[], activate: boolean) => void;
    activeCount: number;
    total: number;
}

export const BulkActions: React.FC<Props> = ({ perms, onBulk, activeCount, total }) => {
    const claves = perms.map(p => p.def.clave);
    const allOn = activeCount === total;
    const allOff = activeCount === 0;
    return (
        <div className="flex items-center gap-1.5 text-xs">
            <button
                type="button"
                disabled={allOn}
                onClick={() => onBulk(claves, true)}
                className="inline-flex items-center gap-1 px-2 py-1 rounded border border-gray-200 dark:border-border hover:bg-green-50 dark:hover:bg-green-950/30 hover:border-green-300 dark:hover:border-green-800 hover:text-green-700 dark:hover:text-green-400 disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:border-gray-200 dark:disabled:hover:border-border disabled:hover:text-current transition-colors"
            >
                <Check className="h-3 w-3" /> Marcar todos
            </button>
            <button
                type="button"
                disabled={allOff}
                onClick={() => onBulk(claves, false)}
                className="inline-flex items-center gap-1 px-2 py-1 rounded border border-gray-200 dark:border-border hover:bg-red-50 dark:hover:bg-red-950/30 hover:border-red-300 dark:hover:border-red-800 hover:text-red-700 dark:hover:text-red-400 disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:border-gray-200 dark:disabled:hover:border-border disabled:hover:text-current transition-colors"
            >
                <XIcon className="h-3 w-3" /> Desmarcar todos
            </button>
        </div>
    );
};
