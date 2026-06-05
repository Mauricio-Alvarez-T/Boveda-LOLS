import React, { useEffect, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast } from 'sonner';
import { Loader2, Save } from 'lucide-react';

import { formatRut, validateRut } from '../../utils/rut';

import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { Select } from '../ui/Select';
import { SearchableSelect } from '../ui/SearchableSelect';
import type { SelectOption } from '../ui/Select';
import { useFormDirtyProtection } from '../../hooks/useFormDirtyProtection';
import api from '../../services/api';
import type { Trabajador, Empresa, Obra, Cargo } from '../../types/entities';
import type { ApiResponse } from '../../types';

const workerSchema = z.object({
    rut: z.string().min(1, 'El RUT es requerido').refine(validateRut, 'RUT inválido'),
    nombres: z.string().min(2, 'Suelen ser al menos 2 caracteres'),
    apellido_paterno: z.string().min(2, 'Requerido'),
    apellido_materno: z.string().optional(),
    email: z.string().email('Email inválido').optional().or(z.literal('')),
    telefono: z.string().optional(),
    // Los IDs vienen como 0 cuando no hay selección (default explícito) — así llegan al .min(1) y muestran el mensaje en español.
    empresa_id: z.coerce.number().min(1, 'Selecciona una empresa'),
    obra_id: z.coerce.number().min(1, 'Selecciona una obra'),
    cargo_id: z.coerce.number().min(1, 'Selecciona un cargo'),
    // El <Select> agrega una opción vacía; mensaje custom evita el "Invalid input" genérico.
    categoria_reporte: z.enum(['obra', 'operaciones', 'rotativo'], {
        error: () => ({ message: 'Selecciona una categoría de reporte' }),
    }),
    fecha_ingreso: z.string().optional(),
    es_prueba: z.boolean().optional(),
    licencia_conducir: z.string().optional(),
    licencia_vencimiento: z.string().optional(),
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
        control,
        formState: { errors, isDirty },
    } = useForm<WorkerFormData>({
        resolver: zodResolver(workerSchema) as any,
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
            es_prueba: initialData.es_prueba ?? false,
            licencia_conducir: initialData.licencia_conducir || '',
            licencia_vencimiento: initialData.licencia_vencimiento ? initialData.licencia_vencimiento.split('T')[0] : '',
        } : {
            // Defaults explícitos para trabajador nuevo: garantizan que la validación
            // dispare el mensaje en español del schema (no el genérico "Invalid input").
            rut: '',
            nombres: '',
            apellido_paterno: '',
            apellido_materno: '',
            email: '',
            telefono: '',
            empresa_id: 0,
            obra_id: 0,
            cargo_id: 0,
            categoria_reporte: undefined,
            fecha_ingreso: '',
            es_prueba: false,
            licencia_conducir: '',
            licencia_vencimiento: '',
        },
    });

    useFormDirtyProtection(isDirty);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [empRes, obraRes, cargoRes] = await Promise.all([
                    api.get<ApiResponse<Empresa[]>>('/empresas?activo=true'),
                    // incluir_prueba: WorkerForm es superficie de gestión — debe poder
                    // mostrar/asignar obras de prueba (p. ej. al editar o revertir un
                    // trabajador de prueba, su obra debe aparecer en el selector).
                    api.get<ApiResponse<Obra[]>>('/obras?activo=true&incluir_prueba=true'),
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
                    autoCapitalize="none"
                    placeholder="juan.perez@empresa.cl"
                    error={errors.email?.message}
                    {...register('email')}
                />
                <Input
                    label="Teléfono"
                    type="tel"
                    inputMode="tel"
                    placeholder="+56 9 1234 5678"
                    error={errors.telefono?.message}
                    {...register('telefono')}
                />
            </div>

            <div className="h-px bg-white/5 my-2" />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Controller
                    name="empresa_id"
                    control={control}
                    render={({ field: { onChange, value, ref } }) => (
                        <SearchableSelect
                            ref={ref}
                            label="Empresa"
                            options={empresas}
                            error={errors.empresa_id?.message}
                            placeholder="Buscar empresa..."
                            value={value}
                            onChange={(val) => onChange(val ? Number(val) : 0)}
                        />
                    )}
                />
                <Controller
                    name="obra_id"
                    control={control}
                    render={({ field: { onChange, value, ref } }) => (
                        <SearchableSelect
                            ref={ref}
                            label="Obra"
                            options={obras}
                            error={errors.obra_id?.message}
                            placeholder="Buscar obra..."
                            value={value}
                            onChange={(val) => onChange(val ? Number(val) : 0)}
                        />
                    )}
                />
                <Controller
                    name="cargo_id"
                    control={control}
                    render={({ field: { onChange, value, ref } }) => (
                        <SearchableSelect
                            ref={ref}
                            label="Cargo"
                            options={cargos}
                            error={errors.cargo_id?.message}
                            placeholder="Buscar cargo..."
                            value={value}
                            onChange={(val) => onChange(val ? Number(val) : 0)}
                        />
                    )}
                />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                <Input
                    label="Fecha Ingreso"
                    type="date"
                    error={errors.fecha_ingreso?.message}
                    {...register('fecha_ingreso')}
                />
            </div>

            {/* Licencia de conducir */}
            <div className="h-px bg-white/5 my-1" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                    label="Clase de Licencia"
                    placeholder="Ej: B, A2, D"
                    {...register('licencia_conducir')}
                />
                <Input
                    label="Vencimiento Licencia"
                    type="date"
                    {...register('licencia_vencimiento')}
                />
            </div>

            <div className="py-1">
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
                            🧪 Trabajador de prueba (aislar)
                        </span>
                        <span className="text-xs text-amber-800/80 dark:text-amber-400/80 mt-0.5">
                            Si está marcado, este trabajador queda EXCLUIDO de reportes, dashboard, KPIs, asistencia y
                            consultas operativas. Solo visible en administración para revertirlo. Úsalo para datos de prueba.
                        </span>
                    </div>
                </label>
            </div>

            <div className="sticky -bottom-6 -mx-6 px-6 py-4 bg-background border-t border-border flex justify-end gap-3 mt-8 z-10">
                <Button
                    type="submit"
                    isLoading={loading}
                    leftIcon={<Save className="h-5 w-5" />}
                    className="w-full sm:w-auto"
                >
                    Guardar
                </Button>
            </div>
        </form >
    );
};
