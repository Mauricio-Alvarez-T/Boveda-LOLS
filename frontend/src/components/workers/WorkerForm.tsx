import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast } from 'sonner';
import { Loader2, Save } from 'lucide-react';

import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { Select } from '../ui/Select';
import type { SelectOption } from '../ui/Select';
import api from '../../services/api';
import type { Trabajador, Empresa, Obra, Cargo } from '../../types/entities';
import type { ApiResponse } from '../../types';

const workerSchema = z.object({
    rut: z.string().min(1, 'El RUT es requerido'),
    nombres: z.string().min(2, 'Suelen ser al menos 2 caracteres'),
    apellido_paterno: z.string().min(2, 'Requerido'),
    apellido_materno: z.string().optional(),
    email: z.string().email('Email inválido').optional().or(z.literal('')),
    telefono: z.string().optional(),
    empresa_id: z.coerce.number().min(1, 'Selecciona una empresa'),
    obra_id: z.coerce.number().min(1, 'Selecciona una obra'),
    cargo_id: z.coerce.number().min(1, 'Selecciona un cargo'),
    categoria_reporte: z.enum(['obra', 'operaciones', 'rotativo']),
    fecha_ingreso: z.string().optional(),
});

type WorkerFormData = z.infer<typeof workerSchema>;

interface WorkerFormProps {
    initialData?: Trabajador | null;
    onSuccess: () => void;
    onCancel: () => void;
}

export const WorkerForm: React.FC<WorkerFormProps> = ({ initialData, onSuccess, onCancel }) => {
    const [loading, setLoading] = useState(false);
    const [initializing, setInitializing] = useState(true);

    const [empresas, setEmpresas] = useState<SelectOption[]>([]);
    const [obras, setObras] = useState<SelectOption[]>([]);
    const [cargos, setCargos] = useState<SelectOption[]>([]);

    const {
        register,
        handleSubmit,
        formState: { errors },
    } = useForm<WorkerFormData>({
        resolver: zodResolver(workerSchema),
        defaultValues: initialData ? {
            rut: initialData.rut,
            nombres: initialData.nombres,
            apellido_paterno: initialData.apellido_paterno,
            apellido_materno: initialData.apellido_materno || '',
            email: initialData.email || '',
            telefono: initialData.telefono || '',
            empresa_id: initialData.empresa_id || 0,
            obra_id: initialData.obra_id || 0,
            cargo_id: initialData.cargo_id || 0,
            categoria_reporte: initialData.categoria_reporte || 'obra',
            fecha_ingreso: initialData.fecha_ingreso ? initialData.fecha_ingreso.split('T')[0] : '',
        } : {},
    });



    useEffect(() => {
        const fetchData = async () => {
            try {
                const [empRes, obraRes, cargoRes] = await Promise.all([
                    api.get<ApiResponse<Empresa[]>>('/empresas?activo=true'),
                    api.get<ApiResponse<Obra[]>>('/obras?activo=true'),
                    api.get<ApiResponse<Cargo[]>>('/cargos?activo=true'),
                ]);

                setEmpresas(empRes.data.data.map(e => ({ value: e.id, label: `${e.razon_social} (${e.rut})` })));
                setObras(obraRes.data.data.map(o => ({ value: o.id, label: o.nombre })));
                setCargos(cargoRes.data.data.map(c => ({ value: c.id, label: c.nombre })));
            } catch (err) {
                toast.error('Error al cargar datos base');
            } finally {
                setInitializing(false);
            }
        };
        fetchData();
    }, []);

    const onSubmit = async (data: WorkerFormData) => {
        setLoading(true);
        try {
            if (initialData) {
                await api.put(`/trabajadores/${initialData.id}`, data);
                toast.success('Trabajador actualizado con éxito');
            } else {
                await api.post('/trabajadores', data);
                toast.success('Trabajador registrado con éxito');
            }
            onSuccess();
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Error al guardar trabajador');
        } finally {
            setLoading(false);
        }
    };

    if (initializing) {
        return (
            <div className="py-20 flex flex-col items-center justify-center text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin text-brand-primary mb-2" />
                <p>Preparando formulario...</p>
            </div>
        );
    }

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                    label="RUT"
                    placeholder="12.345.678-9"
                    error={errors.rut?.message}
                    {...register('rut')}
                />
                <Input
                    label="Nombres"
                    placeholder="Juan Andrés"
                    error={errors.nombres?.message}
                    {...register('nombres')}
                />
                <Input
                    label="Apellido Paterno"
                    placeholder="Pérez"
                    error={errors.apellido_paterno?.message}
                    {...register('apellido_paterno')}
                />
                <Input
                    label="Apellido Materno"
                    placeholder="Cotapos"
                    error={errors.apellido_materno?.message}
                    {...register('apellido_materno')}
                />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                    label="Correo Electrónico"
                    type="email"
                    placeholder="juan.perez@empresa.cl"
                    error={errors.email?.message}
                    {...register('email')}
                />
                <Input
                    label="Teléfono"
                    placeholder="+56 9 1234 5678"
                    error={errors.telefono?.message}
                    {...register('telefono')}
                />
            </div>

            <div className="h-px bg-white/5 my-2" />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Select
                    label="Empresa"
                    options={empresas}
                    error={errors.empresa_id?.message}
                    {...register('empresa_id')}
                />
                <Select
                    label="Obra"
                    options={obras}
                    error={errors.obra_id?.message}
                    {...register('obra_id')}
                />
                <Select
                    label="Cargo"
                    options={cargos}
                    error={errors.cargo_id?.message}
                    {...register('cargo_id')}
                />
                <Select
                    label="Categoría Reporte"
                    options={[
                        { value: 'obra', label: 'Obra' },
                        { value: 'operaciones', label: 'Operaciones' },
                        { value: 'rotativo', label: 'Personal rotativo' }
                    ]}
                    error={errors.categoria_reporte?.message}
                    {...register('categoria_reporte')}
                />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                    label="Fecha Ingreso"
                    type="date"
                    error={errors.fecha_ingreso?.message}
                    {...register('fecha_ingreso')}
                />
            </div>

            <div className="flex justify-end gap-3 pt-4">
                <Button type="button" variant="ghost" onClick={onCancel}>
                    Cancelar
                </Button>
                <Button
                    type="submit"
                    isLoading={loading}
                    leftIcon={<Save className="h-5 w-5" />}
                >
                    {initialData ? 'Guardar Cambios' : 'Registrar Trabajador'}
                </Button>
            </div>
        </form>
    );
};
