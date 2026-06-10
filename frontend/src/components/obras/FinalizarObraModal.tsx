import React, { useState, useEffect } from 'react';
import { Archive, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import api from '../../services/api';
import type { Obra } from '../../types/entities';
import { normalizarFecha } from '../../utils/fechas';

interface Props {
    obra: Obra | null;          // null = modal cerrado
    onClose: () => void;
    onSuccess: () => void;      // refresca la tabla del padre
}

const hoy = () => new Date().toISOString().slice(0, 10);

/**
 * Confirmación para marcar una obra como FINALIZADA (concluida).
 * fecha_termino requerida (default hoy); fecha_inicio opcional — si se omite,
 * el reporte la deriva de la primera asistencia registrada en la obra.
 */
export const FinalizarObraModal: React.FC<Props> = ({ obra, onClose, onSuccess }) => {
    const [fechaTermino, setFechaTermino] = useState(hoy());
    const [fechaInicio, setFechaInicio] = useState('');
    const [saving, setSaving] = useState(false);

    // Reset al abrir con otra obra (prellenar fecha_inicio si ya la tiene).
    useEffect(() => {
        if (obra) {
            setFechaTermino(hoy());
            setFechaInicio(obra.fecha_inicio ? normalizarFecha(obra.fecha_inicio) : '');
        }
    }, [obra?.id]);

    const handleFinalizar = async () => {
        if (!obra) return;
        if (!fechaTermino) { toast.error('La fecha de término es requerida'); return; }
        if (fechaInicio && fechaTermino < fechaInicio) {
            toast.error('La fecha de término no puede ser anterior a la de inicio');
            return;
        }
        setSaving(true);
        try {
            await api.put(`/obras/${obra.id}/finalizar`, {
                fecha_termino: fechaTermino,
                ...(fechaInicio ? { fecha_inicio: fechaInicio } : {}),
            });
            toast.success(`Obra "${obra.nombre}" finalizada`);
            onSuccess();
            onClose();
        } catch (err: any) {
            toast.error(err?.response?.data?.error || 'Error al finalizar la obra');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal
            isOpen={!!obra}
            onClose={onClose}
            title={
                <div className="flex items-center gap-2">
                    <Archive className="h-4 w-4 text-amber-600" />
                    <span>Finalizar obra</span>
                </div>
            }
            size="sm"
        >
            <div className="space-y-4">
                <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-50 border border-amber-200 dark:bg-amber-950/40 dark:border-amber-900">
                    <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                    <p className="text-xs text-amber-800 dark:text-amber-300">
                        <strong>{obra?.nombre}</strong> desaparecerá del selector de obras, asistencia,
                        consultas, inventario y dashboard. Quedará visible solo en la sección
                        <strong> Obras Finalizadas</strong>, desde donde puedes reactivarla.
                    </p>
                </div>

                <Input
                    label="Fecha de término"
                    type="date"
                    value={fechaTermino}
                    onChange={e => setFechaTermino(e.target.value)}
                />
                <Input
                    label="Fecha de inicio (opcional)"
                    type="date"
                    value={fechaInicio}
                    onChange={e => setFechaInicio(e.target.value)}
                    helperText="Si la dejas vacía, se usará la fecha de la primera asistencia registrada en la obra."
                />

                <div className="flex gap-2 pt-1">
                    <button
                        onClick={handleFinalizar}
                        disabled={saving || !fechaTermino}
                        className="flex-1 py-2.5 text-sm font-bold text-white bg-amber-600 rounded-xl hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                        {saving ? 'Finalizando...' : 'Finalizar obra'}
                    </button>
                    <button
                        onClick={onClose}
                        disabled={saving}
                        className="px-4 py-2.5 text-sm font-bold text-muted-foreground hover:text-brand-dark transition-colors"
                    >
                        Cancelar
                    </button>
                </div>
            </div>
        </Modal>
    );
};
