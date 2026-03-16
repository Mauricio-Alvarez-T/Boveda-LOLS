import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Input } from '../ui/Input';
import api from '../../services/api';
import { useFormDirtyProtection } from '../../hooks/useFormDirtyProtection';

interface TipoAusenciaFormData {
    nombre: string;
    es_justificada: boolean;
}

interface Props {
    initialData?: any;
    onSuccess: () => void;
    onCancel: () => void;
}

export const TipoAusenciaForm: React.FC<Props> = ({ initialData, onSuccess, onCancel }) => {
    const { register, handleSubmit, reset, formState: { errors, isSubmitting, isDirty } } = useForm<TipoAusenciaFormData>({
        defaultValues: {
            nombre: '',
            es_justificada: false
        }
    });

    useEffect(() => {
        if (initialData) {
            reset({
                nombre: initialData.nombre || '',
                es_justificada: initialData.es_justificada || false
            });
        }
    }, [initialData, reset]);

    useFormDirtyProtection(isDirty);

    const onSubmit = async (data: TipoAusenciaFormData) => {
        try {
            if (initialData) {
                await api.put(`/tipos-ausencia/${initialData.id}`, data);
                toast.success('Tipo de ausencia actualizado');
            } else {
                await api.post('/tipos-ausencia', data);
                toast.success('Tipo de ausencia creado');
            }
            onSuccess();
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Error al guardar tipo de ausencia');
        }
    };

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Input
                label="Nombre"
                placeholder="Ej: Licencia Médica, Vacaciones..."
                {...register('nombre', { required: 'Nombre es requerido' })}
                error={errors.nombre?.message}
            />
            <div className="flex items-center gap-2">
                <input
                    type="checkbox"
                    id="es_justificada"
                    {...register('es_justificada')}
                    className="h-4 w-4 rounded border-border text-brand-primary focus:ring-brand-primary"
                />
                <label htmlFor="es_justificada" className="text-xs text-brand-dark font-medium">
                    Es justificada
                </label>
            </div>
            <div className="sticky -bottom-6 -mx-6 px-6 py-4 bg-background border-t border-border flex justify-end gap-3 mt-6 z-10">
                <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full sm:w-auto bg-brand-primary text-white text-sm font-semibold px-6 py-2.5 rounded-xl hover:bg-[#027A3B] transition-colors disabled:opacity-50 flex items-center gap-2 justify-center"
                >
                    {isSubmitting ? 'Guardando...' : 'Guardar'}
                </button>
            </div>
        </form>
    );
};
