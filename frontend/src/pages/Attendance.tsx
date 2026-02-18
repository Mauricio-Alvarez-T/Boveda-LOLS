import React, { useState, useEffect } from 'react';
import {
    CheckSquare,
    Users,
    Save,
    Loader2,
    CheckCircle2,
    XCircle,
    Clock,
    Stethoscope,
    ChevronLeft,
    ChevronRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import api from '../services/api';
import type { Trabajador, Asistencia, AsistenciaEstado, TipoAusencia } from '../types/entities';
import type { ApiResponse } from '../types';
import { cn } from '../utils/cn';

import { useObra } from '../context/ObraContext';

const AttendancePage: React.FC = () => {
    const { selectedObra } = useObra();
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [workers, setWorkers] = useState<Trabajador[]>([]);
    const [attendance, setAttendance] = useState<Record<number, Partial<Asistencia>>>({});
    const [absenceTypes, setAbsenceTypes] = useState<TipoAusencia[]>([]);

    useEffect(() => {
        const fetchAbsenceTypes = async () => {
            try {
                const res = await api.get<ApiResponse<TipoAusencia[]>>('/tipos-ausencia?activo=true');
                setAbsenceTypes(res.data.data);
            } catch (err) {
                console.error('Error absence types');
            }
        };
        fetchAbsenceTypes();
    }, []);

    const fetchAttendanceInfo = async () => {
        if (!selectedObra) return;
        setLoading(true);
        try {
            // 1. Get workers for this obra
            const workersRes = await api.get<ApiResponse<Trabajador[]>>(`/trabajadores?obra_id=${selectedObra.id}`);
            const workerList = workersRes.data.data;
            setWorkers(workerList);

            // 2. Get existing attendance for this date/obra
            const attendanceRes = await api.get<ApiResponse<Asistencia[]>>(`/asistencias/obra/${selectedObra.id}?fecha=${date}`);
            const existing = attendanceRes.data.data;

            // 3. Merge: Default to 'Presente' if no record exists
            const newAttendance: Record<number, Partial<Asistencia>> = {};
            workerList.forEach(w => {
                const record = existing.find(a => a.trabajador_id === w.id);
                if (record) {
                    newAttendance[w.id] = record;
                } else {
                    newAttendance[w.id] = {
                        trabajador_id: w.id,
                        obra_id: selectedObra.id,
                        fecha: date,
                        estado: 'Presente',
                        tipo_ausencia_id: null,
                        observacion: ''
                    };
                }
            });
            setAttendance(newAttendance);
        } catch (err) {
            toast.error('Error al cargar datos de asistencia');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAttendanceInfo();
    }, [selectedObra, date]);

    const updateAttendance = (workerId: number, data: Partial<Asistencia>) => {
        setAttendance(prev => ({
            ...prev,
            [workerId]: { ...prev[workerId], ...data }
        }));
    };

    const handleSave = async () => {
        if (!selectedObra) return;
        setSaving(true);
        try {
            const payload = Object.values(attendance);
            await api.post(`/asistencias/bulk/${selectedObra.id}`, { registros: payload });
            toast.success('Asistencia guardada correctamente');
            fetchAttendanceInfo();
        } catch (err) {
            toast.error('Error al guardar asistencia');
        } finally {
            setSaving(false);
        }
    };

    const statusConfig: Record<AsistenciaEstado, { icon: any, color: string, bg: string, border: string }> = {
        'Presente': { icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
        'Ausente': { icon: XCircle, color: 'text-rose-400', bg: 'bg-rose-500/10', border: 'border-rose-500/20' },
        'Atraso': { icon: Clock, color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
        'Licencia': { icon: Stethoscope, color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20' },
    };

    if (!selectedObra) {
        return (
            <div className="h-[50vh] flex flex-col items-center justify-center text-center p-8">
                <div className="h-16 w-16 bg-white/5 rounded-full flex items-center justify-center mb-4">
                    <CheckSquare className="h-8 w-8 text-muted-foreground" />
                </div>
                <h2 className="text-xl font-bold text-white">Selecciona una Obra</h2>
                <p className="text-muted-foreground mt-2 max-w-md">
                    Para gestionar la asistencia, primero debes seleccionar una obra en el menú superior.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                        <CheckSquare className="h-8 w-8 text-brand-primary" />
                        Control de Asistencia
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        Registrando asistencia para <span className="text-white font-semibold">{selectedObra.nombre}</span>
                    </p>
                </div>
                <Button
                    onClick={handleSave}
                    isLoading={saving}
                    disabled={loading || workers.length === 0}
                    leftIcon={<Save className="h-5 w-5" />}
                >
                    Guardar Cambios
                </Button>
            </div>

            {/* Control Bar */}
            <div className="premium-card p-4 flex flex-col md:flex-row gap-4 items-center">
                <div className="flex-1 w-full md:w-auto">
                    <Input
                        label="Fecha"
                        type="date"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                    />
                </div>
                <div className="flex gap-2 self-end mb-1">
                    <Button variant="glass" size="icon" onClick={() => {
                        const d = new Date(date);
                        d.setDate(d.getDate() - 1);
                        setDate(d.toISOString().split('T')[0]);
                    }}>
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button variant="glass" size="icon" onClick={() => {
                        const d = new Date(date);
                        d.setDate(d.getDate() + 1);
                        setDate(d.toISOString().split('T')[0]);
                    }}>
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            {/* Attendance Grid */}
            {loading ? (
                <div className="py-20 flex flex-col items-center justify-center">
                    <Loader2 className="h-10 w-10 animate-spin text-brand-primary" />
                    <p className="text-muted-foreground mt-4">Cargando nómina...</p>
                </div>
            ) : workers.length === 0 ? (
                <div className="premium-card py-20 text-center">
                    <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-20" />
                    <p className="text-muted-foreground">No hay trabajadores asignados a esta obra.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    <AnimatePresence>
                        {workers.map((worker) => {
                            const state = attendance[worker.id] || {};
                            const config = statusConfig[state.estado as AsistenciaEstado] || statusConfig['Presente'];
                            const Icon = config.icon;

                            return (
                                <motion.div
                                    key={worker.id}
                                    layout
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    className={cn(
                                        "premium-card p-4 flex flex-col gap-4 border-2 transition-all",
                                        config.border,
                                        config.bg
                                    )}
                                >
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-bold text-white truncate">{worker.nombres} {worker.apellido_paterno}</p>
                                            <p className="text-[10px] text-muted-foreground">{worker.rut}</p>
                                        </div>
                                        <div className={cn("p-2 rounded-lg bg-white/5", config.color)}>
                                            <Icon className="h-5 w-5" />
                                        </div>
                                    </div>

                                    {/* Toggle States */}
                                    <div className="grid grid-cols-4 gap-1">
                                        {(['Presente', 'Atraso', 'Ausente', 'Licencia'] as AsistenciaEstado[]).map((st) => {
                                            const cfg = statusConfig[st];
                                            const StIcon = cfg.icon;
                                            const isActive = state.estado === st;
                                            return (
                                                <button
                                                    key={st}
                                                    onClick={() => updateAttendance(worker.id, {
                                                        estado: st,
                                                        tipo_ausencia_id: st === 'Presente' ? null : state.tipo_ausencia_id
                                                    })}
                                                    className={cn(
                                                        "flex flex-col items-center justify-center p-2 rounded-xl border transition-all gap-1",
                                                        isActive
                                                            ? "bg-white text-slate-950 border-white shadow-lg"
                                                            : "bg-white/5 border-white/5 text-muted-foreground hover:bg-white/10"
                                                    )}
                                                >
                                                    <StIcon className="h-4 w-4" />
                                                    <span className="text-[8px] font-bold uppercase">{st}</span>
                                                </button>
                                            );
                                        })}
                                    </div>

                                    {/* Reason for absence if not Present */}
                                    {state.estado !== 'Presente' && (
                                        <motion.div
                                            initial={{ opacity: 0, height: 0 }}
                                            animate={{ opacity: 1, height: 'auto' }}
                                            className="space-y-2 mt-2"
                                        >
                                            {state.estado === 'Ausente' || state.estado === 'Licencia' ? (
                                                <select
                                                    className="w-full bg-black/20 border border-white/10 rounded-lg p-2 text-[10px] text-white focus:outline-none focus:border-brand-primary"
                                                    value={state.tipo_ausencia_id || ''}
                                                    onChange={(e) => updateAttendance(worker.id, { tipo_ausencia_id: e.target.value ? Number(e.target.value) : null })}
                                                >
                                                    <option value="">Causa (Opcional)...</option>
                                                    {absenceTypes.map(t => (
                                                        <option key={t.id} value={t.id}>{t.nombre}</option>
                                                    ))}
                                                </select>
                                            ) : null}
                                            <input
                                                placeholder="Observación..."
                                                className="w-full bg-black/20 border border-white/10 rounded-lg p-2 text-[10px] text-white focus:outline-none focus:border-brand-primary"
                                                value={state.observacion || ''}
                                                onChange={(e) => updateAttendance(worker.id, { observacion: e.target.value })}
                                            />
                                        </motion.div>
                                    )}
                                </motion.div>
                            );
                        })}
                    </AnimatePresence>
                </div>
            )}
        </div>
    );
};

export default AttendancePage;
