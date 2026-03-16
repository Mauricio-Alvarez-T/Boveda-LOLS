import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CalendarRange, AlertTriangle, Check, Loader2, ChevronLeft } from 'lucide-react';
import { Button } from '../ui/Button';
import api from '../../services/api';
import type { Trabajador, EstadoAsistencia, PeriodoAusencia } from '../../types/entities';
import { toast } from 'sonner';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    worker: Trabajador | null;
    obraId: number | null;
    estados: EstadoAsistencia[];
    onSuccess: () => void;
    initialDates?: { start: string; end: string } | null;
}

export const PeriodAssignModal: React.FC<Props> = ({ isOpen, onClose, worker, obraId, estados, onSuccess, initialDates }) => {
    const [estadoId, setEstadoId] = useState<number | null>(null);
    const [fechaInicio, setFechaInicio] = useState('');
    const [fechaFin, setFechaFin] = useState('');
    const [observacion, setObservacion] = useState('');
    const [loading, setLoading] = useState(false);
    const [existingPeriods, setExistingPeriods] = useState<PeriodoAusencia[]>([]);
    const [loadingPeriods, setLoadingPeriods] = useState(false);

    // Filtrar solo estados de ausencia (no presente)
    const estadosAusencia = useMemo(() => estados.filter(e => !e.es_presente), [estados]);

    // Calcular días afectados
    const diasAfectados = useMemo(() => {
        if (!fechaInicio || !fechaFin) return 0;
        const start = new Date(fechaInicio + 'T12:00:00');
        const end = new Date(fechaFin + 'T12:00:00');
        if (end < start) return 0;
        return Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    }, [fechaInicio, fechaFin]);

    React.useEffect(() => {
        if (!isOpen || !worker || !obraId) return;
        setLoadingPeriods(true);
        api.get(`/asistencias/periodos?trabajador_id=${worker.id}&obra_id=${obraId}&activo=true`)
            .then(res => setExistingPeriods(res.data.data || []))
            .catch(() => setExistingPeriods([]))
            .finally(() => setLoadingPeriods(false));

        if (initialDates) {
            setFechaInicio(initialDates.start);
            setFechaFin(initialDates.end);
        } else {
            setFechaInicio('');
            setFechaFin('');
        }
    }, [isOpen, worker, obraId, initialDates]);

    // Detectar superposición
    const overlappingPeriods = useMemo(() => {
        if (!fechaInicio || !fechaFin) return [];
        return existingPeriods.filter(p => {
            const pStart = p.fecha_inicio;
            const pEnd = p.fecha_fin;
            return pStart <= fechaFin && pEnd >= fechaInicio;
        });
    }, [existingPeriods, fechaInicio, fechaFin]);

    const selectedEstado = estados.find(e => e.id === estadoId);

    const handleSubmit = async () => {
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
                observacion: observacion || null
            });

            const data = res.data.data;
            toast.success(`Período asignado: ${data.dias_afectados} días actualizados`, { duration: 4000 });
            
            // Reset form
            setEstadoId(null);
            setFechaInicio('');
            setFechaFin('');
            setObservacion('');
            
            onSuccess();
            onClose();
        } catch (err: any) {
            toast.error(err?.response?.data?.error || 'Error al crear el período');
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen || !worker) return null;

    const isValid = estadoId && fechaInicio && fechaFin && diasAfectados > 0;

    const modalContentNodes = (
        <>
            {/* Estado selector */}
            <div className="mb-5">
                <label className="block text-xs font-bold text-[#86868B] uppercase tracking-wider mb-2">
                    Estado de ausencia
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {estadosAusencia.map(est => (
                        <button
                            key={est.id}
                            onClick={() => setEstadoId(est.id)}
                            className={`p-3 rounded-xl border-2 text-left transition-all ${
                                estadoId === est.id
                                    ? 'border-current shadow-lg scale-[1.02]'
                                    : 'border-[#E8E8ED] hover:border-border'
                            }`}
                            style={estadoId === est.id ? { borderColor: est.color, backgroundColor: `${est.color}08` } : {}}
                        >
                            <div className="flex items-center gap-2">
                                <span
                                    className="w-3 h-3 rounded-full shrink-0"
                                    style={{ backgroundColor: est.color }}
                                />
                                <span className="text-sm font-semibold text-brand-dark">{est.nombre}</span>
                            </div>
                            <span className="text-[10px] text-[#86868B] font-medium mt-0.5 block">{est.codigo}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Date range */}
            <div className="grid grid-cols-2 gap-3 mb-5">
                <div>
                    <label className="block text-xs font-bold text-[#86868B] uppercase tracking-wider mb-2">
                        Fecha inicio
                    </label>
                    <input
                        type="date"
                        value={fechaInicio}
                        onChange={e => setFechaInicio(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl border border-border bg-white text-sm font-medium text-brand-dark focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary"
                    />
                </div>
                <div>
                    <label className="block text-xs font-bold text-[#86868B] uppercase tracking-wider mb-2">
                        Fecha fin
                    </label>
                    <input
                        type="date"
                        value={fechaFin}
                        onChange={e => setFechaFin(e.target.value)}
                        min={fechaInicio}
                        className="w-full px-3 py-2.5 rounded-xl border border-border bg-white text-sm font-medium text-brand-dark focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary"
                    />
                </div>
            </div>

            {/* Preview badge */}
            {diasAfectados > 0 && selectedEstado && (
                <div
                    className="mb-5 p-3 rounded-xl border flex items-center gap-3"
                    style={{ borderColor: `${selectedEstado.color}40`, backgroundColor: `${selectedEstado.color}08` }}
                >
                    <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-sm font-bold"
                        style={{ backgroundColor: selectedEstado.color }}
                    >
                        {diasAfectados}
                    </div>
                    <div>
                        <p className="text-sm font-semibold text-brand-dark">
                            {diasAfectados} día{diasAfectados > 1 ? 's' : ''} de {selectedEstado.nombre}
                        </p>
                        <p className="text-xs text-muted-foreground">
                            {fechaInicio.split('-').reverse().join('/')} → {fechaFin.split('-').reverse().join('/')}
                        </p>
                    </div>
                </div>
            )}

            {/* Overlap warning */}
            {overlappingPeriods.length > 0 && (
                <div className="mb-5 p-3 rounded-xl bg-warning/10 border border-warning/30">
                    <div className="flex items-start gap-2">
                        <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
                        <div>
                            <p className="text-xs font-bold text-warning">Superposición detectada</p>
                            <p className="text-xs text-[#86868B] mt-1">
                                {overlappingPeriods.length === 1 ? 'Un período existente' : `${overlappingPeriods.length} períodos existentes`} se
                                superpone{overlappingPeriods.length > 1 ? 'n' : ''} con este rango y será{overlappingPeriods.length > 1 ? 'n' : ''} reemplazado{overlappingPeriods.length > 1 ? 's' : ''}:
                            </p>
                            {overlappingPeriods.map(p => (
                                <p key={p.id} className="text-xs text-muted-foreground mt-0.5">
                                    • {p.estado_nombre} ({p.fecha_inicio.split('T')[0].split('-').reverse().join('/')} al {p.fecha_fin.split('T')[0].split('-').reverse().join('/')})
                                </p>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Observacion */}
            <div className="mb-5">
                <label className="block text-xs font-bold text-[#86868B] uppercase tracking-wider mb-2">
                    Observación <span className="font-normal">(opcional)</span>
                </label>
                <textarea
                    value={observacion}
                    onChange={e => setObservacion(e.target.value)}
                    placeholder="Ej: Licencia médica presentada el día..."
                    rows={2}
                    className="w-full px-3 py-2.5 rounded-xl border border-border bg-white text-sm text-brand-dark resize-none focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary"
                />
            </div>

            {/* Existing periods list */}
            {existingPeriods.length > 0 && (
                <div className="mb-5">
                    <label className="block text-xs font-bold text-[#86868B] uppercase tracking-wider mb-2">
                        Períodos activos
                    </label>
                    <div className="space-y-1.5 max-h-32 overflow-y-auto">
                        {existingPeriods.map(p => (
                            <div key={p.id} className="flex items-center gap-2 p-2 rounded-lg bg-background text-xs">
                                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: p.estado_color }} />
                                <span className="font-medium text-brand-dark">{p.estado_nombre}</span>
                                <span className="text-[#86868B]">
                                    {p.fecha_inicio.split('T')[0].split('-').reverse().join('/')} al {p.fecha_fin.split('T')[0].split('-').reverse().join('/')}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Submit */}
            <Button
                onClick={handleSubmit}
                disabled={!isValid || loading}
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
        </>
    );

    return (
        <AnimatePresence>
            {/* MOBILE: Fullscreen */}
            <div className="md:hidden fixed inset-0 z-[60] flex flex-col bg-white">
                <motion.div
                    initial={{ opacity: 0, x: 60 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 60 }}
                    transition={{ type: 'spring', damping: 28, stiffness: 300 }}
                    className="flex flex-col h-full"
                >
                    <div className="flex items-center gap-3 px-4 py-3 border-b border-[#E8E8ED] bg-white/80 backdrop-blur-xl shrink-0">
                        <button onClick={onClose} className="flex items-center gap-1 text-brand-primary text-sm font-medium">
                            <ChevronLeft className="h-5 w-5" />
                            <span>Volver</span>
                        </button>
                        <div className="flex-1 text-center pr-12">
                            <h3 className="text-base font-semibold text-brand-dark flex items-center justify-center gap-2">
                                <CalendarRange className="h-4 w-4 text-brand-primary" />
                                Asignar Período
                            </h3>
                        </div>
                    </div>
                    <div className="px-4 py-3 bg-background border-b border-[#E8E8ED] shrink-0">
                        <p className="text-sm font-semibold text-brand-dark">{worker.nombres} {worker.apellido_paterno}</p>
                        <p className="text-xs text-muted-foreground">{worker.rut}</p>
                    </div>
                    <div className="flex-1 overflow-y-auto px-4 py-4">
                        {modalContentNodes}
                    </div>
                </motion.div>
            </div>

            {/* DESKTOP: Centered card */}
            <div className="hidden md:flex fixed inset-0 z-[60] items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 10 }}
                    className="bg-white/90 backdrop-blur-xl rounded-3xl shadow-2xl w-full max-w-2xl border border-white/20 overflow-hidden flex flex-col max-h-[90vh]"
                >
                    <div className="flex items-center justify-between p-5 border-b border-[#E8E8ED]">
                        <div>
                            <h2 className="text-lg font-bold text-brand-dark flex items-center gap-2">
                                <CalendarRange className="h-5 w-5 text-brand-primary" />
                                Asignar Período
                            </h2>
                            <p className="text-sm text-muted-foreground mt-1">
                                {worker.nombres} {worker.apellido_paterno} · {worker.rut}
                            </p>
                        </div>
                        <Button variant="ghost" size="icon" onClick={onClose}>
                            <X className="h-5 w-5" />
                        </Button>
                    </div>
                    <div className="p-6 overflow-y-auto">
                        {modalContentNodes}
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};
