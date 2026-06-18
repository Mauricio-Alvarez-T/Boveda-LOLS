import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast } from 'sonner';
import { Input } from '../ui/Input';
import api from '../../services/api';
import type { EmpresaVehiculo } from '../../types/entities';
import { useFormDirtyProtection } from '../../hooks/useFormDirtyProtection';

const schema = z.object({
    nombre: z.string().trim().min(2, 'El nombre debe tener al menos 2 caracteres'),
    // Color en hex de 6 dígitos (lo entrega <input type="color">).
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color inválido'),
});
type FormData = z.infer<typeof schema>;

interface Props {
    initialData?: EmpresaVehiculo | null;
    onSuccess: () => void;
    onCancel: () => void;
}

export const EmpresaForm: React.FC<Props> = ({ initialData, onSuccess, onCancel }) => {
    const { register, handleSubmit, watch, formState: { errors, isDirty } } = useForm<FormData>({
        resolver: zodResolver(schema) as any,
        defaultValues: {
            nombre: initialData?.nombre || '',
            color: initialData?.color || '#2563eb',
        },
    });
    useFormDirtyProtection(isDirty);

    const color = watch('color');
    const nombre = watch('nombre');

    const onSubmit = async (data: FormData) => {
        try {
            if (initialData) {
                await api.put(`/empresas-vehiculos/${initialData.id}`, data);
                toast.success('Empresa actualizada');
            } else {
                await api.post('/empresas-vehiculos', data);
                toast.success('Empresa creada');
            }
            onSuccess();
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Error al guardar empresa');
        }
    };

    return (
        <form id="empresa-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Input label="Nombre" placeholder="Ej: LOLS, TRANSPORTE..."
                {...register('nombre')} error={errors.nombre?.message} />
            <div>
                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
                    Color identificador
                </label>
                <div className="flex items-center gap-3">
                    <input type="color" {...register('color')}
                        className="h-10 w-16 rounded-lg border border-border cursor-pointer bg-card shrink-0" />
                    {/* Vista previa del badge tal como se verá en la tarjeta de empresa */}
                    <span className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-bold"
                        style={{ color, backgroundColor: `${color}1a` }}>
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
                        {nombre || 'Vista previa'}
                    </span>
                </div>
                {errors.color?.message && <p className="text-caption text-destructive mt-1">{errors.color.message}</p>}
            </div>
            {/* Botones Cancelar/Guardar viven en el header del Modal (headerAction). */}
        </form>
    );
};
