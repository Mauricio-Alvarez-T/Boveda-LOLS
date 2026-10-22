import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Building2, Plus } from 'lucide-react';
import api from '../../services/api';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { SearchableSelect } from '../ui/SearchableSelect';
import { FormError } from '../ui/FormError';
import { mensajeError } from './costosConfig';

interface ObraDisponible { id: number; nombre: string; finalizada: boolean }

/**
 * Agregar una obra a Presupuestos. El módulo no lista todas las obras (OFICINA, LICENCIA o LOLS
 * GENERAL no llevan presupuesto): solo las que se agregan aquí o que ya tienen un gasto.
 */
export const AgregarObraModal: React.FC<{ onClose: () => void; onAgregada: (obraId: number) => void }> = ({ onClose, onAgregada }) => {
    const [obras, setObras] = useState<ObraDisponible[] | null>(null);
    const [obraId, setObraId] = useState<number | null>(null);
    const [guardando, setGuardando] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        api.get<{ data: ObraDisponible[] }>('/costos/obras/disponibles')
            .then(res => setObras(res.data.data || []))
            .catch(e => { setError(mensajeError(e, 'No se pudieron cargar las obras.')); setObras([]); });
    }, []);

    const opciones = useMemo(() => (obras || []).map(o => ({ value: o.id, label: o.finalizada ? `${o.nombre} (finalizada)` : o.nombre })), [obras]);

    const agregar = async () => {
        if (!obraId) { setError('Elige una obra.'); return; }
        setGuardando(true);
        setError(null);
        try {
            await api.post('/costos/obras', { obra_id: obraId });
            toast.success('Obra agregada a Presupuestos');
            onAgregada(obraId);
        } catch (e) {
            setError(mensajeError(e, 'No se pudo agregar la obra.'));
            setGuardando(false);
        }
    };

    return (
        <Modal
            isOpen
            onClose={onClose}
            size="sm"
            icon={Building2}
            title="Agregar obra"
            description="Elige la obra a la que le vas a llevar presupuesto y gastos."
            footer={
                <div className="flex w-full justify-end gap-2">
                    <Button variant="ghost" onClick={onClose}>Cancelar</Button>
                    <Button onClick={agregar} isLoading={guardando} disabled={!obraId} leftIcon={!guardando ? <Plus className="h-4 w-4" /> : undefined}>Agregar</Button>
                </div>
            }
        >
            <div className="flex flex-col gap-3">
                {obras === null ? (
                    <div className="h-11 rounded-xl bg-muted" />
                ) : obras.length ? (
                    <SearchableSelect
                        label="Obra"
                        options={opciones}
                        value={obraId}
                        onChange={v => setObraId(v === null || v === '' ? null : Number(v))}
                        placeholder="Buscar obra…"
                    />
                ) : (
                    <p className="text-sm text-muted-foreground">Todas las obras ya están en Presupuestos.</p>
                )}
                <FormError message={error} />
            </div>
        </Modal>
    );
};

export default AgregarObraModal;
