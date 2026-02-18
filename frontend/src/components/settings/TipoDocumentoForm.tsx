import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast } from 'sonner';
import { Save } from 'lucide-react';

import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import api from '../../services/api';
import type { TipoDocumento } from '../../types/entities';

const schema = z.object({
    nombre: z.string().min(1, 'Nombre es requerido'),
    dias_vigencia: z.preprocess((val) => val === '' || val === null || val === undefined ? null : Number(val), z.number().nullable().optional()),
    obligatorio: z.boolean().optional(),
});

type FormData = {
    nombre: string;
    dias_vigencia?: number | null;
    obligatorio?: boolean;
};

interface Props {
    initialData?: TipoDocumento | null;
    onSuccess: () => void;
    onCancel: () => void;
}

export const TipoDocumentoForm: React.FC<Props> = ({ initialData, onSuccess, onCancel }) => {
    const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
        resolver: zodResolver(schema) as any,
        defaultValues: {
            nombre: initialData?.nombre || '',
            dias_vigencia: initialData?.dias_vigencia ?? null,
            obligatorio: initialData?.obligatorio ?? false,
        },
    });

    const onSubmit = async (data: FormData) => {
        try {
            const payload = {
                ...data,
                dias_vigencia: data.dias_vigencia || null,
                obligatorio: data.obligatorio ?? false,
            };
            if (initialData) {
                await api.put(`/documentos/tipos/${initialData.id}`, payload);
                toast.success('Tipo de documento actualizado');
            } else {
                await api.post('/documentos/tipos', payload);
                toast.success('Tipo de documento creado');
            }
            onSuccess();
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Error al guardar tipo de documento');
        }
    };

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Input label="Nombre" {...register('nombre')} error={errors.nombre?.message} placeholder="Contrato de Trabajo" />
            <Input
                label="Días de Vigencia"
                type="number"
                {...register('dias_vigencia')}
                error={errors.dias_vigencia?.message}
                placeholder="365 (vacío = sin vencimiento)"
            />
            <div className="flex items-center gap-3 py-2">
                <input
                    type="checkbox"
                    id="obligatorio"
                    {...register('obligatorio')}
                    className="h-4 w-4 rounded border-white/20 bg-white/5 text-brand-primary focus:ring-brand-primary"
                />
                <label htmlFor="obligatorio" className="text-sm text-white font-medium cursor-pointer">
                    Documento obligatorio
                </label>
            </div>
            <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
                <Button type="button" variant="glass" onClick={onCancel}>Cancelar</Button>
                <Button type="submit" isLoading={isSubmitting} leftIcon={<Save className="h-4 w-4" />}>
                    {initialData ? 'Actualizar' : 'Crear'}
                </Button>
            </div>
        </form>
    );
};
