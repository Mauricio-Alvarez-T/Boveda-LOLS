import React, { useState, useMemo, useEffect } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Check, Loader2, AlertTriangle, CalendarRange } from 'lucide-react';
import WorkerCalendar from './WorkerCalendar';
import api from '../../services/api';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';
import type { Trabajador, EstadoAsistencia, PeriodoAusencia } from '../../types/entities';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    worker: Trabajador | null;
    estados: EstadoAsistencia[];
    obraId?: number;
    onSuccess?: () => void;
}

export const WorkerCalendarModal: React.FC<Props> = ({
    isOpen,
    onClose,
    worker,
    estados,
    obraId,
    onSuccess,
}) => {
    const { hasPermission } = useAuth();

    // ── Period form state ──
    const [estadoId, setEstadoId] = useState<number | null>(null);
    const [fechaInicio, setFechaInicio] = useState('');
    const [fechaFin, setFechaFin] = useState('');
    const [observacion, setObservacion] = useState('');
    const [loading, setLoading] = useState(false);
    const [existingPeriods, setExistingPeriods] = useState<PeriodoAusencia[]>([]);
    // Incrementar para forzar re-mount de WorkerCalendar después de crear/borrar períodos
    const [calendarKey, setCalendarKey] = useState(0);

    const estadosAusencia = useMemo(() => estados.filter(e => !e.es_presente), [estados]);

    const diasAfectados = useMemo(() => {
        if (!fechaInicio || !fechaFin) return 0;
        const start = new Date(fechaInicio + 'T12:00:00');
        const end = new Date(fechaFin + 'T12:00:00');
        if (end < start) return 0;
        return Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    }, [fechaInicio, fechaFin]);

    const overlappingPeriods = useMemo(() => {
        if (!fechaInicio || !fechaFin) return [];
        return existingPeriods.filter(p => {
            const pStart = String(p.fecha_inicio).split('T')[0];
            const pEnd = String(p.fecha_fin).split('T')[0];
            return pStart <= fechaFin && pEnd >= fechaInicio;
        });
    }, [existingPeriods, fechaInicio, fechaFin]);

    const selectedEstado = estados.find(e => e.id === estadoId);

    // Fetch períodos activos para la detección de superposición
    useEffect(() => {
        if (!isOpen || !worker || !obraId) return;
        api.get(`/asistencias/periodos?trabajador_id=${worker.id}&obra_id=${obraId}&activo=true`)
            .then(res => setExistingPeriods(res.data.data || []))
            .catch(() => setExistingPeriods([]));
    }, [isOpen, worker, obraId]);

    // Reset del formulario al cerrar
    useEffect(() => {
        if (!isOpen) {
            setEstadoId(null);
            setFechaInicio('');
            setFechaFin('');
            setObservacion('');
            setLoading(false);
        }
    }, [isOpen]);

    const refreshPeriods = () => {
        if (!worker || !obraId) return;
        api.get(`/asistencias/periodos?trabajador_id=${worker.id}&obra_id=${obraId}&activo=true`)
            .then(res => setExistingPeriods(res.data.data || []))
            .catch(() => {});
    };

    const handleSubmit = async () => {
        if (!hasPermission('asistencia.periodo.crear')) {
            toast.error('No tienes permisos para crear períodos de ausencia');
            return;
        }
        if (!worker || !obraId || !estadoId || !fechaInicio || !fechaFin) {
            toast.error('Completa todos los campos requeridos');
            return;
        }
        setLoading(true);
        try {
            const res = await api.post('/asistencias/periodos', {
                trabajador_id: worker.id,
                obra_id: obraId,
                estado_id: estadoId,
                fecha_inicio: fechaInicio,
                fecha_fin: fechaFin,
                observacion: observacion || null,
            });
            const data = res.data.data;
            toast.success(`Período asignado: ${data.dias_afectados} días actualizados`, { duration: 4000 });

            setEstadoId(null);
            setFechaInicio('');
            setFechaFin('');
            setObservacion('');

            refreshPeriods();
            setCalendarKey(k => k + 1);
            onSuccess?.();
        } catch (err: any) {
            toast.error(err?.response?.data?.error || 'Error al crear el período');
        } finally {
            setLoading(false);
        }
    };

    if (!worker) return null;

    const isValid = !!(estadoId && fechaInicio && fechaFin && diasAfectados > 0);

    const modalTitle = (
        <div className="flex flex-col min-w-0 pr-8">
            <span className="text-[10px] uppercase font-black text-brand-dark/40 tracking-widest leading-none mb-1">
                Calendario de Asistencia
            </span>
            <div className="flex items-center gap-2">
                <h3 className="text-sm md:text-base font-bold text-brand-dark truncate">
                    {worker.apellido_paterno} {worker.apellido_materno || ''} {worker.nombres}
                </h3>
                <span className="hidden md:inline px-1.5 py-0.5 rounded-md bg-brand-primary/10 text-brand-dark text-[10px] font-bold">
                    {worker.rut}
                </span>
            </div>
        </div>
    );

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={modalTitle} size="dynamic">
            <div className="flex flex-col">
                {/* ── Calendario ── */}
                <WorkerCalendar
                    key={calendarKey}
                    worker={worker}
                    estados={estados}
                    obraId={obraId}
                    showLegend={false}
                    onSelectRange={(start, end) => {
                        setFechaInicio(start);
                        setFechaFin(end);
                    }}
                    onPeriodDeleted={() => {
                        refreshPeriods();
                        setCalendarKey(k => k + 1);
                        onSuccess?.();
                    }}
                />

                {/* ── Formulario de asignación de período ── */}
                {obraId && (
                    <div className="border-t border-border mt-4 pt-5">
                        <div className="flex items-center gap-2 mb-4">
                            <CalendarRange className="h-4 w-4 text-brand-primary" />
                            <span className="text-xs font-black text-brand-dark/60 uppercase tracking-widest">
                                Asignar Período
                            </span>
                        </div>

                        {/* Layout de dos columnas: estados a la izquierda, formulario a la derecha */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-start">
                            {/* ── Columna izquierda: Estado de ausencia (lista vertical) ── */}
                            <div>
                                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
                                    Estado de ausencia
                                </label>
                                <div className="grid grid-cols-1 gap-2">
                                    {estadosAusencia.map(est => (
                                        <button
                                            key={est.id}
                                            onClick={() => setEstadoId(est.id)}
                                            className={`p-3 rounded-xl border-2 text-left transition-all ${
                                                estadoId === est.id
                                                    ? 'border-current shadow-lg scale-[1.02]'
                                                    : 'border-border hover:border-border'
                                            }`}
                                            style={
                                                estadoId === est.id
                                                    ? { borderColor: est.color, backgroundColor: `${est.color}08` }
                                                    : {}
                                            }
                                        >
                                            <div className="flex items-center gap-2">
                                                <span
                                                    className="w-3 h-3 rounded-full shrink-0"
                                                    style={{ backgroundColor: est.color }}
                                                />
                                                <span className="text-sm font-semibold text-brand-dark">
                                                    {est.nombre}
                                                </span>
                                                <span className="text-[10px] text-muted-foreground font-medium ml-auto">
                                                    {est.codigo}
                                                </span>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* ── Columna derecha: fechas + preview + observación + confirmar ── */}
                            <div className="flex flex-col gap-4">
                                {/* Date range */}
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
                                            Fecha inicio
                                        </label>
                                        <input
                                            type="date"
                                            value={fechaInicio}
                                            onChange={e => setFechaInicio(e.target.value)}
                                            className="w-full px-3 py-2.5 rounded-xl border border-border bg-card text-sm font-medium text-brand-dark focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
                                            Fecha fin
                                        </label>
                                        <input
                                            type="date"
                                            value={fechaFin}
                                            onChange={e => setFechaFin(e.target.value)}
                                            min={fechaInicio}
                                            className="w-full px-3 py-2.5 rounded-xl border border-border bg-card text-sm font-medium text-brand-dark focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary"
                                        />
                                    </div>
                                </div>

                                {/* Preview badge */}
                                {diasAfectados > 0 && selectedEstado && (
                                    <div
                                        className="p-3 rounded-xl border flex items-center gap-3"
                                        style={{
                                            borderColor: `${selectedEstado.color}40`,
                                            backgroundColor: `${selectedEstado.color}08`,
                                        }}
                                    >
                                        <div
                                            className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-sm font-bold shrink-0"
                                            style={{ backgroundColor: selectedEstado.color }}
                                        >
                                            {diasAfectados}
                                        </div>
                                        <div>
                                            <p className="text-sm font-semibold text-brand-dark">
                                                {diasAfectados} día{diasAfectados > 1 ? 's' : ''} de {selectedEstado.nombre}
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                                {fechaInicio.split('-').reverse().join('/')} →{' '}
                                                {fechaFin.split('-').reverse().join('/')}
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {/* Overlap warning */}
                                {overlappingPeriods.length > 0 && (
                                    <div className="p-3 rounded-xl bg-warning/10 border border-warning/30">
                                        <div className="flex items-start gap-2">
                                            <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
                                            <div>
                                                <p className="text-xs font-bold text-warning">Superposición detectada</p>
                                                <p className="text-xs text-muted-foreground mt-1">
                                                    {overlappingPeriods.length === 1
                                                        ? 'Un período existente'
                                                        : `${overlappingPeriods.length} períodos existentes`}{' '}
                                                    se superpone{overlappingPeriods.length > 1 ? 'n' : ''} con este rango y será
                                                    {overlappingPeriods.length > 1 ? 'n' : ''} reemplazado
                                                    {overlappingPeriods.length > 1 ? 's' : ''}:
                                                </p>
                                                {overlappingPeriods.map(p => (
                                                    <p key={p.id} className="text-xs text-muted-foreground mt-0.5">
                                                        • {p.estado_nombre} (
                                                        {String(p.fecha_inicio).split('T')[0].split('-').reverse().join('/')} al{' '}
                                                        {String(p.fecha_fin).split('T')[0].split('-').reverse().join('/')})
                                                    </p>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Observación */}
                                <div>
                                    <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
                                        Observación <span className="font-normal">(opcional)</span>
                                    </label>
                                    <textarea
                                        value={observacion}
                                        onChange={e => setObservacion(e.target.value)}
                                        placeholder="Ej: Licencia médica presentada el día..."
                                        rows={2}
                                        className="w-full px-3 py-2.5 rounded-xl border border-border bg-card text-sm text-brand-dark resize-none focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary"
                                    />
                                </div>

                                {/* Confirmar */}
                                <Button
                                    onClick={handleSubmit}
                                    disabled={!isValid || loading || !hasPermission('asistencia.periodo.crear')}
                                    className="w-full"
                                >
                                    {loading ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <>
                                            <Check className="h-4 w-4 mr-2" />
                                            Confirmar Período
                                        </>
                                    )}
                                </Button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </Modal>
    );
};
