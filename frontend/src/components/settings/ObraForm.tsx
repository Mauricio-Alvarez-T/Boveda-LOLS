import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast } from 'sonner';
import { Save } from 'lucide-react';

import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import api from '../../services/api';
import type { Obra } from '../../types/entities';

const schema = z.object({
    nombre: z.string().min(1, 'Nombre es requerido'),
    direccion: z.string().optional(),
});

type FormData = {
    nombre: string;
    direccion?: string;
};

interface Props {
    initialData?: Obra | null;
    onSuccess: () => void;
    onCancel: () => void;
}

export const ObraForm: React.FC<Props> = ({ initialData, onSuccess, onCancel }) => {
    const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
        resolver: zodResolver(schema) as any,
        defaultValues: {
            nombre: initialData?.nombre || '',
            direccion: initialData?.direccion || '',
        },
    });

    const onSubmit = async (data: FormData) => {
        try {
            if (initialData) {
                await api.put(`/obras/${initialData.id}`, data);
                toast.success('Obra actualizada');
            } else {
                await api.post('/obras', data);
                toast.success('Obra creada');
            }
            onSuccess();
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Error al guardar obra');
        }
    };

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Input label="Nombre" {...register('nombre')} error={errors.nombre?.message} placeholder="Edificio Los Olmos" />
            <Input label="Dirección" {...register('direccion')} error={errors.direccion?.message} placeholder="Av. Providencia 456" />

            <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
                <Button type="button" variant="glass" onClick={onCancel}>Cancelar</Button>
                <Button type="submit" isLoading={isSubmitting} leftIcon={<Save className="h-4 w-4" />}>
                    {initialData ? 'Actualizar' : 'Crear'}
                </Button>
            </div>
        </form>
    );
};
