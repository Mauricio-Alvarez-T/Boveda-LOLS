import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import api from '../../services/api';
import type {
    ActividadSugeridaResumen,
    ActividadSugeridaDetalle,
    CrearListaPayload,
    EditarListaPayload,
    RegistrarAsistenciaPayload,
} from '../../types/actividadesSugeridas';

/**
 * Hook para operar sobre /api/actividades-sugeridas (lista de trabajadores en
 * actividades sugeridas, por obra y semana). No persiste estado entre vistas;
 * el componente que lo monta es responsable de invocar fetchList/fetchDetalle.
 */
export function useActividadesSugeridas() {
    const today = new Date();
    const [list, setList] = useState<ActividadSugeridaResumen[]>([]);
    const [current, setCurrent] = useState<ActividadSugeridaDetalle | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [month, setMonth] = useState<number>(today.getMonth() + 1);
    const [year, setYear] = useState<number>(today.getFullYear());

    const fetchList = useCallback(async (obra_id?: number) => {
        setLoading(true);
        setError(null);
        try {
            const params: Record<string, any> = { mes: month, anio: year };
            if (obra_id) params.obra_id = obra_id;
            const res = await api.get<{ data: ActividadSugeridaResumen[] }>('/actividades-sugeridas', { params });
            setList(res.data.data);
        } catch (err: any) {
            const msg = err?.response?.data?.error || 'Error al cargar las listas de actividades sugeridas';
            setError(msg);
            setList([]);
        } finally {
            setLoading(false);
        }
    }, [month, year]);

    const fetchDetalle = useCallback(async (id: number) => {
        setLoading(true);
        setError(null);
        try {
            const res = await api.get<{ data: ActividadSugeridaDetalle }>(`/actividades-sugeridas/${id}`);
            setCurrent(res.data.data);
            return res.data.data;
        } catch (err: any) {
            const msg = err?.response?.data?.error || 'Error al cargar el detalle';
            setError(msg);
            setCurrent(null);
            return null;
        } finally {
            setLoading(false);
        }
    }, []);

    const crearLista = useCallback(async (
        payload: CrearListaPayload
    ): Promise<{ id: number } | { conflictExistingId: number } | null> => {
        try {
            const res = await api.post<{ data: { id: number } }>('/actividades-sugeridas', payload);
            toast.success('Lista creada');
            return res.data.data;
        } catch (err: any) {
            const status = err?.response?.status;
            const msg = err?.response?.data?.error || 'Error al crear la lista';

            if (status === 409) {
                // Buscar la existente de la misma (obra, semana) para ofrecer abrirla.
                try {
                    const [anio, mes] = payload.semana.split('-').map(Number);
                    const listRes = await api.get<{ data: ActividadSugeridaResumen[] }>('/actividades-sugeridas', {
                        params: { obra_id: payload.obra_id, mes, anio },
                    });
                    // El backend puede devolver la semana como ISO completo; comparamos YYYY-MM-DD.
                    const existing = listRes.data.data.find(s => (s.semana || '').split('T')[0] === payload.semana);
                    if (existing) {
                        toast.error(msg, {
                            description: 'Ya hay una lista activa para esta obra en esa semana. Se abre la existente.',
                        });
                        return { conflictExistingId: existing.id };
                    }
                } catch { /* fallback al error genérico */ }
            }

            toast.error(msg);
            return null;
        }
    }, []);

    const editarLista = useCallback(async (id: number, payload: EditarListaPayload): Promise<boolean> => {
        try {
            await api.put(`/actividades-sugeridas/${id}/lista`, payload);
            toast.success('Lista actualizada');
            return true;
        } catch (err: any) {
            const msg = err?.response?.data?.error || 'Error al editar la lista';
            toast.error(msg);
            return false;
        }
    }, []);

    const registrarAsistencia = useCallback(async (id: number, payload: RegistrarAsistenciaPayload): Promise<boolean> => {
        try {
            await api.put(`/actividades-sugeridas/${id}/asistencia`, payload);
            toast.success('Asistencia guardada');
            return true;
        } catch (err: any) {
            const msg = err?.response?.data?.error || 'Error al guardar asistencia';
            toast.error(msg);
            return false;
        }
    }, []);

    const cancelar = useCallback(async (id: number): Promise<boolean> => {
        try {
            await api.delete(`/actividades-sugeridas/${id}`);
            toast.success('Lista cancelada');
            return true;
        } catch (err: any) {
            const msg = err?.response?.data?.error || 'Error al cancelar';
            toast.error(msg);
            return false;
        }
    }, []);

    return {
        list,
        current,
        loading,
        error,
        month,
        year,
        setMonth,
        setYear,
        fetchList,
        fetchDetalle,
        crearLista,
        editarLista,
        registrarAsistencia,
        cancelar,
    };
}
