import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Save, X, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../ui/Button';
import { cn } from '../../../utils/cn';
import api from '../../../services/api';
import { useObra } from '../../../context/ObraContext';
import { useSabadosExtra } from '../../../hooks/attendance/useSabadosExtra';
import WorkerCheckList from './WorkerCheckList';
import AddFromOtherObraModal from './AddFromOtherObraModal';
import type { Trabajador } from '../../../types/entities';

interface Props {
    /** Llamada cuando la citación se creó OK; recibe el id para navegar al detalle */
    onCreated: (id: number) => void;
    onCancel: () => void;
}

/**
 * Form para crear una citación nueva de Sábado Extra.
 * Inputs:
 *   - fecha (validada como sábado)
 *   - obra anfitriona (del contexto, read-only)
 *   - selector de trabajadores (de la obra + opción "agregar de otra obra")
 *   - observaciones por cargo (1 input por cargo con seleccionados)
 *   - observación global (textarea)
 *   - horas_default (numérico)
 */
const SabadoExtraForm: React.FC<Props> = ({ onCreated, onCancel }) => {
    const { selectedObra, obras } = useObra();
    const { crearCitacion } = useSabadosExtra();

    const [fecha, setFecha] = useState<string>('');
    const [horasDefault, setHorasDefault] = useState<string>('8');
    const [observacionesGlobales, setObservacionesGlobales] = useState('');
    const [observacionesPorCargo, setObservacionesPorCargo] = useState<Record<string, string>>({});
    const [workers, setWorkers] = useState<Trabajador[]>([]);
    const [externalWorkers, setExternalWorkers] = useState<Trabajador[]>([]);
    const [selected, setSelected] = useState<Set<number>>(new Set());
    const [showAddOther, setShowAddOther] = useState(false);
    const [saving, setSaving] = useState(false);

    // Cargar trabajadores de la obra anfitriona
    useEffect(() => {
        if (!selectedObra) return;
        api.get<{ data: Trabajador[] }>('/trabajadores', {
            params: { obra_id: selectedObra.id, activo: true, limit: 5000 }
        })
            .then(res => setWorkers(res.data.data))
            .catch(() => setWorkers([]));
    }, [selectedObra]);

    // Lista combinada (obra + externos)
    const allWorkers = useMemo(() => [...workers, ...externalWorkers], [workers, externalWorkers]);
    const allWorkerIds = useMemo(() => new Set(allWorkers.map(w => w.id)), [allWorkers]);

    // Cargos con al menos un trabajador seleccionado
    const cargosConSeleccion = useMemo(() => {
        const map: Record<number, string> = {};  // cargo_id -> cargo_nombre
        allWorkers.forEach(w => {
            if (selected.has(w.id) && w.cargo_id) {
                map[w.cargo_id] = w.cargo_nombre || `Cargo #${w.cargo_id}`;
            }
        });
        return Object.entries(map)
            .map(([id, nombre]) => ({ id: Number(id), nombre }))
            .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    }, [allWorkers, selected]);

    // Validación fecha sábado
    const fechaError = useMemo(() => {
        if (!fecha) return null;
        const d = new Date(fecha + 'T12:00:00');
        if (Number.isNaN(d.getTime())) return 'Fecha inválida';
        if (d.getDay() !== 6) return 'La fecha debe ser sábado';
        return null;
    }, [fecha]);

    const toggleWorker = (id: number) => {
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handleAddExternal = (newWorkers: Trabajador[]) => {
        // Agregar a la lista de externos sin duplicar
        const existing = new Set(allWorkerIds);
        const fresh = newWorkers.filter(w => !existing.has(w.id));
        setExternalWorkers(prev => [...prev, ...fresh]);
        // Auto-seleccionarlos
        setSelected(prev => {
            const next = new Set(prev);
            fresh.forEach(w => next.add(w.id));
            return next;
        });
    };

    const removeExternal = (id: number) => {
        setExternalWorkers(prev => prev.filter(w => w.id !== id));
        setSelected(prev => {
            const next = new Set(prev);
            next.delete(id);
            return next;
        });
    };

    const handleSave = async () => {
        if (!selectedObra) {
            toast.error('Selecciona una obra antes de continuar');
            return;
        }
        if (fechaError) {
            toast.error(fechaError);
            return;
        }
        if (!fecha) {
            toast.error('La fecha es requerida');
            return;
        }
        if (selected.size === 0) {
            toast.error('Selecciona al menos un trabajador');
            return;
        }

        const trabajadores = allWorkers
            .filter(w => selected.has(w.id))
            .map(w => ({
                trabajador_id: w.id,
                obra_origen_id: w.obra_id,
            }));

        // Solo guardar observaciones por cargo si tienen texto
        const obsPorCargo: Record<string, string> = {};
        Object.entries(observacionesPorCargo).forEach(([k, v]) => {
            if (v && v.trim()) obsPorCargo[k] = v.trim();
        });

        const basePayload = {
            obra_id: selectedObra.id,
            fecha,
            horas_default: Number(horasDefault) || null,
            observaciones_globales: observacionesGlobales.trim() || null,
            observaciones_por_cargo: Object.keys(obsPorCargo).length > 0 ? obsPorCargo : null,
            trabajadores,
        };

        setSaving(true);
        let result = await crearCitacion(basePayload);

        // Backend rechaza con 409 si la fecha cae en feriado y no se aceptó
        // explícitamente. Pedir confirmación al usuario y reintentar con flag.
        if (result && 'feriadoConflict' in result) {
            const confirmar = window.confirm(
                `${result.feriadoConflict}\n\n¿Deseas crear la citación de todos modos?`
            );
            if (confirmar) {
                result = await crearCitacion({ ...basePayload, acepta_feriado: true });
            } else {
                result = null;
            }
        }

        setSaving(false);

        if (!result) return;
        if ('id' in result) {
            onCreated(result.id);
        } else if ('conflictExistingId' in result) {
            // Hay conflict: abrir la existente
            onCreated(result.conflictExistingId);
        }
    };

    if (!selectedObra) {
        return (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                    <h3 className="text-sm font-bold text-amber-900">Selecciona una obra</h3>
                    <p className="text-xs text-amber-800 mt-1">
                        Para crear una citación de trabajo extraordinario debes tener una obra seleccionada en el header.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-5">
            {/* Cabecera */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                    <label className="text-[11px] font-black uppercase tracking-wider text-brand-dark mb-1.5 block">
                        Fecha (sábado)
                    </label>
                    <input
                        type="date"
                        value={fecha}
                        onChange={e => setFecha(e.target.value)}
                        className={cn(
                            'w-full h-10 px-3 bg-white border rounded-xl text-sm font-medium focus:outline-none',
                            fechaError ? 'border-red-400 focus:border-red-500' : 'border-[#D0D0D5] focus:border-brand-primary'
                        )}
                    />
                    {fechaError && <p className="text-[10px] text-red-600 font-semibold mt-1">{fechaError}</p>}
                </div>
                <div>
                    <label className="text-[11px] font-black uppercase tracking-wider text-brand-dark mb-1.5 block">
                        Obra anfitriona
                    </label>
                    <div className="h-10 px-3 bg-[#F5F5F7] border border-[#E8E8ED] rounded-xl text-sm font-bold text-brand-dark flex items-center">
                        {selectedObra.nombre}
                    </div>
                </div>
                <div>
                    <label className="text-[11px] font-black uppercase tracking-wider text-brand-dark mb-1.5 block">
                        Horas (default por trabajador)
                    </label>
                    <input
                        type="number"
                        min="0"
                        max="24"
                        step="0.5"
                        value={horasDefault}
                        onChange={e => setHorasDefault(e.target.value)}
                        className="w-full h-10 px-3 bg-white border border-[#D0D0D5] rounded-xl text-sm font-medium focus:outline-none focus:border-brand-primary"
                    />
                </div>
            </div>

            {/* Lista trabajadores */}
            <div>
                <div className="flex items-baseline justify-between mb-2">
                    <h3 className="text-sm font-black text-brand-dark uppercase tracking-wider">
                        Trabajadores ({selected.size} seleccionados)
                    </h3>
                </div>
                <WorkerCheckList
                    workers={allWorkers}
                    selected={selected}
                    onToggle={toggleWorker}
                    obraAnfitrionaId={selectedObra.id}
                />
                {externalWorkers.length > 0 && (
                    <div className="mt-3 p-3 bg-amber-50/50 border border-amber-200 rounded-xl">
                        <p className="text-[10px] font-bold uppercase text-amber-800 mb-2">Externos agregados</p>
                        <div className="flex flex-wrap gap-1.5">
                            {externalWorkers.map(w => (
                                <span key={w.id} className="inline-flex items-center gap-1 px-2 py-1 bg-white border border-amber-300 rounded-lg text-[11px] font-semibold">
                                    {w.apellido_paterno} {w.nombres}
                                    <button onClick={() => removeExternal(w.id)} className="ml-0.5 hover:text-red-600">
                                        <X className="h-3 w-3" />
                                    </button>
                                </span>
                            ))}
                        </div>
                    </div>
                )}
                <button
                    type="button"
                    onClick={() => setShowAddOther(true)}
                    className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 px-4 border-2 border-dashed border-[#D0D0D5] rounded-xl text-sm font-semibold text-muted-foreground hover:border-brand-primary hover:text-brand-primary transition-colors"
                >
                    <Plus className="h-4 w-4" />
                    Agregar trabajadores de otra obra
                </button>
            </div>

            {/* Observaciones por cargo (si hay seleccionados) */}
            {cargosConSeleccion.length > 0 && (
                <div>
                    <h3 className="text-sm font-black text-brand-dark uppercase tracking-wider mb-2">
                        Trabajos a realizar (por cargo)
                    </h3>
                    <p className="text-[11px] text-muted-foreground mb-3">
                        Opcional. Lo que escribas acá aparecerá en el mensaje de WhatsApp agrupado por cargo.
                    </p>
                    <div className="flex flex-col gap-2">
                        {cargosConSeleccion.map(c => (
                            <div key={c.id}>
                                <label className="text-[10px] font-bold uppercase text-muted-foreground mb-1 block">
                                    {c.nombre}
                                </label>
                                <input
                                    type="text"
                                    placeholder={`Trabajos para ${c.nombre.toLowerCase()}...`}
                                    value={observacionesPorCargo[String(c.id)] || ''}
                                    onChange={e => setObservacionesPorCargo(prev => ({ ...prev, [String(c.id)]: e.target.value }))}
                                    className="w-full h-9 px-3 bg-white border border-[#D0D0D5] rounded-lg text-sm font-medium focus:outline-none focus:border-brand-primary"
                                />
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Observación global */}
            <div>
                <label className="text-[11px] font-black uppercase tracking-wider text-brand-dark mb-1.5 block">
                    Observación general (opcional)
                </label>
                <textarea
                    value={observacionesGlobales}
                    onChange={e => setObservacionesGlobales(e.target.value)}
                    rows={2}
                    placeholder="Comentario adicional que aparecerá al final del mensaje..."
                    className="w-full px-3 py-2 bg-white border border-[#D0D0D5] rounded-xl text-sm font-medium focus:outline-none focus:border-brand-primary resize-none"
                />
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E8E8ED]">
                <Button variant="secondary" onClick={onCancel} disabled={saving}>
                    Cancelar
                </Button>
                <Button
                    variant="primary"
                    onClick={handleSave}
                    disabled={saving || !!fechaError || !fecha || selected.size === 0}
                    leftIcon={<Save className="h-4 w-4" />}
                >
                    {saving ? 'Guardando...' : 'Crear citación'}
                </Button>
            </div>

            <AddFromOtherObraModal
                isOpen={showAddOther}
                onClose={() => setShowAddOther(false)}
                obras={obras}
                obraAnfitrionaId={selectedObra.id}
                excludeWorkerIds={allWorkerIds}
                onConfirm={handleAddExternal}
            />
        </div>
    );
};

export default SabadoExtraForm;
