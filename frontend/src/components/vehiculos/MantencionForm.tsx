import React from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Save } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import api from '../../services/api';

interface Props {
    vehiculoId: number;
    kmActual?: number;
    onSuccess: () => void;
    onCancel: () => void;
}

export const MantencionForm: React.FC<Props> = ({ vehiculoId, kmActual = 0, onSuccess, onCancel }) => {
    const { register, handleSubmit, formState: { isSubmitting } } = useForm({
        defaultValues: { fecha: '', tipo: '', km_al_realizar: kmActual, descripcion: '', costo: '', taller: '' }
    });

    const onSubmit = async (data: any) => {
        try {
            await api.post(`/vehiculos/${vehiculoId}/mantenciones`, {
                ...data,
                km_al_realizar: Number(data.km_al_realizar),
                costo: data.costo ? Number(data.costo) : null,
            });
            toast.success('Mantención registrada');
            onSuccess();
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Error al guardar mantención');
        }
    };

    const TIPOS_COMUNES = ['Cambio de aceite', 'Frenos', 'Neumáticos', 'Filtros', 'Revisión general', 'Correa distribución'];

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
                <Input label="Fecha" type="date" {...register('fecha', { required: true })} />
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
            <div className="flex justify-end gap-3 mt-4">
                <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
                <Button type="submit" isLoading={isSubmitting} leftIcon={<Save className="h-4 w-4" />}>Guardar</Button>
            </div>
        </form>
    );
};
