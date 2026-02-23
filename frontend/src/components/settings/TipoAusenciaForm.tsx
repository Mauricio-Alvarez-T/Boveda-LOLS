import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Input } from '../ui/Input';
import api from '../../services/api';

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
    const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<TipoAusenciaFormData>({
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
                    className="h-4 w-4 rounded border-[#D2D2D7] text-[#0071E3] focus:ring-[#0071E3]"
                />
                <label htmlFor="es_justificada" className="text-xs text-[#1D1D1F] font-medium">
                    Es justificada
                </label>
            </div>
            <div className="flex gap-3 pt-2">
                <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex-1 bg-[#0071E3] text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-[#0077ED] transition-colors disabled:opacity-50"
                >
                    {initialData ? 'Actualizar' : 'Crear'}
                </button>
                <button
                    type="button"
                    onClick={onCancel}
                    className="px-4 py-2.5 text-sm font-medium text-[#6E6E73] hover:bg-[#F5F5F7] rounded-xl transition-colors"
                >
                    Cancelar
                </button>
            </div>
        </form>
    );
};
