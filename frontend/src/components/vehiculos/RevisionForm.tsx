import React from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Save, Bell } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import api from '../../services/api';
import type { VehiculoRevision } from '../../types/entities';
import { useAuth } from '../../context/AuthContext';
import { puedeConfigurarAlertasVehiculos } from '../../utils/alertasVehiculos';

interface Props {
    vehiculoId: number;
    initialData?: VehiculoRevision | null;
    onSuccess: () => void;
    onCancel: () => void;
}

export const RevisionForm: React.FC<Props> = ({ vehiculoId, initialData, onSuccess, onCancel }) => {
    const isEdit = !!initialData;
    const { user } = useAuth();
    // Solo usuarios de la lista blanca ven/editan los avisos por email/WhatsApp.
    const canConfigurarAlertas = puedeConfigurarAlertasVehiculos(user);

    const { register, handleSubmit, watch, setValue, formState: { isSubmitting } } = useForm({
        defaultValues: isEdit ? {
            tipo: initialData.tipo,
            fecha: String(initialData.fecha).split('T')[0],
            fecha_vencimiento: String(initialData.fecha_vencimiento).split('T')[0],
            resultado: initialData.resultado,
            planta: (initialData as any).planta || '',
            direccion: (initialData as any).direccion || '',
            observaciones: (initialData as any).observaciones || '',
            dias_alerta: (initialData as any).dias_alerta ?? 30,
            email_alerta: (initialData as any).email_alerta || '',
            tel_alerta: (initialData as any).tel_alerta || '',
            periodicidad_anios: (initialData as any).periodicidad_anios ?? null,
        } : {
            tipo: 'tecnica', fecha: '', fecha_vencimiento: '',
            resultado: 'aprobado', planta: '', direccion: '', observaciones: '',
            dias_alerta: 30, email_alerta: '', tel_alerta: '',
            periodicidad_anios: null,
        }
    });

    const fecha = watch('fecha');
    const periodicidad = watch('periodicidad_anios');

    /** Aplica la periodicidad (1/2/3 años) y recalcula la fecha de vencimiento desde la fecha de revisión. */
    const aplicarPeriodicidad = (anios: number) => {
        setValue('periodicidad_anios', anios as any, { shouldDirty: true });
        if (fecha) {
            const d = new Date(`${fecha}T00:00:00`);
            d.setFullYear(d.getFullYear() + anios);
            const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            setValue('fecha_vencimiento', iso, { shouldDirty: true, shouldValidate: true });
        } else {
            toast.info('Primero ingresa la fecha de revisión para calcular el vencimiento.');
        }
    };

    const onSubmit = async (data: any) => {
        try {
            const payload: any = {
                ...data,
                periodicidad_anios: data.periodicidad_anios ? Number(data.periodicidad_anios) : null,
            };
            if (canConfigurarAlertas) {
                payload.dias_alerta = data.dias_alerta ? Number(data.dias_alerta) : null;
                payload.email_alerta = data.email_alerta || null;
                payload.tel_alerta = data.tel_alerta || null;
            } else {
                // Trabajador sin permiso: no enviar estos campos para NO sobreescribir
                // la configuración de alerta existente (el aviso por email se mantiene).
                delete payload.dias_alerta;
                delete payload.email_alerta;
                delete payload.tel_alerta;
            }
            if (isEdit) {
                await api.put(`/vehiculos/${vehiculoId}/revisiones/${initialData.id}`, payload);
                toast.success('Revisión actualizada');
            } else {
                await api.post(`/vehiculos/${vehiculoId}/revisiones`, payload);
                toast.success('Revisión registrada');
            }
            onSuccess();
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Error al guardar revisión');
        }
    };

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Tipo</label>
                    <select {...register('tipo')}
                        className="w-full px-3 py-2.5 rounded-xl border border-border bg-card text-sm text-brand-dark focus:outline-none focus:ring-2 focus:ring-brand-primary/30">
                        <option value="tecnica">Revisión Técnica</option>
                        <option value="gases">Control de Gases</option>
                        <option value="mecanica">Revisión Mecánica</option>
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Resultado</label>
                    <select {...register('resultado')}
                        className="w-full px-3 py-2.5 rounded-xl border border-border bg-card text-sm text-brand-dark focus:outline-none focus:ring-2 focus:ring-brand-primary/30">
                        <option value="aprobado">Aprobado</option>
                        <option value="rechazado">Rechazado</option>
                        <option value="pendiente">Pendiente</option>
                    </select>
                </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
                <Input label="Fecha revisión" type="date" {...register('fecha', { required: true })} />
                <Input label="Fecha vencimiento" type="date" {...register('fecha_vencimiento', { required: true })} />
            </div>
            <Input label="Planta / Taller" placeholder="Nombre de la planta..." {...register('planta')} />
            <Input label="Dirección" placeholder="Ej: Caletera General Velásquez N°7319" {...register('direccion')} />
            <div>
                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Observaciones</label>
                <textarea {...register('observaciones')} rows={2}
                    className="w-full px-3 py-2.5 rounded-xl border border-border bg-card text-sm text-brand-dark resize-none focus:outline-none focus:ring-2 focus:ring-brand-primary/30" />
            </div>

            <div className="border-t border-border pt-4">
                <div className="flex items-center gap-2 mb-3">
                    <Bell className="h-3.5 w-3.5 text-brand-primary" />
                    <span className="text-xs font-black text-brand-dark/60 uppercase tracking-widest">Configurar Alerta de Vencimiento</span>
                </div>

                {/* Periodicidad: calcula automáticamente la fecha de vencimiento (depende si es nuevo o usado) */}
                <input type="hidden" {...register('periodicidad_anios')} />
                <div className="mb-4">
                    <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
                        Próxima revisión en
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                        {[1, 2, 3].map((n) => (
                            <button
                                key={n}
                                type="button"
                                onClick={() => aplicarPeriodicidad(n)}
                                className={`px-3 py-2.5 rounded-xl border text-sm font-bold transition-colors ${
                                    Number(periodicidad) === n
                                        ? 'border-brand-primary bg-brand-primary text-white shadow-sm shadow-brand-primary/30'
                                        : 'border-border bg-card text-brand-dark hover:border-brand-primary/50'
                                }`}
                            >
                                {n} {n === 1 ? 'año' : 'años'}
                            </button>
                        ))}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1.5 leading-snug">
                        Calcula el vencimiento desde la fecha de revisión. Vehículos nuevos suelen tener mayor
                        periodicidad que los usados.
                    </p>
                </div>

                {canConfigurarAlertas && (
                    <div className="grid grid-cols-3 gap-3">
                        <div>
                            <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Días antes</label>
                            <input type="number" {...register('dias_alerta')} min={1} max={365}
                                className="w-full px-3 py-2.5 rounded-xl border border-border bg-card text-sm text-brand-dark focus:outline-none focus:ring-2 focus:ring-brand-primary/30" />
                        </div>
                        <Input label="Email alerta" placeholder="admin@empresa.cl" {...register('email_alerta')} />
                        <Input label="WhatsApp" placeholder="+56 9 XXXX XXXX" {...register('tel_alerta')} />
                    </div>
                )}
            </div>

            <div className="flex justify-end gap-3 pt-2">
                <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
                <Button type="submit" isLoading={isSubmitting} leftIcon={<Save className="h-4 w-4" />}>
                    Guardar
                </Button>
            </div>
        </form>
    );
};
