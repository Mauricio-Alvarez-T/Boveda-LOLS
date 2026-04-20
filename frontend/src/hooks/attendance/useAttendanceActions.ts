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
    updateAttendance?: (workerId: number, data: Partial<Asistencia>) => void;
}

export function useAttendanceActions({
    date,
    workers,
    attendance,
    feriadoActual,
    fetchAttendanceInfo,
    updateAttendance
}: UseAttendanceActionsProps) {
    const { selectedObra } = useObra();
    const { hasPermission } = useAuth();
    const [saving, setSaving] = useState(false);
    const [repeating, setRepeating] = useState(false);

    // Track the latest data for action callbacks via ref to avoid dependency cycles
    const latestData = useRef({ selectedObra, date, workers, attendance, feriadoActual, updateAttendance });
    useEffect(() => {
        latestData.current = { selectedObra, date, workers, attendance, feriadoActual, updateAttendance };
    }, [selectedObra, date, workers, attendance, feriadoActual, updateAttendance]);

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

    /**
     * "Repetir día anterior": busca el último día laboral con asistencia
     * registrada en el mismo contexto (obra o global) y precarga el estado
     * en todos los trabajadores visibles. No guarda automáticamente — el
     * usuario revisa y aprieta Guardar.
     */
    const repetirDiaAnterior = useCallback(async () => {
        const {
            selectedObra: currentObra,
            date: currentDate,
            workers: currentWorkers,
            feriadoActual: currentFeriado,
            updateAttendance: currentUpdate
        } = latestData.current;

        if (!currentUpdate) return;
        if (currentFeriado) { toast.error('Hoy es feriado — no se puede registrar asistencia'); return; }
        const currentDow = new Date(currentDate + 'T12:00:00').getDay();
        if (currentDow === 0 || currentDow === 6) { toast.error('Fin de semana — no se puede registrar asistencia'); return; }
        if (!hasPermission('asistencia.guardar')) return;

        const isGlobal = !currentObra;
        const globalObraId = isGlobal ? 'ALL' : currentObra.id;

        // Buscar hasta 7 días hacia atrás el último día laboral con registros.
        const formatDate = (d: Date) => d.toISOString().split('T')[0];
        let foundDate: string | null = null;
        let foundRegistros: any[] = [];
        const base = new Date(currentDate + 'T12:00:00');

        setRepeating(true);
        try {
            for (let offset = 1; offset <= 7; offset++) {
                const probe = new Date(base);
                probe.setDate(probe.getDate() - offset);
                const dow = probe.getDay();
                if (dow === 0 || dow === 6) continue; // saltar fines de semana
                const prevDateStr = formatDate(probe);
                try {
                    const res = await api.get(`/asistencias/obra/${globalObraId}?fecha=${prevDateStr}`);
                    const data = res.data?.data;
                    if (data?.feriado) continue;
                    const regs: any[] = data?.registros || [];
                    if (regs.length > 0) {
                        foundDate = prevDateStr;
                        foundRegistros = regs;
                        break;
                    }
                } catch {
                    /* ignorar y seguir probando */
                }
            }

            if (!foundDate) {
                toast.error('No se encontró asistencia en los últimos 7 días');
                return;
            }

            // Map por trabajador_id
            const prevMap = new Map<number, any>();
            for (const r of foundRegistros) prevMap.set(r.trabajador_id, r);

            // Filtrar trabajadores válidos hoy (no finiquitados, ya contratados)
            const validToday = currentWorkers.filter(w => {
                const fIngreso = w.fecha_ingreso ? String(w.fecha_ingreso).split('T')[0] : null;
                const fDesvinc = w.fecha_desvinculacion ? String(w.fecha_desvinculacion).split('T')[0] : null;
                const isDesvinculado = fDesvinc ? currentDate > fDesvinc : false;
                const isPreContrato = fIngreso ? currentDate < fIngreso : false;
                return !isDesvinculado && !isPreContrato;
            });

            const isCurrentSaturday = currentDow === 6;
            let applied = 0;
            for (const w of validToday) {
                const prev = prevMap.get(w.id);
                if (!prev || !prev.estado_id) continue;
                currentUpdate(w.id, {
                    estado_id: prev.estado_id,
                    tipo_ausencia_id: prev.tipo_ausencia_id ?? null,
                    observacion: prev.observacion || '',
                    hora_entrada: prev.hora_entrada || null,
                    hora_salida: prev.hora_salida || null,
                    hora_colacion_inicio: prev.hora_colacion_inicio || null,
                    hora_colacion_fin: prev.hora_colacion_fin || null,
                    horas_extra: prev.horas_extra || 0,
                    es_sabado: isCurrentSaturday
                });
                applied++;
            }

            if (applied === 0) {
                toast.warning(`Día ${foundDate} encontrado pero no hay coincidencias con trabajadores actuales`);
            } else {
                toast.success(`Estado copiado desde ${foundDate} (${applied} trabajadores). Revisa y guarda.`);
            }
        } finally {
            setRepeating(false);
        }
    }, [hasPermission]);

    return {
        saving,
        handleSave,
        toggleFeriado,
        repetirDiaAnterior,
        repeating
    };
}
