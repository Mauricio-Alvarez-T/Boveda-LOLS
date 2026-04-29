import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { ChevronLeft, Save, Send, MessageCircle, Plus, Ban, CheckCircle2, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../ui/Button';
import { cn } from '../../../utils/cn';
import { useAuth } from '../../../context/AuthContext';
import { useObra } from '../../../context/ObraContext';
import { useSabadosExtra } from '../../../hooks/attendance/useSabadosExtra';
import { prepareAndShareWithToast } from '../../../utils/whatsappShare';
import { buildCitacionMessage, buildAsistenciaMessage, fmtFechaCorta } from './sabadosWhatsApp';
import AddFromOtherObraModal from './AddFromOtherObraModal';
import type { Trabajador } from '../../../types/entities';

interface Props {
    sabadoId: number;
    onBack: () => void;
}

/**
 * Shape unificado: contiene los datos del trabajador directamente en la fila.
 * Evita union types con tipo guards que causan crashes de render.
 */
interface RowState {
    trabajador_id: number;
    rut: string;
    nombres: string;
    apellido_paterno: string;
    apellido_materno: string | null;
    cargo_id: number | null;
    cargo_nombre: string | null;
    asistio: boolean;
    horas_trabajadas: string;          // string para input controlado, parse a number al guardar
    observacion: string;
    citado: boolean;                   // 1 si vino de la citación, 0 si fue agregado el día
    obra_origen_id: number | null;
}

/**
 * Vista del día sábado: muestra los citados, permite marcar asistencia y horas,
 * agregar no-citados que llegaron, y enviar mensajes WhatsApp.
 *
 * Default: todos los citados llegan pre-marcados como "Asistió" (decisión del
 * usuario en plan, optimiza el caso común "todos vinieron").
 */
const SabadoExtraAsistencia: React.FC<Props> = ({ sabadoId, onBack }) => {
    const { hasPermission } = useAuth();
    const { obras } = useObra();
    const { fetchDetalle, registrarAsistencia, cancelar, current, loading } = useSabadosExtra();
    const [rows, setRows] = useState<Record<number, RowState>>({});
    const [horasDefault, setHorasDefault] = useState<string>('8');
    const [observacionesGlobales, setObservacionesGlobales] = useState('');
    const [showAddOther, setShowAddOther] = useState(false);
    const [saving, setSaving] = useState(false);

    const canRegistrar = hasPermission('asistencia.sabados_extra.registrar');
    const canCrear = hasPermission('asistencia.sabados_extra.crear');
    const canShare = hasPermission('asistencia.sabados_extra.enviar_whatsapp');

    useEffect(() => {
        fetchDetalle(sabadoId);
    }, [sabadoId, fetchDetalle]);

    // Inicializar estado local cuando llega el detalle
    useEffect(() => {
        if (!current) return;
        const initial: Record<number, RowState> = {};
        (current.trabajadores || []).forEach(w => {
            const isCitada = current.estado === 'citada';
            // Pre-marcar Asistió=true cuando aún está citada (modo "el día").
            // Si ya está realizada, respetar el valor persistido.
            const asistio = isCitada
                ? true
                : (w.asistio === 1);
            const horas = w.horas_trabajadas !== null && w.horas_trabajadas !== undefined
                ? String(w.horas_trabajadas)
                : (current.horas_default !== null && current.horas_default !== undefined ? String(current.horas_default) : '');
            initial[w.trabajador_id] = {
                trabajador_id: w.trabajador_id,
                rut: w.rut || '',
                nombres: w.nombres || '',
                apellido_paterno: w.apellido_paterno || '',
                apellido_materno: w.apellido_materno || null,
                cargo_id: w.cargo_id ?? null,
                cargo_nombre: w.cargo_nombre || null,
                asistio,
                horas_trabajadas: horas,
                observacion: w.observacion || '',
                citado: w.citado === 1,
                obra_origen_id: w.obra_origen_id ?? null,
            };
        });
        setRows(initial);
        setHorasDefault(current.horas_default !== null && current.horas_default !== undefined ? String(current.horas_default) : '8');
        setObservacionesGlobales(current.observaciones_globales || '');
    }, [current]);

    const allRowIds = useMemo(() => new Set(Object.keys(rows).map(k => Number(k))), [rows]);

    // useCallback para que las filas memoizadas no re-rendericen al tipear en
    // un input arbitrario. setRows es estable, así que sin deps.
    const updateRow = useCallback((trabajadorId: number, patch: Partial<RowState>) => {
        setRows(prev => ({ ...prev, [trabajadorId]: { ...prev[trabajadorId], ...patch } }));
    }, []);

    const setAsistio = useCallback((trabajadorId: number, asistio: boolean) => {
        setRows(prev => ({ ...prev, [trabajadorId]: { ...prev[trabajadorId], asistio } }));
    }, []);

    const setHorasRow = useCallback((trabajadorId: number, horas: string) => {
        setRows(prev => ({ ...prev, [trabajadorId]: { ...prev[trabajadorId], horas_trabajadas: horas } }));
    }, []);

    const setObsRow = useCallback((trabajadorId: number, obs: string) => {
        setRows(prev => ({ ...prev, [trabajadorId]: { ...prev[trabajadorId], observacion: obs } }));
    }, []);

    const handleAddExternal = (newWorkers: Trabajador[]) => {
        setRows(prev => {
            const next = { ...prev };
            newWorkers.forEach(w => {
                if (next[w.id]) return; // ya existe
                next[w.id] = {
                    trabajador_id: w.id,
                    rut: w.rut || '',
                    nombres: w.nombres || '',
                    apellido_paterno: w.apellido_paterno || '',
                    apellido_materno: w.apellido_materno || null,
                    cargo_id: w.cargo_id ?? null,
                    cargo_nombre: w.cargo_nombre || null,
                    asistio: true,
                    horas_trabajadas: horasDefault,
                    observacion: '',
                    citado: false,
                    obra_origen_id: w.obra_id,
                };
            });
            return next;
        });
    };

    /**
     * Convierte un input string a number aceptando tanto '5.5' como '5,5'
     * (locale es-CL usa coma decimal). Devuelve NaN si no es parseable.
     */
    const parseHoras = (raw: string): number => {
        const normalized = (raw || '').replace(',', '.').trim();
        if (!normalized) return NaN;
        return Number(normalized);
    };

    /**
     * Aplica horasDefault a TODOS los trabajadores (sobreescribe valores
     * existentes). Caso de uso: "todos hicieron las mismas horas, salvo
     * casos puntuales". El usuario puede ajustar individualmente después.
     */
    const aplicarHorasDefault = () => {
        if (!horasDefault) return;
        const horasNum = parseHoras(horasDefault);
        if (isNaN(horasNum) || horasNum < 0 || horasNum > 24) {
            toast.error('Horas inválidas. Ingresa un valor entre 0 y 24.');
            return;
        }
        const horasStr = String(horasNum);
        setRows(prev => {
            const next: Record<number, RowState> = {};
            Object.entries(prev).forEach(([id, r]) => {
                next[Number(id)] = {
                    ...r,
                    horas_trabajadas: horasStr,
                };
            });
            return next;
        });
        toast.success(`Horas (${horasStr}) aplicadas a todos los trabajadores`);
    };

    const handleGuardar = async () => {
        if (!canRegistrar) return;

        // Validar horas individuales antes de mandar al backend
        for (const [id, r] of Object.entries(rows)) {
            if (!r.horas_trabajadas) continue;
            const n = parseHoras(r.horas_trabajadas);
            if (isNaN(n) || n < 0 || n > 24) {
                toast.error(`Horas inválidas para trabajador ID ${id}: "${r.horas_trabajadas}"`);
                return;
            }
        }

        setSaving(true);
        const trabajadores = Object.entries(rows).map(([id, r]) => {
            const n = r.horas_trabajadas ? parseHoras(r.horas_trabajadas) : NaN;
            return {
                trabajador_id: Number(id),
                obra_origen_id: r.obra_origen_id,
                asistio: r.asistio,
                horas_trabajadas: !isNaN(n) ? n : null,
                observacion: r.observacion || null,
            };
        });

        const horasDefaultNum = horasDefault ? parseHoras(horasDefault) : NaN;
        const ok = await registrarAsistencia(sabadoId, {
            horas_default: !isNaN(horasDefaultNum) ? horasDefaultNum : null,
            observaciones_globales: observacionesGlobales || null,
            trabajadores,
        });
        setSaving(false);

        if (ok) await fetchDetalle(sabadoId);
    };

    const handleCancelar = async () => {
        if (!window.confirm('¿Cancelar esta citación? No se podrá deshacer.')) return;
        const ok = await cancelar(sabadoId);
        if (ok) onBack();
    };

    const handleShareCitacion = async () => {
        if (!current || !canShare) return;
        const text = buildCitacionMessage(current);
        await prepareAndShareWithToast({
            text,
            title: `Citación ${current.obra_nombre}`,
            toastId: 'sabados-share-citacion',
            preparingMessage: 'Preparando citación...',
            successMessage: '¡Citación lista!',
            successDescription: 'Pulsa el botón para enviarla por WhatsApp. El mensaje también está en tu portapapeles.',
        });
    };

    const handleShareAsistencia = async () => {
        if (!current || !canShare) return;
        // Si está aún en estado citada, sugerir guardar antes
        if (current.estado === 'citada') {
            toast.info('Guarda la asistencia antes de enviarla por WhatsApp.');
            return;
        }
        const text = buildAsistenciaMessage(current);
        await prepareAndShareWithToast({
            text,
            title: `Asistencia ${current.obra_nombre}`,
            toastId: 'sabados-share-asistencia',
            preparingMessage: 'Preparando asistencia...',
            successMessage: '¡Asistencia lista!',
            successDescription: 'Pulsa el botón para enviarla por WhatsApp. El mensaje también está en tu portapapeles.',
        });
    };

    // Agrupar filas por cargo para render. DEBE ir antes de cualquier early
    // return para no violar reglas de hooks (React error #310).
    const grupos = useMemo(() => {
        const map: Record<string, Array<{ trabajadorId: number; row: RowState }>> = {};
        Object.entries(rows).forEach(([id, row]) => {
            const cargoNombre = row.cargo_nombre || 'Sin Cargo';
            (map[cargoNombre] = map[cargoNombre] || []).push({
                trabajadorId: Number(id),
                row,
            });
        });
        return Object.keys(map)
            .sort((a, b) => a.localeCompare(b, 'es'))
            .map(cargo => ({ cargo, items: map[cargo] }));
    }, [rows]);

    if (loading || !current) {
        return (
            <div className="py-12 text-center text-sm text-muted-foreground">Cargando...</div>
        );
    }

    const fechaStr = fmtFechaCorta(current.fecha);
    const isCancelada = current.estado === 'cancelada';
    const isRealizada = current.estado === 'realizada';
    const totalAsistio = Object.values(rows).filter(r => r.asistio).length;

    return (
        <div className="flex flex-col gap-4 pb-24 md:pb-4">
            {/* Header */}
            <div className="flex items-center gap-3">
                <button
                    onClick={onBack}
                    className="flex items-center gap-1 text-sm text-muted-foreground hover:text-brand-dark"
                >
                    <ChevronLeft className="h-4 w-4" /> Volver
                </button>
            </div>

            <div className="bg-white border border-[#E8E8ED] rounded-2xl p-4 md:p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h2 className="text-lg font-black text-brand-dark">Sábado {fechaStr}</h2>
                        <p className="text-xs text-muted-foreground font-semibold mt-0.5">
                            Obra {current.obra_nombre} · Solicitado por {current.creado_por_nombre || '—'}
                        </p>
                    </div>
                    <span className={cn(
                        'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-black uppercase border',
                        current.estado === 'citada' && 'bg-amber-50 border-amber-200 text-amber-800',
                        current.estado === 'realizada' && 'bg-emerald-50 border-emerald-200 text-emerald-800',
                        current.estado === 'cancelada' && 'bg-gray-50 border-gray-200 text-gray-600',
                    )}>
                        {current.estado === 'citada' && <Clock className="h-3 w-3" />}
                        {current.estado === 'realizada' && <CheckCircle2 className="h-3 w-3" />}
                        {current.estado === 'cancelada' && <Ban className="h-3 w-3" />}
                        {current.estado}
                    </span>
                </div>
            </div>

            {/* Si está cancelada, no mostrar formulario de edición */}
            {isCancelada && (
                <div className="bg-gray-50 border border-gray-200 rounded-2xl p-6 text-center text-sm text-muted-foreground">
                    Esta citación fue cancelada y no se puede modificar.
                </div>
            )}

            {!isCancelada && (
                <>
                    {/* Controles globales: horas default + observación general */}
                    <div className="bg-white border border-[#E8E8ED] rounded-2xl p-4 md:p-5">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <label className="text-[11px] font-black uppercase tracking-wider text-brand-dark mb-1.5 block">
                                    Horas (default)
                                </label>
                                <div className="flex gap-2">
                                    <input
                                        type="number"
                                        min="0"
                                        max="24"
                                        step="0.5"
                                        value={horasDefault}
                                        onChange={e => setHorasDefault(e.target.value)}
                                        disabled={!canRegistrar}
                                        className="flex-1 h-10 px-3 bg-white border border-[#D0D0D5] rounded-xl text-sm font-medium focus:outline-none focus:border-brand-primary disabled:opacity-60"
                                    />
                                    <button
                                        type="button"
                                        onClick={aplicarHorasDefault}
                                        disabled={!canRegistrar || !horasDefault}
                                        className="px-3 h-10 text-xs font-bold text-brand-primary border border-brand-primary/30 rounded-xl hover:bg-brand-primary/5 disabled:opacity-50"
                                    >
                                        Aplicar a todos
                                    </button>
                                </div>
                            </div>
                            <div className="md:col-span-2">
                                <label className="text-[11px] font-black uppercase tracking-wider text-brand-dark mb-1.5 block">
                                    Observación general
                                </label>
                                <input
                                    type="text"
                                    value={observacionesGlobales}
                                    onChange={e => setObservacionesGlobales(e.target.value)}
                                    disabled={!canRegistrar}
                                    placeholder="Comentario al final del mensaje WhatsApp..."
                                    className="w-full h-10 px-3 bg-white border border-[#D0D0D5] rounded-xl text-sm font-medium focus:outline-none focus:border-brand-primary disabled:opacity-60"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Resumen + acciones rápidas */}
                    <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                        <div className="text-xs font-bold text-brand-dark">
                            Asistieron: {totalAsistio} / {Object.keys(rows).length}
                        </div>
                        {canCrear && (
                            <button
                                type="button"
                                onClick={() => setShowAddOther(true)}
                                className="text-xs font-bold text-brand-primary hover:underline flex items-center gap-1"
                            >
                                <Plus className="h-3.5 w-3.5" /> Agregar trabajador no citado
                            </button>
                        )}
                    </div>

                    {/* Lista filas por cargo */}
                    <div className="flex flex-col gap-3">
                        {grupos.map(({ cargo, items }) => (
                            <div key={cargo} className="border border-[#E8E8ED] rounded-2xl overflow-hidden bg-white">
                                <div className="bg-[#F5F5F7] px-4 py-2.5 flex items-center justify-between">
                                    <span className="text-[11px] font-black uppercase tracking-wider text-brand-dark">
                                        {cargo} ({items.length})
                                    </span>
                                </div>
                                <div className="divide-y divide-[#F0F0F5]">
                                    {items.map(({ trabajadorId, row }) => {
                                        return (
                                            <div key={trabajadorId} className="px-4 py-3 flex flex-wrap items-center gap-3">
                                                <div className="flex-1 min-w-[160px]">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-sm font-bold text-brand-dark">
                                                            {row.apellido_paterno}{row.apellido_materno ? ` ${row.apellido_materno}` : ''} {row.nombres}
                                                        </span>
                                                        {!row.citado && (
                                                            <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 border border-blue-200">
                                                                No citado
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="text-[10px] text-muted-foreground font-medium">
                                                        {row.rut}
                                                    </div>
                                                </div>

                                                {/* Toggle Asistió / No */}
                                                <div className="flex gap-1 shrink-0">
                                                    <button
                                                        type="button"
                                                        aria-label={`${row.apellido_paterno} ${row.nombres}: marcar asistió`}
                                                        onClick={() => setAsistio(trabajadorId, true)}
                                                        disabled={!canRegistrar}
                                                        className={cn(
                                                            'px-3 h-9 text-[11px] font-bold rounded-lg transition-all',
                                                            row.asistio
                                                                ? 'bg-emerald-500 text-white shadow'
                                                                : 'bg-white border border-[#D0D0D5] text-muted-foreground'
                                                        )}
                                                    >
                                                        Asistió
                                                    </button>
                                                    <button
                                                        type="button"
                                                        aria-label={`${row.apellido_paterno} ${row.nombres}: marcar no asistió`}
                                                        onClick={() => setAsistio(trabajadorId, false)}
                                                        disabled={!canRegistrar}
                                                        className={cn(
                                                            'px-3 h-9 text-[11px] font-bold rounded-lg transition-all',
                                                            !row.asistio
                                                                ? 'bg-red-500 text-white shadow'
                                                                : 'bg-white border border-[#D0D0D5] text-muted-foreground'
                                                        )}
                                                    >
                                                        No
                                                    </button>
                                                </div>

                                                {/* Horas */}
                                                <input
                                                    type="number"
                                                    min="0"
                                                    max="24"
                                                    step="0.5"
                                                    placeholder="Horas"
                                                    aria-label={`Horas trabajadas para ${row.apellido_paterno} ${row.nombres}`}
                                                    value={row.horas_trabajadas}
                                                    onChange={e => setHorasRow(trabajadorId, e.target.value)}
                                                    disabled={!canRegistrar || !row.asistio}
                                                    className="w-20 h-9 px-2 bg-white border border-[#D0D0D5] rounded-lg text-sm text-center font-medium focus:outline-none focus:border-brand-primary disabled:opacity-50"
                                                />

                                                {/* Observación */}
                                                <input
                                                    type="text"
                                                    placeholder="Nota..."
                                                    aria-label={`Observación para ${row.apellido_paterno} ${row.nombres}`}
                                                    value={row.observacion}
                                                    onChange={e => setObsRow(trabajadorId, e.target.value)}
                                                    disabled={!canRegistrar}
                                                    className="flex-1 min-w-[120px] h-9 px-3 bg-white border border-[#D0D0D5] rounded-lg text-sm font-medium focus:outline-none focus:border-brand-primary disabled:opacity-60"
                                                />
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Footer acciones */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#E8E8ED]">
                        {canCrear && current.estado === 'citada' && (
                            <Button
                                variant="ghost"
                                onClick={handleCancelar}
                                leftIcon={<Ban className="h-4 w-4" />}
                            >
                                Cancelar citación
                            </Button>
                        )}
                        <div className="flex items-center gap-2 ml-auto">
                            {canShare && current.estado === 'citada' && (
                                <Button
                                    variant="secondary"
                                    onClick={handleShareCitacion}
                                    leftIcon={<MessageCircle className="h-4 w-4" />}
                                >
                                    Enviar citación
                                </Button>
                            )}
                            {canShare && isRealizada && (
                                <Button
                                    variant="secondary"
                                    onClick={handleShareAsistencia}
                                    leftIcon={<Send className="h-4 w-4" />}
                                >
                                    Enviar asistencia
                                </Button>
                            )}
                            {canRegistrar && (
                                <Button
                                    variant="primary"
                                    onClick={handleGuardar}
                                    disabled={saving}
                                    leftIcon={<Save className="h-4 w-4" />}
                                >
                                    {saving ? 'Guardando...' : 'Guardar asistencia'}
                                </Button>
                            )}
                        </div>
                    </div>
                </>
            )}

            {showAddOther && current.obra_id && (
                <AddFromOtherObraModal
                    isOpen={showAddOther}
                    onClose={() => setShowAddOther(false)}
                    obras={obras}
                    obraAnfitrionaId={current.obra_id}
                    excludeWorkerIds={allRowIds}
                    onConfirm={handleAddExternal}
                />
            )}
        </div>
    );
};

export default SabadoExtraAsistencia;
