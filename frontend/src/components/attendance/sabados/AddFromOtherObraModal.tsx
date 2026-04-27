import React, { useState, useEffect } from 'react';
import { Modal } from '../../ui/Modal';
import { Button } from '../../ui/Button';
import api from '../../../services/api';
import WorkerCheckList from './WorkerCheckList';
import type { Trabajador } from '../../../types/entities';

interface Obra {
    id: number;
    nombre: string;
}

interface Props {
    isOpen: boolean;
    onClose: () => void;
    obras: Obra[];                       // todas las obras disponibles
    obraAnfitrionaId: number;            // se filtra para ocultarla
    excludeWorkerIds: Set<number>;       // ya seleccionados, no se muestran
    onConfirm: (selected: Trabajador[]) => void;
}

/**
 * Modal para agregar trabajadores de OTRA obra a la citación.
 * Flujo: el usuario elige una obra del dropdown, se cargan sus trabajadores
 * activos (excluyendo los ya seleccionados), marca los que necesita,
 * confirma y los agrega a la citación.
 */
const AddFromOtherObraModal: React.FC<Props> = ({
    isOpen, onClose, obras, obraAnfitrionaId, excludeWorkerIds, onConfirm
}) => {
    const [selectedObraId, setSelectedObraId] = useState<number | null>(null);
    const [workers, setWorkers] = useState<Trabajador[]>([]);
    const [loading, setLoading] = useState(false);
    const [selected, setSelected] = useState<Set<number>>(new Set());

    // Reset al abrir
    useEffect(() => {
        if (isOpen) {
            setSelectedObraId(null);
            setWorkers([]);
            setSelected(new Set());
        }
    }, [isOpen]);

    // Fetch trabajadores cuando cambia la obra
    useEffect(() => {
        if (!selectedObraId) {
            setWorkers([]);
            return;
        }
        setLoading(true);
        api.get<{ data: Trabajador[] }>('/trabajadores', {
            params: { obra_id: selectedObraId, activo: true, limit: 5000 }
        })
            .then(res => {
                const filtered = res.data.data.filter(w => !excludeWorkerIds.has(w.id));
                setWorkers(filtered);
            })
            .catch(() => setWorkers([]))
            .finally(() => setLoading(false));
    }, [selectedObraId, excludeWorkerIds]);

    const obrasDisponibles = obras.filter(o => o.id !== obraAnfitrionaId);

    const toggle = (id: number) => {
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handleConfirm = () => {
        const selectedWorkers = workers.filter(w => selected.has(w.id));
        onConfirm(selectedWorkers);
        onClose();
    };

    const footer = (
        <div className="flex justify-end gap-2 p-4 border-t border-[#E8E8ED] bg-white">
            <Button variant="secondary" onClick={onClose}>Cancelar</Button>
            <Button
                variant="primary"
                onClick={handleConfirm}
                disabled={selected.size === 0}
            >
                Agregar {selected.size > 0 ? `(${selected.size})` : ''}
            </Button>
        </div>
    );

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Agregar trabajadores de otra obra"
            size="lg"
            footer={footer}
        >
            <div className="flex flex-col gap-4 p-4">
                <div>
                    <label className="text-[11px] font-black uppercase tracking-wider text-brand-dark mb-1.5 block">
                        Obra de origen
                    </label>
                    <select
                        value={selectedObraId ?? ''}
                        onChange={e => setSelectedObraId(e.target.value ? Number(e.target.value) : null)}
                        className="w-full h-10 px-3 bg-white border border-[#D0D0D5] rounded-xl text-sm font-medium text-brand-dark focus:outline-none focus:border-brand-primary"
                    >
                        <option value="">— Seleccionar obra —</option>
                        {obrasDisponibles.map(o => (
                            <option key={o.id} value={o.id}>{o.nombre}</option>
                        ))}
                    </select>
                </div>

                {selectedObraId && (
                    <div>
                        {loading ? (
                            <div className="py-8 text-center text-xs text-muted-foreground">Cargando trabajadores...</div>
                        ) : workers.length === 0 ? (
                            <div className="py-6 text-center text-xs text-muted-foreground">
                                No hay trabajadores disponibles en esta obra
                                (todos los activos ya están seleccionados).
                            </div>
                        ) : (
                            <WorkerCheckList
                                workers={workers}
                                selected={selected}
                                onToggle={toggle}
                                obraAnfitrionaId={obraAnfitrionaId}
                            />
                        )}
                    </div>
                )}
            </div>
        </Modal>
    );
};

export default AddFromOtherObraModal;
