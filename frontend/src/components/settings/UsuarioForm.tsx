import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast } from 'sonner';
import { Save } from 'lucide-react';

import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import api from '../../services/api';
import type { ApiResponse } from '../../types';

interface Role {
    id: number;
    nombre: string;
}

interface Obra {
    id: number;
    nombre: string;
}

interface UserData {
    id: number;
    nombre: string;
    email: string;
    email_corporativo?: string | null;
    rol_id: number;
    obra_id?: number | null;
    activo: boolean;
}

const schema = z.object({
    nombre: z.string().min(1, 'Nombre es requerido'),
    email: z.string().email('Email inválido'),
    password: z.string().optional(),
    email_corporativo: z.string().optional(),
    rol_id: z.preprocess((val) => Number(val), z.number().min(1, 'Selecciona un rol')),
    obra_id: z.preprocess((val) => Number(val), z.number().optional()),
});

type FormData = {
    nombre: string;
    email: string;
    password?: string;
    email_corporativo?: string;
    rol_id: number;
    obra_id?: number;
};

interface Props {
    initialData?: UserData | null;
    onSuccess: () => void;
    onCancel: () => void;
}

export const UsuarioForm: React.FC<Props> = ({ initialData, onSuccess, onCancel }) => {
    const [roles, setRoles] = useState<Role[]>([]);
    const [obras, setObras] = useState<Obra[]>([]);

    const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
        resolver: zodResolver(schema) as any,
        defaultValues: {
            nombre: initialData?.nombre || '',
            email: initialData?.email || '',
            password: '',
            email_corporativo: initialData?.email_corporativo || '',
            rol_id: initialData?.rol_id || 0,
            obra_id: initialData?.obra_id || 0,
        },
    });

    useEffect(() => {
        api.get<ApiResponse<Role[]>>('/usuarios/roles/list').then(res => setRoles(res.data.data)).catch(() => { });
        api.get<ApiResponse<Obra[]>>('/obras?activo=true').then(res => setObras(res.data.data)).catch(() => { });
    }, []);

    const onSubmit = async (data: FormData) => {
        try {
            const payload: any = { ...data };
            if (!payload.password) delete payload.password;
            if (!payload.obra_id) payload.obra_id = null;
            if (!payload.email_corporativo) payload.email_corporativo = null;

            if (initialData) {
                await api.put(`/usuarios/${initialData.id}`, payload);
                toast.success('Usuario actualizado');
            } else {
                if (!data.password) {
                    toast.error('La contraseña es requerida para nuevos usuarios');
                    return;
                }
                await api.post('/usuarios', payload);
                toast.success('Usuario creado');
            }
            onSuccess();
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Error al guardar usuario');
        }
    };

    const selectClass = "flex h-11 w-full rounded-xl border border-input bg-transparent px-4 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/50 focus-visible:border-brand-primary transition-all";

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Input label="Nombre" {...register('nombre')} error={errors.nombre?.message} placeholder="Juan Pérez" />
            <Input label="Email" type="email" {...register('email')} error={errors.email?.message} placeholder="juan@empresa.cl" />
            <Input
                label={initialData ? "Nueva Contraseña (dejar vacío para mantener)" : "Contraseña"}
                type="password"
                {...register('password')}
                error={errors.password?.message}
                placeholder="••••••••"
            />
            <Input label="Email Corporativo" {...register('email_corporativo')} error={errors.email_corporativo?.message} placeholder="juan@corporativo.cl" />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                    <label className="text-sm font-medium text-muted-foreground ml-1">Rol</label>
                    <select {...register('rol_id')} className={selectClass}>
                        <option value={0} className="bg-slate-900">Seleccionar rol...</option>
                        {roles.map(r => (
                            <option key={r.id} value={r.id} className="bg-slate-900">{r.nombre}</option>
                        ))}
                    </select>
                    {errors.rol_id && <p className="text-xs text-destructive font-medium ml-1">{errors.rol_id.message}</p>}
                </div>
                <div className="space-y-1.5">
                    <label className="text-sm font-medium text-muted-foreground ml-1">Obra Asignada</label>
                    <select {...register('obra_id')} className={selectClass}>
                        <option value={0} className="bg-slate-900">Oficina Central</option>
                        {obras.map(o => (
                            <option key={o.id} value={o.id} className="bg-slate-900">{o.nombre}</option>
                        ))}
                    </select>
                </div>
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
