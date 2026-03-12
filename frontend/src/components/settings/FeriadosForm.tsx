import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast } from 'sonner';
import { Save } from 'lucide-react';

import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import api from '../../services/api';
import { useFormDirtyProtection } from '../../hooks/useFormDirtyProtection';

const schema = z.object({
    fecha: z.string().min(1, 'Fecha es requerida'),
    nombre: z.string().min(1, 'Nombre es requerido'),
    tipo: z.enum(['nacional', 'obra', 'patronal', 'otro']),
    irrenunciable: z.boolean(),
});

type FormData = z.infer<typeof schema>;

interface Props {
    initialData?: any; // The record to edit
    onSuccess: () => void;
    onCancel: () => void;
}

export const FeriadosForm: React.FC<Props> = ({
    initialData,
    onSuccess,
    onCancel
}) => {
    // Extraer solo YYYY-MM-DD
    const formatDateForInput = (dateStr?: string) => {
        if (!dateStr) return '';
        try {
            return new Date(dateStr).toISOString().split('T')[0];
        } catch {
            return dateStr.split('T')[0];
        }
    };

    const { register, handleSubmit, formState: { errors, isSubmitting, isDirty } } = useForm<FormData>({
        resolver: zodResolver(schema),
        defaultValues: {
            fecha: formatDateForInput(initialData?.fecha) || '',
            nombre: initialData?.nombre || '',
            tipo: initialData?.tipo || 'obra',
            irrenunciable: initialData?.irrenunciable || false,
        },
    });

    useFormDirtyProtection(isDirty);

    const onSubmit = async (data: FormData) => {
        try {
            if (initialData?.id) {
                await api.put(`/feriados/${initialData.id}`, data);
                toast.success('Feriado actualizado');
            } else {
                await api.post('/feriados', data);
                toast.success('Feriado creado');
            }
            onSuccess();
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Error al guardar feriado');
        }
    };

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                    type="date"
                    label="Fecha"
                    {...register('fecha')}
                    error={errors.fecha?.message}
                />

                <Input
                    label="Nombre del Feriado"
                    {...register('nombre')}
                    error={errors.nombre?.message}
                    placeholder="Ej: Feriado Local"
                />

                <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-[#1D1D1F] uppercase tracking-wider">Tipo</label>
                    <div className="relative">
                        <select
                            {...register('tipo')}
                            className="w-full px-3 py-2 bg-white border border-[#D2D2D7] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#029E4D]/20 focus:border-[#029E4D] transition-colors appearance-none"
                        >
                            <option value="nacional">Nacional</option>
                            <option value="obra">Obra (Específico)</option>
                            <option value="patronal">Patronal</option>
                            <option value="otro">Otro</option>
                        </select>
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-[#6E6E73]">
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                        </div>
                    </div>
                </div>

                <div className="flex items-center mt-6">
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="checkbox"
                            {...register('irrenunciable')}
                            className="w-4 h-4 text-[#029E4D] bg-white border-[#D2D2D7] rounded focus:ring-[#029E4D] focus:ring-2"
                        />
                        <span className="text-sm text-[#1D1D1F] font-medium">Es Irrenunciable</span>
                    </label>
                </div>
            </div>

            <div className="sticky -bottom-6 -mx-6 px-6 py-4 bg-[#F5F5F7] border-t border-[#D2D2D7] flex justify-end gap-3 mt-6 z-10">
                <Button type="button" variant="outline" onClick={onCancel} className="w-full sm:w-auto">
                    Cancelar
                </Button>
                <Button type="submit" isLoading={isSubmitting} leftIcon={<Save className="h-4 w-4" />} className="w-full sm:w-auto">
                    Guardar
                </Button>
            </div>
        </form>
    );
};
