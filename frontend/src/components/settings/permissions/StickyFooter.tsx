import React from 'react';
import { cn } from '../../../utils/cn';
import { Button } from '../../ui/Button';

/**
 * Footer fijo del modal de permisos.
 * - Muestra contador "{N} cambios pendientes" (con animación si > 0).
 * - Botones Cancelar / Guardar.
 * - Guardar disabled cuando no hay cambios.
 */
interface Props {
    pendingCount: number;
    saving: boolean;
    onCancel: () => void;
    onSave: () => void;
    saveLabel?: string;
}

export const StickyFooter: React.FC<Props> = ({
    pendingCount,
    saving,
    onCancel,
    onSave,
    saveLabel = 'Guardar Cambios',
}) => {
    const hasChanges = pendingCount > 0;
    return (
        <div className="flex items-center justify-between gap-3 px-2">
            <div
                role="status"
                aria-live="polite"
                className={cn(
                    'text-sm transition-all',
                    hasChanges ? 'text-amber-700 dark:text-amber-400 font-semibold' : 'text-muted-foreground'
                )}
            >
                {hasChanges ? (
                    <>
                        <span className="inline-block w-2 h-2 rounded-full bg-amber-500 mr-2 animate-pulse" />
                        {pendingCount} cambio{pendingCount === 1 ? '' : 's'} pendiente{pendingCount === 1 ? '' : 's'}
                    </>
                ) : (
                    'Sin cambios pendientes'
                )}
            </div>
            <div className="flex items-center gap-2">
                <Button variant="ghost" onClick={onCancel} disabled={saving}>
                    Cancelar
                </Button>
                <Button variant="primary" onClick={onSave} isLoading={saving} disabled={saving || !hasChanges}>
                    {saving ? 'Guardando...' : saveLabel}
                </Button>
            </div>
        </div>
    );
};
