import React from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast } from 'sonner';
import { Truck, TrendingUp, TrendingDown } from 'lucide-react';
import { Input } from '../ui/Input';
import { CurrencyInput } from '../ui/CurrencyInput';
import api from '../../services/api';
import type { Vehiculo } from '../../types/entities';
import { formatCLP } from '../../utils/currency';
import { cn } from '../../utils/cn';
import { useFormDirtyProtection } from '../../hooks/useFormDirtyProtection';

const schema = z.object({
    fecha_venta: z.string().min(1, 'Indica la fecha de venta'),
    precio_compra: z.coerce.number().min(0, 'El precio de compra no puede ser negativo').optional(),
    precio_venta: z.coerce.number().min(0, 'El precio de venta no puede ser negativo'),
    comprador: z.string().optional(),
    observaciones: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

interface Props {
    vehiculo: Vehiculo;
    onSuccess: () => void;
    /** Lo pasa la página por simetría con los otros forms; el Cancelar real vive en el header del Modal. */
    onCancel?: () => void;
}

const hoy = () => new Date().toISOString().slice(0, 10);

/**
 * Formulario para "vender" (dar de baja por venta) un vehículo. Registra la venta
 * y deja el vehículo fuera de la flota activa. El precio de compra se precarga
 * desde el vehículo (editable) y mostramos en vivo la diferencia compra-venta.
 * Los botones Cancelar/Guardar viven en el header del Modal (headerAction).
 */
export const VenderVehiculoForm: React.FC<Props> = ({ vehiculo, onSuccess }) => {
    const { register, handleSubmit, control, watch, formState: { errors, isDirty } } = useForm<FormData>({
        resolver: zodResolver(schema) as any,
        defaultValues: {
            fecha_venta: hoy(),
            precio_compra: vehiculo.precio_compra != null ? Number(vehiculo.precio_compra) : 0,
            precio_venta: 0,
            comprador: '',
            observaciones: '',
        },
    });

    useFormDirtyProtection(isDirty);

    const precioCompra = Number(watch('precio_compra')) || 0;
    const precioVenta = Number(watch('precio_venta')) || 0;
    const diferencia = precioVenta - precioCompra;
    const ganancia = diferencia >= 0;

    const onSubmit = async (data: FormData) => {
        try {
            await api.post(`/vehiculos/${vehiculo.id}/vender`, {
                fecha_venta: data.fecha_venta,
                precio_compra: data.precio_compra ?? 0,
                precio_venta: data.precio_venta,
                comprador: data.comprador?.trim() || null,
                observaciones: data.observaciones?.trim() || null,
            });
            toast.success('Venta registrada');
            onSuccess();
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Error al registrar la venta');
        }
    };

    return (
        <form id="vender-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* Resumen del vehículo que se vende */}
            <div className="flex items-start gap-2.5 rounded-xl border border-border bg-muted/40 px-3.5 py-2.5">
                <Truck className="h-4 w-4 text-brand-primary mt-0.5 shrink-0" />
                <div className="leading-tight min-w-0">
                    <p className="text-sm font-black text-brand-dark break-words">
                        {vehiculo.patente} · {vehiculo.marca} {vehiculo.modelo} {vehiculo.anio}
                    </p>
                    <p className="text-xs text-muted-foreground">
                        Al registrar la venta, el vehículo sale de la flota activa.
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input label="Fecha de venta" type="date" {...register('fecha_venta')} error={errors.fecha_venta?.message} />
                <Input label="Comprador (opcional)" placeholder="Nombre o empresa" {...register('comprador')} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                <Controller
                    name="precio_venta"
                    control={control}
                    render={({ field }) => (
                        <CurrencyInput
                            label="Precio de venta"
                            placeholder="$0"
                            value={Number(field.value) || 0}
                            onChange={field.onChange}
                            onBlur={field.onBlur}
                            error={errors.precio_venta?.message}
                        />
                    )}
                />
            </div>

            {/* Diferencia en vivo (ganancia / pérdida) */}
            <div className={cn(
                'flex items-center justify-between gap-3 rounded-xl border px-3.5 py-3',
                ganancia
                    ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-800/60 dark:bg-emerald-950/20'
                    : 'border-red-200 bg-red-50 dark:border-red-800/60 dark:bg-red-950/20'
            )}>
                <span className="flex items-center gap-2 text-sm font-bold text-brand-dark">
                    {ganancia
                        ? <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                        : <TrendingDown className="h-4 w-4 text-red-600 dark:text-red-400" />}
                    {ganancia ? 'Ganancia' : 'Pérdida'}
                </span>
                <span className={cn(
                    'text-base font-black',
                    ganancia ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'
                )}>
                    {ganancia ? '+' : '−'}{formatCLP(Math.abs(diferencia))}
                </span>
            </div>

            <div>
                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Observaciones (opcional)</label>
                <textarea {...register('observaciones')} rows={2}
                    className="w-full px-3 py-3 rounded-xl border border-border bg-card text-base text-brand-dark resize-none focus:outline-none focus:ring-2 focus:ring-brand-primary/30" />
            </div>
            {/* Botones Cancelar/Guardar viven en el header del Modal (headerAction). */}
        </form>
    );
};
