import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast } from 'sonner';
import { Save } from 'lucide-react';

import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import api from '../../services/api';
import type { Obra } from '../../types/entities';
import { useFormDirtyProtection } from '../../hooks/useFormDirtyProtection';

const schema = z.object({
    nombre: z.string().min(1, 'Nombre es requerido'),
    direccion: z.string().optional(),
    encargado_nombre: z.string().optional(),
    participa_inventario: z.boolean().optional(),
    es_prueba: z.boolean().optional(),
});

type FormData = {
    nombre: string;
    direccion?: string;
    encargado_nombre?: string;
    participa_inventario?: boolean;
    es_prueba?: boolean;
};

interface Props {
    initialData?: Obra | null;
    onSuccess: () => void;
    onCancel: () => void;
    /** Si true, oculta el botón Guardar interno (cuando el Modal padre lo expone vía headerAction). */
    hideActions?: boolean;
}

export const ObraForm: React.FC<Props> = ({ initialData, onSuccess, onCancel: _onCancel, hideActions = false }) => {
    const { register, handleSubmit, formState: { errors, isSubmitting, isDirty } } = useForm<FormData>({
        resolver: zodResolver(schema) as any,
        defaultValues: {
            nombre: initialData?.nombre || '',
            direccion: initialData?.direccion || '',
            encargado_nombre: initialData?.encargado_nombre || '',
            // Default TRUE para obras nuevas (se comportan como antes).
            // En edición respetamos el valor actual.
            participa_inventario: initialData ? (initialData.participa_inventario ?? true) : true,
            es_prueba: initialData?.es_prueba ?? false,
        },
    });

    useFormDirtyProtection(isDirty);

    const onSubmit = async (data: FormData) => {
        try {
            const payload = {
                ...data,
                participa_inventario: data.participa_inventario ?? true,
                es_prueba: data.es_prueba ?? false,
            };
            if (initialData) {
                await api.put(`/obras/${initialData.id}`, payload);
                toast.success('Obra actualizada');
            } else {
                await api.post('/obras', payload);
                toast.success('Obra creada');
            }
            onSuccess();
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Error al guardar obra');
        }
    };

    return (
        <form id="obra-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Input label="Nombre" {...register('nombre')} error={errors.nombre?.message} placeholder="Edificio Los Olmos" />
            <Input label="Dirección" {...register('direccion')} error={errors.direccion?.message} placeholder="Av. Providencia 456" />
            <Input
                label="Encargado de obra (solicita material)"
                {...register('encargado_nombre')}
                error={errors.encargado_nombre?.message}
                placeholder="Ej: Leonardo Pérez"
            />

            <div className="py-2">
                <label className="flex items-start gap-3 cursor-pointer">
                    <div className="pt-0.5">
                        <input
                            type="checkbox"
                            id="participa_inventario"
                            {...register('participa_inventario')}
                            className="h-5 w-5 rounded border-border text-brand-primary focus:ring-brand-primary cursor-pointer"
                        />
                    </div>
                    <div className="flex flex-col">
                        <span className="text-sm font-semibold text-brand-dark">
                            Participa en Inventario
                        </span>
                        <span className="text-xs text-muted-foreground mt-0.5">
                            Si está marcado, esta obra aparecerá en los listados y selectores del módulo de inventario (transferencias, stock, facturación).
                            Desmárcalo para obras que solo se usan en asistencia (ej. "Oficina") y evitar que generen ruido en inventario.
                        </span>
                    </div>
                </label>
            </div>

            <div className="py-2">
                <label className="flex items-start gap-3 cursor-pointer rounded-xl border border-amber-300 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 p-3">
                    <div className="pt-0.5">
                        <input
                            type="checkbox"
                            id="es_prueba"
                            {...register('es_prueba')}
                            className="h-5 w-5 rounded border-amber-400 text-amber-600 focus:ring-amber-500 cursor-pointer"
                        />
                    </div>
                    <div className="flex flex-col">
                        <span className="text-sm font-semibold text-amber-900 dark:text-amber-300">
                            🧪 Obra de prueba (aislar)
                        </span>
                        <span className="text-xs text-amber-800/80 dark:text-amber-400/80 mt-0.5">
                            Si está marcado, esta obra <strong>y todos sus trabajadores</strong> quedan EXCLUIDOS de reportes,
                            inventario, dashboard, KPIs, asistencia y selectores. Solo serán visibles aquí (y en Consultas) para
                            poder revertir el aislamiento. Úsalo para datos de prueba.
                        </span>
                    </div>
                </label>
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
