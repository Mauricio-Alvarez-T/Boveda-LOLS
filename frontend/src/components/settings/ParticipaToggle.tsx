import React, { useState } from 'react';
import { toast } from 'sonner';
import { cn } from '../../utils/cn';
import { flagOff } from '../../utils/flags';
import api from '../../services/api';

interface Props {
    /** id de la obra/bodega */
    id: number;
    /** endpoint base, ej '/obras' | '/bodegas' */
    endpoint: string;
    /** nombre del flag, ej 'participa_asistencia' */
    field: string;
    /** valor actual (undefined/null se trata como participando) */
    value?: boolean;
    /** etiqueta corta del apartado, ej 'Inv', 'Asis' */
    label: string;
    /** se llama tras un PUT exitoso para refrescar la tabla */
    onDone: () => void;
    disabled?: boolean;
}

/**
 * Chip toggle para habilitar/deshabilitar la participación de una obra/bodega
 * en un apartado. Verde = participa, gris = no participa. Click → PUT del flag.
 */
export const ParticipaToggle: React.FC<Props> = ({ id, endpoint, field, value, label, onDone, disabled }) => {
    const [saving, setSaving] = useState(false);
    const on = !flagOff(value); // 0/false => off; undefined/null/1/true => participa

    const toggle = async () => {
        if (saving || disabled) return;
        setSaving(true);
        try {
            await api.put(`${endpoint}/${id}`, { [field]: !on });
            toast.success(on ? `${label}: deshabilitado` : `${label}: habilitado`);
            onDone();
        } catch (err: any) {
            toast.error(err?.response?.data?.error || `No se pudo cambiar ${label}`);
        } finally {
            setSaving(false);
        }
    };

    return (
        <button
            type="button"
            onClick={toggle}
            disabled={saving || disabled}
            title={`${on ? 'Deshabilitar' : 'Habilitar'} ${label}`}
            aria-pressed={on}
            className={cn(
                'text-[10px] font-bold px-2 py-0.5 rounded-lg border uppercase tracking-wide transition-colors disabled:opacity-50',
                on
                    ? 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30 dark:text-emerald-400'
                    : 'bg-muted text-muted-foreground border-border hover:border-brand-primary/30'
            )}
        >
            {label}
        </button>
    );
};
