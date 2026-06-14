import React from 'react';
import { cn } from '../../../utils/cn';

/**
 * Cuerpo del formulario de rechazo (textarea de motivo + confirmar/cancelar).
 * Es un FRAGMENTO: el padre provee el wrapper (card roja+header inline en
 * catálogo, o `<Modal>` en materiales) y el `onConfirm` con su closure
 * (`onRechazar` o `onRechazarRecepcion`). Extraído de TransferenciaDetail.tsx
 * (Fase 1) — de-duplica las 4 instancias (rechazar/rechazar_recepcion × 2 layouts).
 */
export const RechazarForm: React.FC<{
    value: string;
    onChange: (v: string) => void;
    onConfirm: () => void | Promise<void>;
    onCancel: () => void;
    loading: boolean;
    confirmLabel: string;
    placeholder?: string;
    description?: string;
    /** compact = layout inline de catálogo (text-xs, h-20, bordes rojos). */
    compact?: boolean;
}> = ({ value, onChange, onConfirm, onCancel, loading, confirmLabel, placeholder = 'Motivo del rechazo...', description, compact = false }) => (
    <>
        {description && (
            <p className={cn('text-muted-foreground', compact ? 'text-label' : 'text-xs')}>{description}</p>
        )}
        <textarea
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
            className={cn(
                'w-full px-3 py-2 rounded-xl resize-none focus:ring-2 focus:ring-red-300/20 dark:focus:ring-red-500/20 outline-none',
                compact ? 'text-xs h-20 border border-red-200 dark:border-red-900' : 'text-sm h-24 border border-border'
            )}
            required
        />
        <div className="flex gap-2">
            <button
                onClick={onConfirm}
                disabled={loading || !value.trim()}
                className={cn(
                    'flex-1 py-2.5 font-bold text-white bg-red-600 rounded-xl hover:bg-red-700 disabled:opacity-50 transition-all',
                    compact ? 'text-xs' : 'text-sm'
                )}
            >
                {loading ? 'Rechazando...' : confirmLabel}
            </button>
            <button
                onClick={onCancel}
                className={cn(
                    'px-4 py-2.5 font-bold text-muted-foreground hover:text-brand-dark transition-colors',
                    compact ? 'text-xs' : 'text-sm'
                )}
            >
                Cancelar
            </button>
        </div>
    </>
);
