import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast } from 'sonner';
import { Save } from 'lucide-react';

import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import api from '../../services/api';
import type { Empresa } from '../../types/entities';

const schema = z.object({
    rut: z.string().min(1, 'RUT es requerido'),
    razon_social: z.string().min(1, 'Razón social es requerida'),
    direccion: z.string().optional(),
    telefono: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

interface Props {
    initialData?: Empresa | null;
    onSuccess: () => void;
    onCancel: () => void;
}

export const EmpresaForm: React.FC<Props> = ({ initialData, onSuccess, onCancel }) => {
    const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
        resolver: zodResolver(schema),
        defaultValues: {
            rut: initialData?.rut || '',
            razon_social: initialData?.razon_social || '',
            direccion: initialData?.direccion || '',
            telefono: initialData?.telefono || '',
        },
    });

    const onSubmit = async (data: FormData) => {
        try {
            if (initialData) {
                await api.put(`/empresas/${initialData.id}`, data);
                toast.success('Empresa actualizada');
            } else {
                await api.post('/empresas', data);
                toast.success('Empresa creada');
            }
            onSuccess();
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Error al guardar empresa');
        }
    };

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Input label="RUT" {...register('rut')} error={errors.rut?.message} placeholder="12.345.678-9" />
            <Input label="Razón Social" {...register('razon_social')} error={errors.razon_social?.message} placeholder="Constructora SpA" />
            <Input label="Dirección" {...register('direccion')} error={errors.direccion?.message} placeholder="Av. Principal 123" />
            <Input label="Teléfono" {...register('telefono')} error={errors.telefono?.message} placeholder="+56 9 1234 5678" />
            <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
                <Button type="button" variant="glass" onClick={onCancel}>Cancelar</Button>
                <Button type="submit" isLoading={isSubmitting} leftIcon={<Save className="h-4 w-4" />}>
                    {initialData ? 'Actualizar' : 'Crear'}
                </Button>
            </div>
        </form>
    );
};
