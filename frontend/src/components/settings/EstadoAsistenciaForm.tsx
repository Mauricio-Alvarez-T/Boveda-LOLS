import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Input } from '../ui/Input';
import api from '../../services/api';
import { useFormDirtyProtection } from '../../hooks/useFormDirtyProtection';

interface EstadoFormData {
    nombre: string;
    codigo: string;
    color: string;
    es_presente: boolean;
}

interface Props {
    initialData?: any;
    onSuccess: () => void;
    onCancel: () => void;
}

export const EstadoAsistenciaForm: React.FC<Props> = ({ initialData, onSuccess, onCancel }) => {
    const { register, handleSubmit, reset, formState: { errors, isSubmitting, isDirty } } = useForm<EstadoFormData>({
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

    useFormDirtyProtection(isDirty);

    const onSubmit = async (data: EstadoFormData) => {
        try {
            if (initialData) {
                await api.put(`/estados-asistencia/${initialData.id}`, data);
                toast.success('Estado de asistencia actualizado');
            } else {
                await api.post('/estados-asistencia', data);
                toast.success('Estado de asistencia creado');
            }
            onSuccess();
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Error al guardar estado');
        }
    };

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
                    className="h-4 w-4 rounded border-[#D2D2D7] text-[#029E4D] focus:ring-[#029E4D]"
                />
                <label htmlFor="es_presente" className="text-xs text-[#1D1D1F] font-medium">
                    Cuenta como presente (asistencia)
                </label>
            </div>

            <div className="sticky -bottom-6 -mx-6 px-6 py-4 bg-[#F5F5F7] border-t border-[#D2D2D7] flex justify-end gap-3 mt-6 z-10">
                <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full sm:w-auto bg-[#029E4D] text-white text-sm font-semibold px-6 py-2.5 rounded-xl hover:bg-[#027A3B] transition-colors disabled:opacity-50 flex items-center gap-2 justify-center"
                >
                    {isSubmitting ? 'Guardando...' : 'Guardar'}
                </button>
            </div>
        </form>
    );
};
