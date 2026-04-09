import { useState, useCallback, useRef, useEffect } from 'react';
import { toast } from 'sonner';
import { useObra } from '../../context/ObraContext';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import type { Trabajador, Asistencia, Feriado } from '../../types/entities';

interface UseAttendanceActionsProps {
    date: string;
    workers: Trabajador[];
    attendance: Record<number, Partial<Asistencia>>;
    feriadoActual: Feriado | null;
    fetchAttendanceInfo: () => Promise<void>;
}

export function useAttendanceActions({
    date,
    workers,
    attendance,
    feriadoActual,
    fetchAttendanceInfo
}: UseAttendanceActionsProps) {
    const { selectedObra } = useObra();
    const { hasPermission } = useAuth();
    const [saving, setSaving] = useState(false);

    // Track the latest data for action callbacks via ref to avoid dependency cycles
    const latestData = useRef({ selectedObra, date, workers, attendance, feriadoActual });
    useEffect(() => {
        latestData.current = { selectedObra, date, workers, attendance, feriadoActual };
    }, [selectedObra, date, workers, attendance, feriadoActual]);

    const handleSave = useCallback(async () => {
        const { selectedObra: currentObra, date: currentDate, workers: currentWorkers, attendance: currentAttendance } = latestData.current;
        const isGlobal = !currentObra;
        if (isGlobal && !hasPermission('asistencia.tomar.global')) return;

        setSaving(true);
        try {
            const validWorkers = currentWorkers.filter(w => {
                const fIngreso = w.fecha_ingreso ? String(w.fecha_ingreso).split('T')[0] : null;
                const fDesvinc = w.fecha_desvinculacion ? String(w.fecha_desvinculacion).split('T')[0] : null;
                const isDesvinculado = fDesvinc ? currentDate > fDesvinc : false;
                const isPreContrato = fIngreso ? currentDate < fIngreso : false;
                return !isDesvinculado && !isPreContrato;
            });

            const globalObraId = isGlobal ? 'ALL' : currentObra.id;

            const payload = {
                obra_id: globalObraId,
                registros: validWorkers.map(w => ({
                    trabajador_id: w.id,
                    obra_id: isGlobal ? w.obra_id : currentObra.id,
                    fecha: currentDate,
                    estado_id: currentAttendance[w.id]?.estado_id || null,
                    observacion: currentAttendance[w.id]?.observacion || '',
                    hora_entrada: currentAttendance[w.id]?.hora_entrada || null,
                    hora_salida: currentAttendance[w.id]?.hora_salida || null,
                    hora_colacion_inicio: currentAttendance[w.id]?.hora_colacion_inicio || null,
                    hora_colacion_fin: currentAttendance[w.id]?.hora_colacion_fin || null,
                    horas_extra: currentAttendance[w.id]?.horas_extra || 0,
                    es_sabado: currentAttendance[w.id]?.es_sabado || false
                }))
            };

            await api.post(`/asistencias/bulk/${globalObraId}`, payload);
            toast.success('Asistencia guardada correctamente');
            fetchAttendanceInfo();
        } catch (error) {
            console.error('Error saving attendance', error);
            toast.error('Error al guardar la asistencia');
        } finally {
            setSaving(false);
        }
    }, [fetchAttendanceInfo, hasPermission]);

    const toggleFeriado = useCallback(async () => {
        const { selectedObra: currentObra, feriadoActual: currentFeriado, date: currentDate } = latestData.current;
        if (!currentObra || !hasPermission('asistencia.feriado.gestionar')) return;

        if (currentFeriado) {
            if (window.confirm(`¿Seguro que deseas quitar el feriado "${currentFeriado.nombre}"?`)) {
                try {
                    await api.delete(`/feriados/${currentFeriado.id}`);
                    toast.success('Día habilitado (Feriado eliminado)');
                    fetchAttendanceInfo();
                } catch (err) {
                    toast.error('Error al quitar feriado');
                }
            }
        } else {
            const nombre = window.prompt('Ingrese el nombre del feriado:', 'Feriado Local');
            if (nombre) {
                try {
                    await api.post('/feriados', {
                        fecha: currentDate,
                        nombre: nombre,
                        tipo: 'nacional',
                        irrenunciable: false
                    });
                    toast.success(`Día marcado como feriado: ${nombre}`);
                    fetchAttendanceInfo();
                } catch (err) {
                    toast.error('Error al marcar feriado');
                }
            }
        }
    }, [hasPermission, fetchAttendanceInfo]);

    return {
        saving,
        handleSave,
        toggleFeriado
    };
}
