import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast } from 'sonner';
import { Save } from 'lucide-react';

import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import api from '../../services/api';
import type { Bodega } from '../../types/entities';
import { useFormDirtyProtection } from '../../hooks/useFormDirtyProtection';

const schema = z.object({
    nombre: z.string().min(1, 'Nombre es requerido'),
    direccion: z.string().optional(),
    responsable_nombre: z.string().optional(),
    participa_inventario: z.boolean().optional(),
    participa_transferencias: z.boolean().optional(),
});

type FormData = z.infer<typeof schema>;

interface Props {
    initialData?: Bodega | null;
    onSuccess: () => void;
    onCancel: () => void;
}

export const BodegaForm: React.FC<Props> = ({ initialData, onSuccess, onCancel }) => {
    const { register, handleSubmit, formState: { errors, isSubmitting, isDirty } } = useForm<FormData>({
        resolver: zodResolver(schema) as any,
        defaultValues: {
            nombre: initialData?.nombre || '',
            direccion: initialData?.direccion || '',
            responsable_nombre: initialData?.responsable_nombre || '',
            participa_inventario: initialData ? (initialData.participa_inventario ?? true) : true,
            participa_transferencias: initialData ? (initialData.participa_transferencias ?? true) : true,
        },
    });

    useFormDirtyProtection(isDirty);

    const onSubmit = async (data: FormData) => {
        try {
            const payload = {
                ...data,
                participa_inventario: data.participa_inventario ?? true,
                participa_transferencias: data.participa_transferencias ?? true,
            };
            if (initialData) {
                await api.put(`/bodegas/${initialData.id}`, payload);
                toast.success('Bodega actualizada');
            } else {
                await api.post('/bodegas', payload);
                toast.success('Bodega creada');
            }
            onSuccess();
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Error al guardar bodega');
        }
    };

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Input label="Nombre" {...register('nombre')} error={errors.nombre?.message} placeholder="Bodega Central" />
            <Input label="Dirección" {...register('direccion')} error={errors.direccion?.message} placeholder="Av. Los Andes 123" />
            <Input
                label="Responsable (nombre)"
                {...register('responsable_nombre')}
                error={errors.responsable_nombre?.message}
                placeholder="Ej: Juan Pérez"
            />

            {/* Participación por apartado (mig 075). También editable rápido con los
                botones toggle de la fila en Configuración → Bodegas. */}
            <div className="rounded-xl border border-border p-3">
                <span className="text-xs font-bold text-brand-dark/60 uppercase tracking-wider">Participa en apartados</span>
                <div className="mt-2 space-y-2">
                    {[
                        { field: 'participa_inventario' as const, label: 'Inventario' },
                        { field: 'participa_transferencias' as const, label: 'Transferencias' },
                    ].map(({ field, label }) => (
                        <label key={field} className="flex items-center gap-3 cursor-pointer">
                            <input
                                type="checkbox"
                                id={field}
                                {...register(field)}
                                className="h-5 w-5 rounded border-border text-brand-primary focus:ring-brand-primary cursor-pointer"
                            />
                            <span className="text-sm text-brand-dark">{label}</span>
                        </label>
                    ))}
                </div>
            </div>

            <div className="sticky -bottom-6 -mx-6 px-6 py-4 bg-background border-t border-border flex justify-end gap-3 mt-6 z-10">
                <Button type="submit" isLoading={isSubmitting} leftIcon={<Save className="h-4 w-4" />} className="w-full sm:w-auto">
                    Guardar
                </Button>
            </div>
        </form>
    );
};
