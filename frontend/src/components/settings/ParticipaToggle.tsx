import React, { useState } from 'react';
import { Check } from 'lucide-react';
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
        // Regla de iconos (estricto): gris idle en ambos estados, hover brand-primary; el estado ON
        // se indica con el <Check> (no por color de relleno). OFF = sin check + atenuado.
        // eslint-disable-next-line no-restricted-syntax -- toggle de estado on/off; no hay primitivo Toggle (ver diseno.md)
        <button
            type="button"
            onClick={toggle}
            disabled={saving || disabled}
            title={`${on ? 'Deshabilitar' : 'Habilitar'} ${label}`}
            aria-pressed={on}
            className={cn(
                'inline-flex items-center gap-1 text-caption font-bold px-2 py-0.5 rounded-lg border uppercase tracking-wide transition-colors disabled:opacity-50',
                'bg-muted text-muted-foreground border-border hover:text-brand-primary hover:border-brand-primary/40',
                !on && 'opacity-50'
            )}
        >
            {on && <Check className="h-3 w-3 shrink-0" />}
            {label}
        </button>
    );
};
