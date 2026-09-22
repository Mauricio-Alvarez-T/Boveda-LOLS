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
    // Mig 110: firma contratos y finiquitos generados por Bóveda (plan Gestiones B2). Opcionales:
    // sin representante el backend responde 409 al emitir un contrato.
    representante_nombre: z.string().max(150, 'Máximo 150 caracteres').optional(),
    representante_rut: z.string().optional().refine(v => !v || validateRut(v), 'RUT inválido'),
});

type FormData = z.infer<typeof schema>;

interface Props {
    initialData?: Empresa | null;
    onSuccess: () => void;
    onCancel: () => void;
    /** Si true, oculta el botón Guardar interno (cuando el Modal padre lo expone vía headerAction). */
    hideActions?: boolean;
}

export const EmpresaForm: React.FC<Props> = ({ initialData, onSuccess, onCancel: _onCancel, hideActions = false }) => {
    const { register, handleSubmit, control, formState: { errors, isSubmitting, isDirty } } = useForm<FormData>({
        resolver: zodResolver(schema),
        defaultValues: {
            rut: initialData?.rut || '',
            razon_social: initialData?.razon_social || '',
            direccion: initialData?.direccion || '',
            telefono: initialData?.telefono || '',
            representante_nombre: initialData?.representante_nombre || '',
            representante_rut: initialData?.representante_rut || '',
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
        <form id="empresa-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
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
                        autoCapitalize="characters"
                        autoCorrect="off"
                        spellCheck={false}
                        onChange={(e) => {
                            const formatted = formatRut(e.target.value);
                            onChange(formatted);
                        }}
                    />
                )}
            />
            <Input label="Razón Social" {...register('razon_social')} error={errors.razon_social?.message} placeholder="Constructora SpA" />
            <Input label="Dirección" {...register('direccion')} error={errors.direccion?.message} placeholder="Av. Principal 123" />
            <Input label="Teléfono" type="tel" inputMode="tel" {...register('telefono')} error={errors.telefono?.message} placeholder="+56 9 1234 5678" />
            <div className="rounded-2xl border border-border bg-background p-4 space-y-3">
                <div>
                    <p className="text-sm font-semibold text-brand-dark">Representante legal</p>
                    <p className="text-xs text-muted-foreground">Firma los contratos y finiquitos que Bóveda genera para esta empresa. Sin él no se pueden emitir.</p>
                </div>
                <Input label="Nombre" {...register('representante_nombre')} error={errors.representante_nombre?.message} placeholder="Luis Lazcano Silva" />
                <Controller
                    name="representante_rut"
                    control={control}
                    render={({ field: { onChange, value, ref } }) => (
                        <Input ref={ref} label="RUT del representante" placeholder="7.907.220-6" error={errors.representante_rut?.message}
                            value={value || ''} autoCapitalize="characters" autoCorrect="off" spellCheck={false}
                            onChange={(e) => onChange(formatRut(e.target.value))} />
                    )}
                />
            </div>
            {!hideActions && (
                <div className="sticky -bottom-6 -mx-6 px-6 py-4 bg-background border-t border-border flex justify-end gap-3 mt-6 z-10">
                    <Button type="submit" isLoading={isSubmitting} leftIcon={<Save className="h-4 w-4" />} className="w-full sm:w-auto">
                        Guardar
                    </Button>
                </div>
            )}
        </form>
    );
};
