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

export const SeguroForm: React.FC<Props> = ({ vehiculoId, onSuccess, onCancel }) => {
    const { register, handleSubmit, formState: { isSubmitting } } = useForm({
        defaultValues: { tipo: 'SOAP', compania: '', numero_poliza: '', fecha_inicio: '', fecha_vencimiento: '', monto: '', observaciones: '' }
    });

    const onSubmit = async (data: any) => {
        try {
            await api.post(`/vehiculos/${vehiculoId}/seguros`, {
                ...data, monto: data.monto ? Number(data.monto) : null,
            });
            toast.success('Seguro agregado');
            onSuccess();
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Error al guardar seguro');
        }
    };

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Tipo</label>
                    <select {...register('tipo')}
                        className="w-full px-3 py-2.5 rounded-xl border border-border bg-card text-sm text-brand-dark focus:outline-none focus:ring-2 focus:ring-brand-primary/30">
                        <option value="SOAP">SOAP</option>
                        <option value="complementario">Complementario</option>
                        <option value="otro">Otro</option>
                    </select>
                </div>
                <Input label="Compañía" placeholder="MAPFRE, HDI..." {...register('compania')} />
            </div>
            <div className="grid grid-cols-2 gap-4">
                <Input label="N° Póliza" placeholder="POL-123456" {...register('numero_poliza')} />
                <Input label="Monto ($)" type="number" {...register('monto')} />
            </div>
            <div className="grid grid-cols-2 gap-4">
                <Input label="Fecha inicio" type="date" {...register('fecha_inicio', { required: true })} />
                <Input label="Fecha vencimiento" type="date" {...register('fecha_vencimiento', { required: true })} />
            </div>
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
