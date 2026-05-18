import React from 'react';
import { cn } from '../../../utils/cn';

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
                    hasChanges ? 'text-amber-700 font-semibold' : 'text-muted-foreground'
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
                <button
                    type="button"
                    onClick={onCancel}
                    disabled={saving}
                    className="px-5 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700 transition-colors disabled:opacity-50"
                >
                    Cancelar
                </button>
                <button
                    type="button"
                    onClick={onSave}
                    disabled={saving || !hasChanges}
                    className="px-6 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
                >
                    {saving && (
                        <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                    )}
                    {saving ? 'Guardando...' : saveLabel}
                </button>
            </div>
        </div>
    );
};
