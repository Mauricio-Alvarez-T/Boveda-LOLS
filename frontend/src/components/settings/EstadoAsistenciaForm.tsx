import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { Input } from '../ui/Input';

interface EstadoFormData {
    nombre: string;
    codigo: string;
    color: string;
    es_presente: boolean;
}

interface Props {
    initialData?: any;
    onSubmit: (data: EstadoFormData) => void;
    onCancel: () => void;
    loading?: boolean;
}

export const EstadoAsistenciaForm: React.FC<Props> = ({ initialData, onSubmit, onCancel, loading }) => {
    const { register, handleSubmit, reset, formState: { errors } } = useForm<EstadoFormData>({
        defaultValues: {
            nombre: '',
            codigo: '',
            color: '#34C759',
            es_presente: false
        }
    });

    useEffect(() => {
        if (initialData) {
            reset({
                nombre: initialData.nombre || '',
                codigo: initialData.codigo || '',
                color: initialData.color || '#34C759',
                es_presente: initialData.es_presente || false
            });
        }
    }, [initialData, reset]);

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Input
                label="Nombre"
                placeholder="Ej: Presente, Ausente..."
                {...register('nombre', { required: 'Nombre es requerido' })}
                error={errors.nombre?.message}
            />
            <Input
                label="Código"
                placeholder="Ej: P, A, AT, LM..."
                {...register('codigo', { required: 'Código es requerido' })}
                error={errors.codigo?.message}
            />
            <div>
                <label className="block text-xs font-medium text-[#6E6E73] mb-1.5">Color</label>
                <input
                    type="color"
                    {...register('color')}
                    className="w-full h-10 rounded-lg border border-[#D2D2D7] cursor-pointer"
                />
            </div>
            <div className="flex items-center gap-2">
                <input
                    type="checkbox"
                    id="es_presente"
                    {...register('es_presente')}
                    className="h-4 w-4 rounded border-[#D2D2D7] text-[#0071E3] focus:ring-[#0071E3]"
                />
                <label htmlFor="es_presente" className="text-xs text-[#1D1D1F] font-medium">
                    Cuenta como presente (asistencia)
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
