import React from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Save } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import api from '../../services/api';

interface Props {
    vehiculoId: number;
    onSuccess: () => void;
    onCancel: () => void;
}

export const RevisionForm: React.FC<Props> = ({ vehiculoId, onSuccess, onCancel }) => {
    const { register, handleSubmit, formState: { isSubmitting } } = useForm({
        defaultValues: { tipo: 'tecnica', fecha: '', fecha_vencimiento: '', resultado: 'aprobado', planta: '', observaciones: '' }
    });

    const onSubmit = async (data: any) => {
        try {
            await api.post(`/vehiculos/${vehiculoId}/revisiones`, data);
            toast.success('Revisión registrada');
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
            <Input label="Planta / Taller" placeholder="Planta de revisión..." {...register('planta')} />
            <div>
                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Observaciones</label>
                <textarea {...register('observaciones')} rows={2}
                    className="w-full px-3 py-2.5 rounded-xl border border-border bg-card text-sm text-brand-dark resize-none focus:outline-none focus:ring-2 focus:ring-brand-primary/30" />
            </div>
            <div className="flex justify-end gap-3 mt-4">
                <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
                <Button type="submit" isLoading={isSubmitting} leftIcon={<Save className="h-4 w-4" />}>Guardar</Button>
            </div>
        </form>
    );
};
