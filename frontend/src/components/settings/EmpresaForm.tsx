import React from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast } from 'sonner';
import { Save } from 'lucide-react';

import { formatRut, validateRut } from '../../utils/rut';

import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import api from '../../services/api';
import type { Empresa } from '../../types/entities';
import { useFormDirtyProtection } from '../../hooks/useFormDirtyProtection';

const schema = z.object({
    rut: z.string().min(1, 'RUT es requerido').refine(validateRut, 'RUT inválido'),
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
    const { register, handleSubmit, control, formState: { errors, isSubmitting, isDirty } } = useForm<FormData>({
        resolver: zodResolver(schema),
        defaultValues: {
            rut: initialData?.rut || '',
            razon_social: initialData?.razon_social || '',
            direccion: initialData?.direccion || '',
            telefono: initialData?.telefono || '',
        },
    });

    useFormDirtyProtection(isDirty);

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
            <Controller
                name="rut"
                control={control}
                render={({ field: { onChange, value, ref } }) => (
                    <Input
                        ref={ref}
                        label="RUT"
                        placeholder="12.345.678-9"
                        error={errors.rut?.message}
                        value={value || ''}
                        onChange={(e) => {
                            const formatted = formatRut(e.target.value);
                            onChange(formatted);
                        }}
                    />
                )}
            />
            <Input label="Razón Social" {...register('razon_social')} error={errors.razon_social?.message} placeholder="Constructora SpA" />
            <Input label="Dirección" {...register('direccion')} error={errors.direccion?.message} placeholder="Av. Principal 123" />
            <Input label="Teléfono" {...register('telefono')} error={errors.telefono?.message} placeholder="+56 9 1234 5678" />
            <div className="sticky -bottom-6 -mx-6 px-6 py-4 bg-background border-t border-border flex justify-end gap-3 mt-6 z-10">
                <Button type="submit" isLoading={isSubmitting} leftIcon={<Save className="h-4 w-4" />} className="w-full sm:w-auto">
                    Guardar
                </Button>
            </div>
        </form>
    );
};
