import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast } from 'sonner';
import { Save } from 'lucide-react';

import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import api from '../../services/api';

interface RoleData {
    id: number;
    nombre: string;
    descripcion?: string | null;
    activo: boolean;
}

const schema = z.object({
    nombre: z.string().min(1, 'Nombre es requerido'),
    descripcion: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

interface Props {
    initialData?: RoleData | null;
    onSuccess: () => void;
    onCancel: () => void;
}

export const RolForm: React.FC<Props> = ({ initialData, onSuccess, onCancel }) => {
    const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
        resolver: zodResolver(schema),
        defaultValues: {
            nombre: initialData?.nombre || '',
            descripcion: initialData?.descripcion || '',
        },
    });

    const onSubmit = async (data: FormData) => {
        try {
            if (initialData) {
                await api.put(`/usuarios/roles/${initialData.id}`, data);
                toast.success('Rol actualizado');
            } else {
                await api.post('/usuarios/roles', data);
                toast.success('Rol creado');
            }
            onSuccess();
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Error al guardar rol');
        }
    };

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Input label="Nombre del Rol" {...register('nombre')} error={errors.nombre?.message} placeholder="Administrador, Prevencionista..." />
            <Input label="Descripción" {...register('descripcion')} error={errors.descripcion?.message} placeholder="Descripción del rol" />
            <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
                <Button type="button" variant="glass" onClick={onCancel}>Cancelar</Button>
                <Button type="submit" isLoading={isSubmitting} leftIcon={<Save className="h-4 w-4" />}>
                    {initialData ? 'Actualizar' : 'Crear'}
                </Button>
            </div>
        </form>
    );
};
