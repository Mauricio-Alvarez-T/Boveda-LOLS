import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast } from 'sonner';
import { Save } from 'lucide-react';

import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import api from '../../services/api';
import type { Conductor } from '../../types/entities';

const schema = z.object({
    nombre: z.string().min(1, 'Nombre es requerido'),
});

type FormData = z.infer<typeof schema>;

interface Props {
    initialData?: Conductor | null;
    onSuccess: () => void;
    onCancel: () => void;
    /** Si true, oculta los botones internos (cuando el Modal padre los expone vía headerAction). */
    hideActions?: boolean;
}

export const ConductorForm: React.FC<Props> = ({ initialData, onSuccess, onCancel, hideActions = false }) => {
    const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
        resolver: zodResolver(schema),
        defaultValues: { nombre: initialData?.nombre || '' },
    });

    const onSubmit = async (data: FormData) => {
        try {
            if (initialData) {
                await api.put(`/conductores/${initialData.id}`, data);
                toast.success('Conductor actualizado');
            } else {
                await api.post('/conductores', data);
                toast.success('Conductor creado');
            }
            onSuccess();
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Error al guardar conductor');
        }
    };

    return (
        <form id="conductor-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Input label="Nombre del Conductor" {...register('nombre')} error={errors.nombre?.message} placeholder="Ej: Juan Pérez" />
            {!hideActions && (
                <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
                    <Button type="button" variant="glass" onClick={onCancel}>Cancelar</Button>
                    <Button type="submit" isLoading={isSubmitting} leftIcon={<Save className="h-4 w-4" />}>
                        {initialData ? 'Actualizar' : 'Crear'}
                    </Button>
                </div>
            )}
        </form>
    );
};
