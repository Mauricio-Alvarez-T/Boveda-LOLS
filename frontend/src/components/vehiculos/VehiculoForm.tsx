import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast } from 'sonner';
import { Save } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import api from '../../services/api';
import type { Vehiculo } from '../../types/entities';
import { useFormDirtyProtection } from '../../hooks/useFormDirtyProtection';

const schema = z.object({
    patente: z.string().min(1, 'Patente requerida'),
    marca:   z.string().min(1, 'Marca requerida'),
    modelo:  z.string().min(1, 'Modelo requerido'),
    anio:    z.coerce.number().min(1900).max(new Date().getFullYear() + 1),
    tipo:    z.enum(['camioneta','camion','auto','furgon','bus','otro']),
    kilometraje_actual: z.coerce.number().min(0).optional(),
    color:   z.string().optional(),
    observaciones: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

interface Props {
    initialData?: Vehiculo | null;
    onSuccess: () => void;
    onCancel: () => void;
}

export const VehiculoForm: React.FC<Props> = ({ initialData, onSuccess, onCancel }) => {
    const { register, handleSubmit, formState: { errors, isSubmitting, isDirty } } = useForm<FormData>({
        resolver: zodResolver(schema) as any,
        defaultValues: initialData ? {
            patente: initialData.patente,
            marca:   initialData.marca,
            modelo:  initialData.modelo,
            anio:    initialData.anio,
            tipo:    initialData.tipo,
            kilometraje_actual: initialData.kilometraje_actual,
            color:   initialData.color || '',
            observaciones: initialData.observaciones || '',
        } : { tipo: 'camioneta', kilometraje_actual: 0 },
    });

    useFormDirtyProtection(isDirty);

    const onSubmit = async (data: FormData) => {
        try {
            if (initialData) {
                await api.put(`/vehiculos/${initialData.id}`, data);
                toast.success('Vehículo actualizado');
            } else {
                await api.post('/vehiculos', data);
                toast.success('Vehículo registrado');
            }
            onSuccess();
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Error al guardar vehículo');
        }
    };

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
                <Input label="Patente" placeholder="ABCD12" {...register('patente')}
                    error={errors.patente?.message} />
                <div>
                    <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Tipo</label>
                    <select {...register('tipo')}
                        className="w-full px-3 py-2.5 rounded-xl border border-border bg-card text-sm text-brand-dark focus:outline-none focus:ring-2 focus:ring-brand-primary/30">
                        <option value="camioneta">Camioneta</option>
                        <option value="camion">Camión</option>
                        <option value="auto">Auto</option>
                        <option value="furgon">Furgón</option>
                        <option value="bus">Bus</option>
                        <option value="otro">Otro</option>
                    </select>
                </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
                <Input label="Marca" placeholder="Toyota" {...register('marca')} error={errors.marca?.message} />
                <Input label="Modelo" placeholder="Hilux" {...register('modelo')} error={errors.modelo?.message} />
            </div>
            <div className="grid grid-cols-2 gap-4">
                <Input label="Año" type="number" placeholder="2022" {...register('anio')} error={errors.anio?.message} />
                <Input label="Color" placeholder="Blanco" {...register('color')} />
            </div>
            <Input label="Kilómetros actuales" type="number" {...register('kilometraje_actual')} />
            <div>
                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Observaciones</label>
                <textarea {...register('observaciones')} rows={2}
                    className="w-full px-3 py-2.5 rounded-xl border border-border bg-card text-sm text-brand-dark resize-none focus:outline-none focus:ring-2 focus:ring-brand-primary/30" />
            </div>
            <div className="sticky -bottom-6 -mx-6 px-6 py-4 bg-background border-t border-border flex justify-end gap-3 mt-6 z-10">
                <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
                <Button type="submit" isLoading={isSubmitting} leftIcon={<Save className="h-4 w-4" />}>Guardar</Button>
            </div>
        </form>
    );
};
