import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast } from 'sonner';
import { Save, Loader2 } from 'lucide-react';

import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import api from '../../services/api';

import { PermissionMatrix } from './PermissionMatrix';
import type { Permission } from './PermissionMatrix';

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
    const [permisos, setPermisos] = React.useState<Permission[]>([]);
    const [loadingPerms, setLoadingPerms] = React.useState(false);

    const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
        resolver: zodResolver(schema),
        defaultValues: {
            nombre: initialData?.nombre || '',
            descripcion: initialData?.descripcion || '',
        },
    });

    React.useEffect(() => {
        if (initialData) {
            const fetchPerms = async () => {
                setLoadingPerms(true);
                try {
                    const res = await api.get(`/usuarios/roles/${initialData.id}/permisos`);
                    setPermisos(res.data);
                } catch (err) {
                    console.error('Error fetching perms', err);
                } finally {
                    setLoadingPerms(false);
                }
            };
            fetchPerms();
        }
    }, [initialData]);

    const onSubmit = async (data: FormData) => {
        try {
            let rolId = initialData?.id;

            if (initialData) {
                await api.put(`/usuarios/roles/${initialData.id}`, data);
            } else {
                const res = await api.post('/usuarios/roles', data);
                rolId = res.data.id;
            }

            // Save permissions
            if (rolId) {
                await api.post(`/usuarios/roles/${rolId}/permisos-bulk`, { permisos });
            }

            toast.success(initialData ? 'Rol actualizado' : 'Rol creado');
            onSuccess();
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Error al guardar rol');
        }
    };

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div className="space-y-4">
                <Input label="Nombre del Rol" {...register('nombre')} error={errors.nombre?.message} placeholder="Administrador, Prevencionista..." />
                <Input label="Descripción" {...register('descripcion')} error={errors.descripcion?.message} placeholder="Descripción del rol" />
            </div>

            <div className="space-y-3">
                <h4 className="text-xs font-bold text-[#6E6E73] uppercase px-1">Matriz de Permisos</h4>
                {loadingPerms ? (
                    <div className="h-40 bg-[#F5F5F7] rounded-2xl flex items-center justify-center border border-[#D2D2D7]">
                        <Loader2 className="h-6 w-6 animate-spin text-[#0071E3]" />
                    </div>
                ) : (
                    <PermissionMatrix permisos={permisos} onChange={setPermisos} />
                )}
            </div>

            <div className="flex justify-end gap-3 pt-6 border-t border-[#D2D2D7]">
                <Button type="button" variant="glass" onClick={onCancel}>Cancelar</Button>
                <Button type="submit" isLoading={isSubmitting} leftIcon={<Save className="h-4 w-4" />}>
                    {initialData ? 'Actualizar' : 'Crear'}
                </Button>
            </div>
        </form>
    );
};
