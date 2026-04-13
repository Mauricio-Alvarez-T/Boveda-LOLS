import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast } from 'sonner';
import { Save } from 'lucide-react';

import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import api from '../../services/api';
import type { ItemInventario, CategoriaInventario } from '../../types/entities';
import type { ApiResponse } from '../../types';
import { useFormDirtyProtection } from '../../hooks/useFormDirtyProtection';

const schema = z.object({
    nro_item: z.coerce.number().int().min(1, 'Número de ítem requerido'),
    categoria_id: z.coerce.number().int().min(1, 'Categoría requerida'),
    descripcion: z.string().min(1, 'Descripción requerida'),
    m2: z.coerce.number().optional().nullable(),
    valor_compra: z.coerce.number().min(0, 'Valor >= 0'),
    valor_arriendo: z.coerce.number().min(0, 'Valor >= 0'),
    unidad: z.string().min(1, 'Unidad requerida'),
});

type FormData = z.infer<typeof schema>;

interface Props {
    initialData?: ItemInventario | null;
    onSuccess: () => void;
    onCancel: () => void;
}

export const ItemInventarioForm: React.FC<Props> = ({ initialData, onSuccess, onCancel }) => {
    const [categorias, setCategorias] = useState<CategoriaInventario[]>([]);

    const { register, handleSubmit, formState: { errors, isSubmitting, isDirty } } = useForm<FormData>({
        resolver: zodResolver(schema) as any,
        defaultValues: {
            nro_item: initialData?.nro_item ?? undefined,
            categoria_id: initialData?.categoria_id ?? undefined,
            descripcion: initialData?.descripcion || '',
            m2: initialData?.m2 ?? null,
            valor_compra: initialData?.valor_compra ?? 0,
            valor_arriendo: initialData?.valor_arriendo ?? 0,
            unidad: initialData?.unidad || 'U',
        },
    });

    useFormDirtyProtection(isDirty);

    useEffect(() => {
        api.get<ApiResponse<CategoriaInventario[]>>('/categorias-inventario?activo=true&limit=100')
            .then(res => setCategorias(res.data.data))
            .catch(() => {});
    }, []);

    const onSubmit = async (data: FormData) => {
        try {
            const payload = { ...data, m2: data.m2 || null };
            if (initialData) {
                await api.put(`/items-inventario/${initialData.id}`, payload);
                toast.success('Ítem actualizado');
            } else {
                await api.post('/items-inventario', payload);
                toast.success('Ítem creado');
            }
            onSuccess();
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Error al guardar ítem');
        }
    };

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
                <Input label="Nro Ítem" type="number" {...register('nro_item')} error={errors.nro_item?.message} placeholder="1" />
                <Select label="Categoría" {...register('categoria_id')} error={errors.categoria_id?.message}>
                    <option value="">Seleccionar...</option>
                    {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </Select>
            </div>
            <Input label="Descripción" {...register('descripcion')} error={errors.descripcion?.message} placeholder="ANDAMIO VERTICAL PATA REGULABLE" />
            <div className="grid grid-cols-3 gap-4">
                <Input label="M2 (moldajes)" type="number" step="0.0001" {...register('m2')} error={errors.m2?.message} placeholder="0.00" />
                <Input label="Valor Compra ($)" type="number" {...register('valor_compra')} error={errors.valor_compra?.message} placeholder="0" />
                <Input label="Valor Arriendo ($)" type="number" {...register('valor_arriendo')} error={errors.valor_arriendo?.message} placeholder="0" />
            </div>
            <Input label="Unidad" {...register('unidad')} error={errors.unidad?.message} placeholder="U" />

            <div className="sticky -bottom-6 -mx-6 px-6 py-4 bg-background border-t border-border flex justify-end gap-3 mt-6 z-10">
                <Button type="submit" isLoading={isSubmitting} leftIcon={<Save className="h-4 w-4" />} className="w-full sm:w-auto">
                    Guardar
                </Button>
            </div>
        </form>
    );
};
