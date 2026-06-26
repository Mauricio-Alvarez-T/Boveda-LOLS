import React, { useEffect, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast } from 'sonner';
import { CalendarCheck } from 'lucide-react';
import { Input } from '../ui/Input';
import { CurrencyInput } from '../ui/CurrencyInput';
import api from '../../services/api';
import type { Vehiculo, Conductor, EmpresaVehiculo } from '../../types/entities';
import type { ApiResponse } from '../../types';
import { useFormDirtyProtection } from '../../hooks/useFormDirtyProtection';
import { mesRevisionPorPatente } from '../../utils/revisionTecnica';

const schema = z.object({
    // Patente: 4 letras + 2 números (formato chileno actual). Se ignoran separadores
    // (· - espacio) al validar: "ABCD12", "ABCD-12" y "ABCD·12" son válidos.
    patente: z.string()
        .trim()
        .min(1, 'La patente es obligatoria')
        .refine(
            (s) => /^[A-Z]{4}[0-9]{2}$/.test(s.replace(/[^A-Za-z0-9]/g, '').toUpperCase()),
            'La patente debe tener 4 letras y 2 números (ej: ABCD·12)'
        ),
    marca:   z.string().trim().min(3, 'La marca debe tener al menos 3 caracteres'),
    modelo:  z.string().trim().min(2, 'El modelo debe tener al menos 2 caracteres'),
    anio:    z.coerce.number()
        .int('El año debe ser un número entero')
        .min(1990, 'El año debe ser 1990 o posterior')
        .max(new Date().getFullYear() + 1, 'El año no puede ser futuro'),
    tipo:    z.enum(['camioneta','camion','auto','furgon','bus','otro']),
    empresa_id: z.string().optional(),      // id de empresa de flota (select) o '' (sin asignar)
    conductor_nombre: z.string().optional(),// nombre escrito/elegido; el backend lo resuelve o crea en el catálogo
    kilometraje_actual: z.coerce.number()
        .min(0, 'Los kilómetros no pueden ser negativos')
        .optional(),
    color:   z.string().trim().min(3, 'El color debe tener al menos 3 caracteres'),
    valor:   z.coerce.number().min(0, 'El valor no puede ser negativo').optional(),
    precio_compra: z.coerce.number().min(0, 'El precio de compra no puede ser negativo').optional(),
    es_leasing: z.boolean().optional(),
    observaciones: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

interface Props {
    initialData?: Vehiculo | null;
    /** Empresa preseleccionada al crear desde dentro de una empresa (Nivel 2). */
    defaultEmpresaId?: number | null;
    onSuccess: () => void;
    onCancel: () => void;
}

export const VehiculoForm: React.FC<Props> = ({ initialData, defaultEmpresaId, onSuccess, onCancel }) => {
    const { register, handleSubmit, watch, control, formState: { errors, isDirty } } = useForm<FormData>({
        resolver: zodResolver(schema) as any,
        defaultValues: initialData ? {
            patente: initialData.patente,
            marca:   initialData.marca,
            modelo:  initialData.modelo,
            anio:    initialData.anio,
            tipo:    initialData.tipo,
            empresa_id: initialData.empresa_id != null ? String(initialData.empresa_id) : '',
            conductor_nombre: initialData.conductor_nombre || '',
            kilometraje_actual: initialData.kilometraje_actual,
            color:   initialData.color || '',
            valor:   initialData.valor != null ? Number(initialData.valor) : 0,
            precio_compra: initialData.precio_compra != null ? Number(initialData.precio_compra) : 0,
            es_leasing: initialData.es_leasing ?? false,
            observaciones: initialData.observaciones || '',
        } : {
            tipo: 'camioneta',
            empresa_id: defaultEmpresaId != null ? String(defaultEmpresaId) : '',
            conductor_nombre: '',
            kilometraje_actual: 0,
            valor: 0,
            precio_compra: 0,
            es_leasing: false,
        },
    });

    useFormDirtyProtection(isDirty);

    // Catálogo de conductores (se administra en Configuración → Conductores)
    const [conductores, setConductores] = useState<Conductor[]>([]);
    useEffect(() => {
        api.get<ApiResponse<Conductor[]>>('/conductores?activo=true')
            .then(res => setConductores(res.data.data))
            .catch(() => { /* si falla la carga, el select queda vacío; no bloquea el alta */ });
    }, []);

    // Catálogo de empresas de flota (paramétrico; se administra desde la página Vehículos)
    const [empresas, setEmpresas] = useState<EmpresaVehiculo[]>([]);
    useEffect(() => {
        api.get<ApiResponse<EmpresaVehiculo[]>>('/empresas-vehiculos?activo=true')
            .then(res => setEmpresas(res.data.data))
            .catch(() => { /* si falla, el select queda solo con "Sin asignar"; no bloquea el alta */ });
    }, []);

    // Mes de revisión técnica según el último dígito de la patente (calendario MTT)
    const patente = watch('patente');
    const mesRevision = mesRevisionPorPatente(patente);

    const onSubmit = async (data: FormData) => {
        const payload = {
            ...data,
            empresa_id: data.empresa_id ? Number(data.empresa_id) : null,
            conductor_nombre: data.conductor_nombre?.trim() || null, // backend resuelve/crea en el catálogo
        };
        try {
            if (initialData) {
                await api.put(`/vehiculos/${initialData.id}`, payload);
                toast.success('Vehículo actualizado');
            } else {
                await api.post('/vehiculos', payload);
                toast.success('Vehículo registrado');
            }
            onSuccess();
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Error al guardar vehículo');
        }
    };

    return (
        <form id="vehiculo-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input label="Patente" placeholder="Ej: ABCD·12" {...register('patente')}
                    error={errors.patente?.message} />
                <div>
                    <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Tipo</label>
                    <select {...register('tipo')}
                        className="w-full px-3 h-11 rounded-xl border border-border bg-card text-base text-brand-dark focus:outline-none focus:ring-2 focus:ring-brand-primary/30">
                        <option value="camioneta">Camioneta</option>
                        <option value="camion">Camión</option>
                        <option value="auto">Auto</option>
                        <option value="furgon">Furgón</option>
                        <option value="bus">Bus</option>
                        <option value="otro">Otro</option>
                    </select>
                </div>
            </div>

            {/* Calendario de revisión técnica según el último dígito de la patente */}
            {mesRevision && (
                <div className="flex items-start gap-2.5 rounded-xl border border-brand-primary/30 bg-brand-primary/5 px-3.5 py-2.5">
                    <CalendarCheck className="h-4 w-4 text-brand-primary mt-0.5 shrink-0" />
                    <p className="text-sm text-brand-dark leading-snug">
                        Según el último dígito de la patente, la <b>revisión técnica</b> de este vehículo
                        corresponde al mes de <b className="text-brand-primary">{mesRevision}</b>.
                        <span className="block text-xs text-muted-foreground mt-0.5">
                            Calendario MTT referencial para vehículos particulares.
                        </span>
                    </p>
                </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                    <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Empresa</label>
                    <select {...register('empresa_id')}
                        className="w-full px-3 h-11 rounded-xl border border-border bg-card text-base text-brand-dark focus:outline-none focus:ring-2 focus:ring-brand-primary/30">
                        <option value="">Sin asignar</option>
                        {empresas.map(e => (
                            <option key={e.id} value={e.id}>{e.nombre}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Conductor asignado</label>
                    <input {...register('conductor_nombre')} list="conductores-list"
                        placeholder="Escribe o elige un nombre"
                        autoComplete="off"
                        className="w-full px-3 h-11 rounded-xl border border-border bg-card text-base text-brand-dark focus:outline-none focus:ring-2 focus:ring-brand-primary/30" />
                    <datalist id="conductores-list">
                        {conductores.map(c => (
                            <option key={c.id} value={c.nombre} />
                        ))}
                    </datalist>
                    <p className="text-micro text-muted-foreground/70 mt-1">Si el nombre es nuevo, se guarda solo en el catálogo de conductores.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input label="Marca" placeholder="Toyota" {...register('marca')} error={errors.marca?.message} />
                <Input label="Modelo" placeholder="Hilux" {...register('modelo')} error={errors.modelo?.message} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input label="Año" type="number" placeholder="2022" {...register('anio')} error={errors.anio?.message} />
                <Input label="Color" placeholder="Blanco" {...register('color')} error={errors.color?.message} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input label="Kilómetros actuales" type="number" {...register('kilometraje_actual')} error={errors.kilometraje_actual?.message} />
                <Controller
                    name="precio_compra"
                    control={control}
                    render={({ field }) => (
                        <CurrencyInput
                            label="Precio de compra"
                            placeholder="$0"
                            value={Number(field.value) || 0}
                            onChange={field.onChange}
                            onBlur={field.onBlur}
                            error={errors.precio_compra?.message}
                        />
                    )}
                />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Controller
                    name="valor"
                    control={control}
                    render={({ field }) => (
                        <CurrencyInput
                            label="Valor del vehículo"
                            placeholder="$0"
                            value={Number(field.value) || 0}
                            onChange={field.onChange}
                            onBlur={field.onBlur}
                            error={errors.valor?.message}
                        />
                    )}
                />
            </div>

            {/* Leasing: flag sí/no con explicación de qué significa en el contexto de la app. */}
            <label className="flex items-start gap-3 cursor-pointer rounded-xl border border-border bg-card px-3.5 py-3 hover:border-brand-primary/40 transition-colors">
                <input
                    type="checkbox"
                    {...register('es_leasing')}
                    className="mt-0.5 h-5 w-5 shrink-0 rounded border-border text-brand-primary focus:ring-brand-primary cursor-pointer"
                />
                <span className="flex flex-col">
                    <span className="text-sm font-semibold text-brand-dark">¿Es leasing?</span>
                    <span className="text-xs text-muted-foreground mt-0.5 leading-snug">
                        En Chile, un leasing de vehículos es un contrato de arriendo financiero con una institución
                        (banco o automotora): pagas cuotas mensuales por el uso del auto y la entidad sigue siendo
                        la dueña legal hasta el final del contrato. Al terminar, decides si pagas una cuota final
                        (opción de compra) para quedártelo, lo devuelves o lo renuevas.
                    </span>
                </span>
            </label>

            <div>
                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Observaciones</label>
                <textarea {...register('observaciones')} rows={2}
                    className="w-full px-3 py-3 rounded-xl border border-border bg-card text-base text-brand-dark resize-none focus:outline-none focus:ring-2 focus:ring-brand-primary/30" />
            </div>
            {/* Botones Cancelar/Guardar viven en el header del Modal (headerAction). */}
        </form>
    );
};
