import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { ChevronLeft, Save, Send, MessageCircle, Plus, Ban } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../ui/Button';
import { StatusBadge } from '../../ui/StatusBadge';
import { Chip } from '../../ui/Chip';
import { cn } from '../../../utils/cn';
import { flagOn } from '../../../utils/flags';
import { fmtSemana } from '../../../utils/semanas';
import { useAuth } from '../../../context/AuthContext';
import { useObra } from '../../../context/ObraContext';
import { useActividadesSugeridas } from '../../../hooks/attendance/useActividadesSugeridas';
import { prepareAndShareWithToast } from '../../../utils/whatsappShare';
import { buildListaMessage, buildAsistenciaMessage } from './actividadesWhatsApp';
import AddFromOtherObraModal from './AddFromOtherObraModal';
import type { Trabajador } from '../../../types/entities';

interface Props {
    actividadId: number;
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
    observacion: string;
    citado: boolean;                   // 1 si venía en la lista, 0 si se agregó al registrar
    obra_origen_id: number | null;
}

/**
 * Detalle de una lista: muestra a los trabajadores, permite marcar asistencia
 * (solo asistió/no asistió — sin horas, jefatura 2026-08-17), agregar a los
 * que no venían en la lista, y enviar mensajes WhatsApp.
 *
 * Default: todos llegan pre-marcados como "Asistió" (optimiza el caso común
 * "todos vinieron").
 */
const ActividadSugeridaAsistencia: React.FC<Props> = ({ actividadId, onBack }) => {
    const { hasPermission } = useAuth();
    const { obras } = useObra();
    const { fetchDetalle, registrarAsistencia, cancelar, current, loading } = useActividadesSugeridas();
    const [rows, setRows] = useState<Record<number, RowState>>({});
    const [observacionesGlobales, setObservacionesGlobales] = useState('');
    const [showAddOther, setShowAddOther] = useState(false);
    const [saving, setSaving] = useState(false);

    const canRegistrar = hasPermission('asistencia.actividades_sugeridas.registrar');
    const canCrear = hasPermission('asistencia.actividades_sugeridas.crear');
    const canShare = hasPermission('asistencia.actividades_sugeridas.enviar_whatsapp');

    useEffect(() => {
        fetchDetalle(actividadId);
    }, [actividadId, fetchDetalle]);

    // Inicializar estado local cuando llega el detalle
    useEffect(() => {
        if (!current) return;
        const initial: Record<number, RowState> = {};
        (current.trabajadores || []).forEach(w => {
            const isCitada = current.estado === 'citada';
            // Pre-marcar Asistió=true mientras la lista está recién creada.
            // Si ya está realizada, respetar el valor persistido.
            const asistio = isCitada
                ? true
                : flagOn(w.asistio);
            initial[w.trabajador_id] = {
                trabajador_id: w.trabajador_id,
                rut: w.rut || '',
                nombres: w.nombres || '',
                apellido_paterno: w.apellido_paterno || '',
                apellido_materno: w.apellido_materno || null,
                cargo_id: w.cargo_id ?? null,
                cargo_nombre: w.cargo_nombre || null,
                asistio,
                observacion: w.observacion || '',
                citado: flagOn(w.citado),
                obra_origen_id: w.obra_origen_id ?? null,
            };
        });
        setRows(initial);
        setObservacionesGlobales(current.observaciones_globales || '');
    }, [current]);

    const allRowIds = useMemo(() => new Set(Object.keys(rows).map(k => Number(k))), [rows]);

    const setAsistio = useCallback((trabajadorId: number, asistio: boolean) => {
        setRows(prev => ({ ...prev, [trabajadorId]: { ...prev[trabajadorId], asistio } }));
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
                    observacion: '',
                    citado: false,
                    obra_origen_id: w.obra_id,
                };
            });
            return next;
        });
    };

    const handleGuardar = async () => {
        if (!canRegistrar) return;

        setSaving(true);
        const trabajadores = Object.entries(rows).map(([id, r]) => ({
            trabajador_id: Number(id),
            obra_origen_id: r.obra_origen_id,
            asistio: r.asistio,
            observacion: r.observacion || null,
        }));

        const ok = await registrarAsistencia(actividadId, {
            observaciones_globales: observacionesGlobales || null,
            trabajadores,
        });
        setSaving(false);

        if (ok) await fetchDetalle(actividadId);
    };

    const handleCancelar = async () => {
        if (!window.confirm('¿Cancelar esta lista? No se podrá deshacer.')) return;
        const ok = await cancelar(actividadId);
        if (ok) onBack();
    };

    const handleShareLista = async () => {
        if (!current || !canShare) return;
        const text = buildListaMessage(current);
        await prepareAndShareWithToast({
            text,
            title: `Lista ${current.obra_nombre}`,
            toastId: 'actividades-share-lista',
            preparingMessage: 'Preparando la lista...',
            successMessage: '¡Lista preparada!',
            successDescription: 'Pulsa el botón para enviarla por WhatsApp. El mensaje también está en tu portapapeles.',
        });
    };

    const handleShareAsistencia = async () => {
        if (!current || !canShare) return;
        // Si la lista aún no se cerró, sugerir guardar antes
        if (current.estado === 'citada') {
            toast.info('Guarda la asistencia antes de enviarla por WhatsApp.');
            return;
        }
        const text = buildAsistenciaMessage(current);
        await prepareAndShareWithToast({
            text,
            title: `Asistencia ${current.obra_nombre}`,
            toastId: 'actividades-share-asistencia',
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

    const isCancelada = current.estado === 'cancelada';
    const isRealizada = current.estado === 'realizada';
    const totalAsistio = Object.values(rows).filter(r => r.asistio).length;

    return (
        <div className="flex flex-col gap-4 pb-24 md:pb-4">
            {/* Header */}
            <div className="flex items-center gap-3">
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={onBack}
                    leftIcon={<ChevronLeft className="h-4 w-4" />}
                    className="text-sm text-muted-foreground hover:text-brand-dark"
                >
                    Volver
                </Button>
            </div>

            <div className="bg-card border border-border rounded-2xl p-4 md:p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h2 className="text-lg font-black text-brand-dark">{fmtSemana(current.semana)}</h2>
                        <p className="text-xs text-muted-foreground font-semibold mt-0.5">
                            Obra {current.obra_nombre} · Solicitado por {current.creado_por_nombre || '—'}
                        </p>
                    </div>
                    <StatusBadge domain="actividadEstado" status={current.estado} showIcon />
                </div>
            </div>

            {/* Si está cancelada, no mostrar formulario de edición */}
            {isCancelada && (
                <div className="bg-muted border border-border rounded-2xl p-6 text-center text-sm text-muted-foreground">
                    Esta lista fue cancelada y no se puede modificar.
                </div>
            )}

            {!isCancelada && (
                <>
                    {/* Controles globales: observación general (sin horas — jefatura 2026-08-17) */}
                    <div className="bg-card border border-border rounded-2xl p-4 md:p-5">
                        <div className="grid grid-cols-1 gap-4">
                            <div>
                                <label className="text-label font-black uppercase tracking-wider text-brand-dark mb-1.5 block">
                                    Observación general
                                </label>
                                <input
                                    type="text"
                                    value={observacionesGlobales}
                                    onChange={e => setObservacionesGlobales(e.target.value)}
                                    disabled={!canRegistrar}
                                    placeholder="Comentario al final del mensaje WhatsApp..."
                                    className="w-full h-10 px-3 bg-card border border-border rounded-xl text-sm font-medium focus:outline-none focus:border-brand-primary disabled:opacity-60"
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
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setShowAddOther(true)}
                                leftIcon={<Plus className="h-3.5 w-3.5" />}
                                className="text-xs font-bold text-green-700 dark:text-green-300"
                            >
                                Agregar trabajador fuera de la lista
                            </Button>
                        )}
                    </div>

                    {/* Lista filas por cargo */}
                    <div className="flex flex-col gap-3">
                        {grupos.map(({ cargo, items }) => (
                            <div key={cargo} className="border border-border rounded-2xl overflow-hidden bg-card">
                                <div className="bg-brand-primary px-4 py-2.5 flex items-center justify-between">
                                    <span className="text-label font-black uppercase tracking-wider text-white">
                                        {cargo} ({items.length})
                                    </span>
                                </div>
                                <div className="divide-y divide-border">
                                    {items.map(({ trabajadorId, row }) => (
                                        <div key={trabajadorId} className="px-4 py-3 flex flex-wrap items-center gap-3">
                                            <div className="flex-1 min-w-[160px]">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm font-bold text-brand-dark">
                                                        {row.apellido_paterno}{row.apellido_materno ? ` ${row.apellido_materno}` : ''} {row.nombres}
                                                    </span>
                                                    {!row.citado && (
                                                        <Chip tone="info" label="Fuera de la lista" />
                                                    )}
                                                </div>
                                                <div className="text-caption text-muted-foreground font-medium">
                                                    {row.rut}
                                                </div>
                                            </div>

                                            {/* Toggle Asistió / No */}
                                            <div className="flex gap-1 shrink-0">
                                                {/* eslint-disable-next-line no-restricted-syntax -- toggle segmentado Asistió/No con color de estado (emerald/red); Button no soporta el par segmentado */}
                                                <button
                                                    type="button"
                                                    aria-label={`${row.apellido_paterno} ${row.nombres}: marcar asistió`}
                                                    onClick={() => setAsistio(trabajadorId, true)}
                                                    disabled={!canRegistrar}
                                                    className={cn(
                                                        'px-3 h-9 text-label font-bold rounded-lg transition-all',
                                                        row.asistio
                                                            ? 'bg-emerald-700 text-white shadow'
                                                            : 'bg-card border border-border text-muted-foreground'
                                                    )}
                                                >
                                                    Asistió
                                                </button>
                                                {/* eslint-disable-next-line no-restricted-syntax -- toggle segmentado Asistió/No con color de estado (emerald/red); Button no soporta el par segmentado */}
                                                <button
                                                    type="button"
                                                    aria-label={`${row.apellido_paterno} ${row.nombres}: marcar no asistió`}
                                                    onClick={() => setAsistio(trabajadorId, false)}
                                                    disabled={!canRegistrar}
                                                    className={cn(
                                                        'px-3 h-9 text-label font-bold rounded-lg transition-all',
                                                        !row.asistio
                                                            ? 'bg-red-600 text-white shadow'
                                                            : 'bg-card border border-border text-muted-foreground'
                                                    )}
                                                >
                                                    No
                                                </button>
                                            </div>

                                            {/* Observación */}
                                            <input
                                                type="text"
                                                placeholder="Nota..."
                                                aria-label={`Observación para ${row.apellido_paterno} ${row.nombres}`}
                                                value={row.observacion}
                                                onChange={e => setObsRow(trabajadorId, e.target.value)}
                                                disabled={!canRegistrar}
                                                className="flex-1 min-w-[120px] h-9 px-3 bg-card border border-border rounded-lg text-sm font-medium focus:outline-none focus:border-brand-primary disabled:opacity-60"
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Footer acciones */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border">
                        {canCrear && current.estado === 'citada' && (
                            <Button
                                variant="ghost"
                                onClick={handleCancelar}
                                leftIcon={<Ban className="h-4 w-4" />}
                            >
                                Cancelar lista
                            </Button>
                        )}
                        <div className="flex items-center gap-2 ml-auto">
                            {canShare && current.estado === 'citada' && (
                                <Button
                                    variant="secondary"
                                    onClick={handleShareLista}
                                    leftIcon={<MessageCircle className="h-4 w-4" />}
                                >
                                    Enviar lista
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

export default ActividadSugeridaAsistencia;
