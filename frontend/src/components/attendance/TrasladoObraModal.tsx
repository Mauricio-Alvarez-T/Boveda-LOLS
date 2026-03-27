import React, { useState } from 'react';
import { Building2, ArrowRightLeft, MessageSquare, Save } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Select } from '../ui/Select';
import { Trabajador, Obra } from '../../types/entities';
import api from '../../services/api';
import { toast } from 'sonner';

interface TrasladoObraModalProps {
    isOpen: boolean;
    onClose: () => void;
    worker: Trabajador | null;
    obraActualId: number | null;
    obraActualNombre: string;
    obras: Obra[];
    fecha: string;
    onSuccess: (obraDestinoNombre: string) => void;
}

export const TrasladoObraModal: React.FC<TrasladoObraModalProps> = ({
    isOpen,
    onClose,
    worker,
    obraActualId,
    obraActualNombre,
    obras,
    fecha,
    onSuccess
}) => {
    const [selectedObraId, setSelectedObraId] = useState<string>('');
    const [comentario, setComentario] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    const obraOptions = obras
        .filter(o => o.id !== obraActualId && o.activa)
        .map(o => ({
            value: o.id,
            label: o.nombre
        }));

    const handleSave = async () => {
        if (!worker || !selectedObraId) {
            toast.error('Debe seleccionar una obra de destino');
            return;
        }

        setIsSaving(true);
        try {
            const response = await api.post('/asistencias/traslado-obra', {
                trabajador_id: worker.id,
                obra_actual_id: obraActualId,
                obra_destino_id: parseInt(selectedObraId),
                fecha,
                comentario
            });

            toast.success('Traslado realizado con éxito');
            onSuccess(response.data.data.obra_destino_nombre);
            handleClose();
        } catch (error: any) {
            console.error('Error en traslado:', error);
            toast.error(error.response?.data?.error || 'Error al realizar el traslado');
        } finally {
            setIsSaving(false);
        }
    };

    const handleClose = () => {
        setSelectedObraId('');
        setComentario('');
        onClose();
    };

    if (!worker) return null;

    return (
        <Modal
            isOpen={isOpen}
            onClose={handleClose}
            title={
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-brand-primary/10 rounded-lg">
                        <ArrowRightLeft className="h-5 w-5 text-brand-primary" />
                    </div>
                    <div className="text-left">
                        <h3 className="text-lg font-bold text-brand-dark leading-tight">Traslado de Obra</h3>
                        <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">
                            {worker.apellido_paterno} {worker.nombres}
                        </p>
                    </div>
                </div>
            }
            footer={
                <div className="flex gap-3 w-full">
                    <Button
                        variant="ghost"
                        onClick={handleClose}
                        disabled={isSaving}
                        className="flex-1 md:flex-none"
                    >
                        Cancelar
                    </Button>
                    <Button
                        variant="primary"
                        onClick={handleSave}
                        isLoading={isSaving}
                        leftIcon={<Save className="h-4 w-4" />}
                        className="flex-1 md:min-w-[140px]"
                    >
                        Completar Traslado
                    </Button>
                </div>
            }
        >
            <div className="space-y-6">
                {/* Obra Origen (Read only) */}
                <div className="p-4 bg-brand-primary/5 rounded-2xl border border-brand-primary/10 relative overflow-hidden group">
                     {/* Decorative background element */}
                    <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:scale-110 transition-transform duration-500">
                        <Building2 size={120} />
                    </div>
                    
                    <label className="text-[10px] font-bold text-brand-primary uppercase tracking-widest mb-2 block">
                        Ubicación Actual
                    </label>
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-white shadow-sm flex items-center justify-center border border-brand-primary/20">
                            <Building2 className="h-5 w-5 text-brand-primary" />
                        </div>
                        <div className="text-left">
                            <p className="text-base font-bold text-brand-dark">{obraActualNombre}</p>
                            <p className="text-[11px] text-muted-foreground">Obra de origen para el día {fecha}</p>
                        </div>
                    </div>
                </div>

                {/* Arrow Divider */}
                <div className="flex justify-center -my-3 relative z-10">
                    <div className="h-8 w-8 rounded-full bg-white border-2 border-brand-primary/20 flex items-center justify-center shadow-lg">
                        <ArrowRightLeft className="h-4 w-4 text-brand-primary" />
                    </div>
                </div>

                {/* Obra Destino (Select) */}
                <div className="space-y-4">
                    <Select
                        label="Obra de Destino"
                        options={obraOptions}
                        value={selectedObraId}
                        onChange={(e) => setSelectedObraId(e.target.value)}
                        className="h-12 text-sm font-medium"
                    />

                    <div className="space-y-2 text-left">
                        <label className="text-sm font-medium text-muted-foreground ml-0.5 flex items-center gap-2">
                            <MessageSquare className="h-3.5 w-3.5" />
                            Comentario / Nota (Opcional)
                        </label>
                        <textarea
                            className="w-full min-h-[100px] rounded-xl border border-input bg-white px-4 py-3 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary transition-all resize-none"
                            placeholder="Ej: Se requiere apoyo en enfierradura..."
                            value={comentario}
                            onChange={(e) => setComentario(e.target.value)}
                        />
                    </div>
                </div>

                <div className="bg-yellow-50/50 border border-yellow-200/50 p-3 rounded-xl border-dashed">
                    <p className="text-[11px] text-yellow-700 leading-relaxed font-medium">
                        <span className="font-bold">Aviso:</span> Al completar el traslado, se generará un registro de asistencia tipo <span className="font-bold">TO</span> en la obra actual y el trabajador se asignará permanentemente a la nueva obra.
                    </p>
                </div>
            </div>
        </Modal>
    );
};
