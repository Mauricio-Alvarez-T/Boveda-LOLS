import React from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Bell } from 'lucide-react';
import { Input } from '../ui/Input';
import api from '../../services/api';
import type { VehiculoPermiso } from '../../types/entities';
import { useAuth } from '../../context/AuthContext';
import { puedeConfigurarAlertasVehiculos, validarDiasAlerta } from '../../utils/alertasVehiculos';
import { FieldError } from '../ui/FieldError';

interface Props {
    vehiculoId: number;
    initialData?: VehiculoPermiso | null;
    onSuccess: () => void;
    onCancel: () => void;
}

export const PermisoCirculacionForm: React.FC<Props> = ({ vehiculoId, initialData, onSuccess, onCancel: _onCancel }) => {
    const isEdit = !!initialData;
    const { user } = useAuth();
    const canConfigurarAlertas = puedeConfigurarAlertasVehiculos(user);

    const { register, handleSubmit, formState: { errors } } = useForm({
        defaultValues: isEdit ? {
            numero_permiso: (initialData as any).numero_permiso || '',
            fecha_emision: initialData.fecha_emision ? String(initialData.fecha_emision).split('T')[0] : '',
            fecha_vencimiento: String(initialData.fecha_vencimiento).split('T')[0],
            monto: (initialData as any).monto ?? '',
            municipalidad: (initialData as any).municipalidad || '',
            observaciones: (initialData as any).observaciones || '',
            dias_alerta: (initialData as any).dias_alerta ?? 30,
            email_alerta: (initialData as any).email_alerta || '',
        } : {
            numero_permiso: '', fecha_emision: '', fecha_vencimiento: '', monto: '',
            municipalidad: '', observaciones: '',
            dias_alerta: 30, email_alerta: '',
        }
    });

    const onSubmit = async (data: any) => {
        try {
            const payload: any = {
                ...data,
                monto: data.monto ? Number(data.monto) : null,
            };
            if (canConfigurarAlertas) {
                payload.dias_alerta = data.dias_alerta ? Number(data.dias_alerta) : null;
                payload.email_alerta = data.email_alerta || null;
            } else {
                delete payload.dias_alerta;
                delete payload.email_alerta;
            }
            if (isEdit) {
                await api.put(`/vehiculos/${vehiculoId}/permisos/${initialData.id}`, payload);
                toast.success('Permiso de circulación actualizado');
            } else {
                await api.post(`/vehiculos/${vehiculoId}/permisos`, payload);
                toast.success('Permiso de circulación agregado');
            }
            onSuccess();
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Error al guardar permiso de circulación');
        }
    };

    return (
        <form id="permiso-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <div className="grid grid-cols-2 gap-4">
                <Input label="N° Permiso" placeholder="Opcional" {...register('numero_permiso')} />
                <Input label="Monto ($)" type="number" {...register('monto')} />
            </div>
            <div className="grid grid-cols-2 gap-4">
                <Input label="Fecha de pago / emisión" type="date" {...register('fecha_emision')} />
                <Input label="Fecha vencimiento" type="date" {...register('fecha_vencimiento', { required: true })} />
            </div>
            <Input label="Municipalidad" placeholder="Comuna donde se pagó" {...register('municipalidad')} />
            <div>
                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Observaciones</label>
                <textarea {...register('observaciones')} rows={2}
                    className="w-full px-3 py-2.5 rounded-xl border border-border bg-card text-sm text-brand-dark resize-none focus:outline-none focus:ring-2 focus:ring-brand-primary/30" />
            </div>

            {canConfigurarAlertas && (
                <div className="border-t border-border pt-4">
                    <div className="flex items-center gap-2 mb-3">
                        <Bell className="h-3.5 w-3.5 text-brand-primary" />
                        <span className="text-xs font-black text-brand-dark/60 uppercase tracking-widest">Configurar Alerta de Vencimiento</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Días antes</label>
                            <input type="number" {...register('dias_alerta', { validate: validarDiasAlerta })}
                                className="w-full px-3 py-2.5 rounded-xl border border-border bg-card text-sm text-brand-dark focus:outline-none focus:ring-2 focus:ring-brand-primary/30" />
                            <FieldError message={errors.dias_alerta?.message as string | undefined} className="mt-1" />
                        </div>
                        <Input label="Email alerta" placeholder="admin@empresa.cl" {...register('email_alerta')} />
                    </div>
                </div>
            )}

            {/* Botones Cancelar/Guardar viven en el header del Modal (form="permiso-form"). */}
        </form>
    );
};
