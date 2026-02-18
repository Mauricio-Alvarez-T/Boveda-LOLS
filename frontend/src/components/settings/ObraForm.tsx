import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast } from 'sonner';
import { Save } from 'lucide-react';

import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import api from '../../services/api';
import type { Obra, Empresa } from '../../types/entities';
import type { ApiResponse } from '../../types';

const schema = z.object({
    nombre: z.string().min(1, 'Nombre es requerido'),
    direccion: z.string().optional(),
    empresa_id: z.preprocess((val) => Number(val), z.number().min(1, 'Selecciona una empresa')),
});

type FormData = {
    nombre: string;
    direccion?: string;
    empresa_id: number;
};

interface Props {
    initialData?: Obra | null;
    onSuccess: () => void;
    onCancel: () => void;
}

export const ObraForm: React.FC<Props> = ({ initialData, onSuccess, onCancel }) => {
    const [empresas, setEmpresas] = useState<Empresa[]>([]);

    const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
        resolver: zodResolver(schema) as any,
        defaultValues: {
            nombre: initialData?.nombre || '',
            direccion: initialData?.direccion || '',
            empresa_id: initialData?.empresa_id || 0,
        },
    });

    useEffect(() => {
        api.get<ApiResponse<Empresa[]>>('/empresas').then(res => setEmpresas(res.data.data)).catch(() => { });
    }, []);

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
            <div className="space-y-1.5">
                <label className="text-sm font-medium text-muted-foreground ml-1">Empresa</label>
                <select
                    {...register('empresa_id')}
                    className="flex h-11 w-full rounded-xl border border-input bg-transparent px-4 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/50 focus-visible:border-brand-primary transition-all"
                >
                    <option value={0} className="bg-slate-900 text-muted-foreground">Seleccionar empresa...</option>
                    {empresas.map(e => (
                        <option key={e.id} value={e.id} className="bg-slate-900">{e.razon_social}</option>
                    ))}
                </select>
                {errors.empresa_id && <p className="text-xs text-destructive font-medium ml-1">{errors.empresa_id.message}</p>}
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
