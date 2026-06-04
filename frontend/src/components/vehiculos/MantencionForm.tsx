import React from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Save, Bell } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import api from '../../services/api';
import type { VehiculoMantencion } from '../../types/entities';
import { useAuth } from '../../context/AuthContext';

interface Props {
    vehiculoId: number;
    kmActual?: number;
    initialData?: VehiculoMantencion | null;
    onSuccess: () => void;
    onCancel: () => void;
}

const TIPOS_COMUNES = ['Cambio de aceite', 'Frenos', 'Neumáticos', 'Filtros', 'Revisión general', 'Correa distribución', 'Suspensión', 'Transmisión'];

export const MantencionForm: React.FC<Props> = ({ vehiculoId, kmActual = 0, initialData, onSuccess, onCancel }) => {
    const isEdit = !!initialData;
    const { user, hasPermission } = useAuth();
    const canConfigurarAlertas = user?.rol_id === 1 || hasPermission('vehiculos.configurar_alertas');

    const { register, handleSubmit, formState: { isSubmitting } } = useForm({
        defaultValues: isEdit ? {
            fecha: String(initialData.fecha).split('T')[0],
            tipo: initialData.tipo,
            km_al_realizar: initialData.km_al_realizar,
            descripcion: initialData.descripcion || '',
            costo: (initialData as any).costo ?? '',
            taller: (initialData as any).taller || '',
            fecha_proxima: (initialData as any).fecha_proxima ? String((initialData as any).fecha_proxima).split('T')[0] : '',
            dias_alerta: (initialData as any).dias_alerta ?? 30,
            email_alerta: (initialData as any).email_alerta || '',
            tel_alerta: (initialData as any).tel_alerta || '',
        } : {
            fecha: '', tipo: '', km_al_realizar: kmActual,
            descripcion: '', costo: '', taller: '', fecha_proxima: '',
            dias_alerta: 30, email_alerta: '', tel_alerta: '',
        }
    });

    const onSubmit = async (data: any) => {
        try {
            const payload: any = {
                ...data,
                km_al_realizar: Number(data.km_al_realizar),
                costo: data.costo ? Number(data.costo) : null,
                fecha_proxima: data.fecha_proxima || null,
            };
            if (canConfigurarAlertas) {
                payload.dias_alerta = data.dias_alerta ? Number(data.dias_alerta) : null;
                payload.email_alerta = data.email_alerta || null;
                payload.tel_alerta = data.tel_alerta || null;
            } else {
                // No sobreescribir la config de alerta existente.
                delete payload.dias_alerta;
                delete payload.email_alerta;
                delete payload.tel_alerta;
            }
            if (isEdit) {
                await api.put(`/vehiculos/${vehiculoId}/mantenciones/${initialData.id}`, payload);
                toast.success('Mantención actualizada');
            } else {
                await api.post(`/vehiculos/${vehiculoId}/mantenciones`, payload);
                toast.success('Mantención registrada');
            }
            onSuccess();
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Error al guardar mantención');
        }
    };

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
                <Input label="Fecha realizada" type="date" {...register('fecha', { required: true })} />
                <Input label="KM al realizar" type="number" {...register('km_al_realizar', { required: true })} />
            </div>
            <div>
                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Tipo de mantención</label>
                <input list="tipos-mantencion" {...register('tipo', { required: true })}
                    placeholder="Ej: Cambio de aceite"
                    className="w-full px-3 py-2.5 rounded-xl border border-border bg-card text-sm text-brand-dark focus:outline-none focus:ring-2 focus:ring-brand-primary/30" />
                <datalist id="tipos-mantencion">
                    {TIPOS_COMUNES.map(t => <option key={t} value={t} />)}
                </datalist>
            </div>
            <div className="grid grid-cols-2 gap-4">
                <Input label="Taller" placeholder="Nombre del taller..." {...register('taller')} />
                <Input label="Costo ($)" type="number" {...register('costo')} />
            </div>
            <div>
                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Descripción</label>
                <textarea {...register('descripcion')} rows={2}
                    className="w-full px-3 py-2.5 rounded-xl border border-border bg-card text-sm text-brand-dark resize-none focus:outline-none focus:ring-2 focus:ring-brand-primary/30" />
            </div>

            <div className="border-t border-border pt-4">
                <div className="flex items-center gap-2 mb-3">
                    <Bell className="h-3.5 w-3.5 text-brand-primary" />
                    <span className="text-xs font-black text-brand-dark/60 uppercase tracking-widest">Programar Próxima Mantención</span>
                </div>
                <Input label="Fecha próxima mantención" type="date" {...register('fecha_proxima')} />
                {canConfigurarAlertas && (
                    <div className="grid grid-cols-3 gap-3 mt-3">
                        <div>
                            <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Avisar X días antes</label>
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
