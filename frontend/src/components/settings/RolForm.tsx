import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast } from 'sonner';
import { Save, Loader2, LogOut } from 'lucide-react';

import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import api from '../../services/api';


interface RoleData {
    id: number;
    nombre: string;
    descripcion?: string | null;
    activo: boolean;
}

const schema = z.object({
    nombre: z.string().min(1, 'Nombre es requerido'),
    descripcion: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

interface Props {
    initialData?: RoleData | null;
    onSuccess: () => void;
    onCancel: () => void;
}

export const RolForm: React.FC<Props> = ({ initialData, onSuccess, onCancel }) => {
    const [resetingSessions, setResetingSessions] = React.useState(false);

    const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
        resolver: zodResolver(schema),
        defaultValues: {
            nombre: initialData?.nombre || '',
            descripcion: initialData?.descripcion || '',
        },
    });

    // Removida lógica de carga de permisos antiguos para evitar conflictos de tipos

    const onSubmit = async (data: FormData) => {
        try {
            let rolId = initialData?.id;

            if (initialData) {
                await api.put(`/usuarios/roles/${initialData.id}`, data);
            } else {
                const res = await api.post('/usuarios/roles', data);
                rolId = res.data.id;
            }

            // Permisos se guardan por separado ahora con el nuevo panel

            toast.success(initialData ? 'Rol actualizado' : 'Rol creado');
            onSuccess();
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Error al guardar rol');
        }
    };

    const handleResetSessions = async () => {
        if (!initialData) return;
        if (!confirm('¿Estás seguro de que deseas cerrar la sesión de todos los usuarios con este rol? Esta acción les obligará a re-ingresar.')) return;

        setResetingSessions(true);
        try {
            await api.post(`/usuarios/roles/${initialData.id}/reset-sessions`);
            toast.success('Sesiones de usuarios invalidadas correctamente');
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Error al resetear sesiones');
        } finally {
            setResetingSessions(false);
        }
    };

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div className="space-y-4">
                <Input label="Nombre del Rol" {...register('nombre')} error={errors.nombre?.message} placeholder="Administrador, Prevencionista..." />
                <Input label="Descripción" {...register('descripcion')} error={errors.descripcion?.message} placeholder="Descripción del rol" />
            </div>

            {/* Permisos se gestionan ahora desde el icono de escudo en la tabla de roles */}

            <div className="flex justify-between items-center pt-6 border-t border-border">
                <div>
                    {initialData && (
                        <Button
                            type="button"
                            variant="destructive"
                            onClick={handleResetSessions}
                            isLoading={resetingSessions}
                            className="bg-destructive/10 text-destructive hover:bg-destructive hover:text-white border-none"
                            leftIcon={<LogOut className="h-4 w-4" />}
                        >
                            Liquidar Sesiones Activas
                        </Button>
                    )}
                </div>
                <div className="flex gap-3">
                    <Button type="button" variant="glass" onClick={onCancel}>Cancelar</Button>
                    <Button type="submit" isLoading={isSubmitting} leftIcon={<Save className="h-4 w-4" />}>
                        {initialData ? 'Actualizar' : 'Crear'}
                    </Button>
                </div>
            </div>
        </form>
    );
};
