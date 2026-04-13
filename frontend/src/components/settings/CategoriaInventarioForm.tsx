import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast } from 'sonner';
import { Save } from 'lucide-react';

import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import api from '../../services/api';
import type { CategoriaInventario } from '../../types/entities';
import { useFormDirtyProtection } from '../../hooks/useFormDirtyProtection';

const schema = z.object({
    nombre: z.string().min(1, 'Nombre es requerido'),
    orden: z.coerce.number().int().min(0, 'Orden debe ser >= 0'),
});

type FormData = z.infer<typeof schema>;

interface Props {
    initialData?: CategoriaInventario | null;
    onSuccess: () => void;
    onCancel: () => void;
}

export const CategoriaInventarioForm: React.FC<Props> = ({ initialData, onSuccess, onCancel }) => {
    const { register, handleSubmit, formState: { errors, isSubmitting, isDirty } } = useForm<FormData>({
        resolver: zodResolver(schema) as any,
        defaultValues: {
            nombre: initialData?.nombre || '',
            orden: initialData?.orden ?? 0,
        },
    });

    useFormDirtyProtection(isDirty);

    const onSubmit = async (data: FormData) => {
        try {
            if (initialData) {
                await api.put(`/categorias-inventario/${initialData.id}`, data);
                toast.success('Categoría actualizada');
            } else {
                await api.post('/categorias-inventario', data);
                toast.success('Categoría creada');
            }
            onSuccess();
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Error al guardar categoría');
        }
    };

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Input label="Nombre" {...register('nombre')} error={errors.nombre?.message} placeholder="ANDAMIOS" />
            <Input label="Orden" type="number" {...register('orden')} error={errors.orden?.message} placeholder="1" />

            <div className="sticky -bottom-6 -mx-6 px-6 py-4 bg-background border-t border-border flex justify-end gap-3 mt-6 z-10">
                <Button type="submit" isLoading={isSubmitting} leftIcon={<Save className="h-4 w-4" />} className="w-full sm:w-auto">
                    Guardar
                </Button>
            </div>
        </form>
    );
};
