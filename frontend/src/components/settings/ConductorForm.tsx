import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast } from 'sonner';
import { Save } from 'lucide-react';

import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import type { Conductor } from '../../types/entities';
import { celularValido, formatoCelular, MENSAJE_CELULAR, normalizarCelular } from '../../utils/celular';

const schema = z.object({
    nombre: z.string().min(1, 'Nombre es requerido'),
    // Celular del conductor (mig 132): opcional; «Avisar» del Inicio le escribe directo por WhatsApp.
    telefono: z.string().optional().refine(v => celularValido(v), MENSAJE_CELULAR),
});

type FormData = z.infer<typeof schema>;

interface Props {
    initialData?: Conductor | null;
    onSuccess: () => void;
    onCancel: () => void;
    /** Si true, oculta los botones internos (cuando el Modal padre los expone vía headerAction). */
    hideActions?: boolean;
}

export const ConductorForm: React.FC<Props> = ({ initialData, onSuccess, onCancel, hideActions = false }) => {
    // El teléfono solo llega a quien tiene vehiculos.ver (el backend lo quita para el resto). Sin ese permiso el
    // campo no se muestra NI se envía: mandarlo vacío borraría el número que esta persona no alcanza a ver.
    const { hasPermission } = useAuth();
    const conTelefono = hasPermission('vehiculos.ver');
    const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
        resolver: zodResolver(schema),
        defaultValues: { nombre: initialData?.nombre || '', telefono: formatoCelular(initialData?.telefono) },
    });

    const onSubmit = async (data: FormData) => {
        const telefono = normalizarCelular(data.telefono);
        const payload = conTelefono && telefono.ok
            ? { nombre: data.nombre, telefono: telefono.valor }
            : { nombre: data.nombre };
        try {
            if (initialData) {
                await api.put(`/conductores/${initialData.id}`, payload);
                toast.success('Conductor actualizado');
            } else {
                await api.post('/conductores', payload);
                toast.success('Conductor creado');
            }
            onSuccess();
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Error al guardar conductor');
        }
    };

    return (
        <form id="conductor-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Input label="Nombre del Conductor" {...register('nombre')} error={errors.nombre?.message} placeholder="Ej: Juan Pérez" />
            {conTelefono && (
                <Input label="Teléfono (WhatsApp)" type="tel" inputMode="tel" autoComplete="off" placeholder="9 1234 5678"
                    {...register('telefono')} error={errors.telefono?.message}
                    helperText="Opcional. Con este número, «Avisar» del Inicio le escribe directo por WhatsApp." />
            )}
            {!hideActions && (
                <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
                    <Button type="button" variant="glass" onClick={onCancel}>Cancelar</Button>
                    <Button type="submit" isLoading={isSubmitting} leftIcon={<Save className="h-4 w-4" />}>
                        {initialData ? 'Actualizar' : 'Crear'}
                    </Button>
                </div>
            )}
        </form>
    );
};
