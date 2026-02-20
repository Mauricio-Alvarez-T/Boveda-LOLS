import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { Input } from '../ui/Input';

interface TipoAusenciaFormData {
    nombre: string;
    es_justificada: boolean;
}

interface Props {
    initialData?: any;
    onSubmit: (data: TipoAusenciaFormData) => void;
    onCancel: () => void;
    loading?: boolean;
}

export const TipoAusenciaForm: React.FC<Props> = ({ initialData, onSubmit, onCancel, loading }) => {
    const { register, handleSubmit, reset, formState: { errors } } = useForm<TipoAusenciaFormData>({
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
                    disabled={loading}
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
