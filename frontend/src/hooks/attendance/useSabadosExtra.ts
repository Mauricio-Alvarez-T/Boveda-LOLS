import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import api from '../../services/api';
import type {
    SabadoExtraResumen,
    SabadoExtraDetalle,
    CrearCitacionPayload,
    EditarCitacionPayload,
    RegistrarAsistenciaPayload,
} from '../../types/sabadosExtra';

/**
 * Hook para operar sobre /api/sabados-extra. No persiste estado entre vistas;
 * el componente que lo monta es responsable de invocar fetchList/fetchDetalle.
 */
export function useSabadosExtra() {
    const today = new Date();
    const [list, setList] = useState<SabadoExtraResumen[]>([]);
    const [current, setCurrent] = useState<SabadoExtraDetalle | null>(null);
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
            const res = await api.get<{ data: SabadoExtraResumen[] }>('/sabados-extra', { params });
            setList(res.data.data);
        } catch (err: any) {
            const msg = err?.response?.data?.error || 'Error al cargar sábados extra';
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
            const res = await api.get<{ data: SabadoExtraDetalle }>(`/sabados-extra/${id}`);
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

    const crearCitacion = useCallback(async (
        payload: CrearCitacionPayload
    ): Promise<{ id: number } | { conflictExistingId: number } | null> => {
        try {
            const res = await api.post<{ data: { id: number } }>('/sabados-extra', payload);
            toast.success('Citación creada');
            return res.data.data;
        } catch (err: any) {
            const status = err?.response?.status;
            const msg = err?.response?.data?.error || 'Error al crear la citación';

            if (status === 409) {
                // Buscar la existente del mismo (obra, fecha) para ofrecer abrirla
                try {
                    const fechaParts = payload.fecha.split('-');
                    const mes = Number(fechaParts[1]);
                    const anio = Number(fechaParts[0]);
                    const listRes = await api.get<{ data: SabadoExtraResumen[] }>('/sabados-extra', {
                        params: { obra_id: payload.obra_id, mes, anio },
                    });
                    const existing = listRes.data.data.find(s => s.fecha === payload.fecha);
                    if (existing) {
                        toast.error(msg, {
                            description: 'Ya hay una citación activa para esta obra y fecha.',
                        });
                        return { conflictExistingId: existing.id };
                    }
                } catch { /* fallback al error genérico */ }
            }

            toast.error(msg);
            return null;
        }
    }, []);

    const editarCitacion = useCallback(async (id: number, payload: EditarCitacionPayload): Promise<boolean> => {
        try {
            await api.put(`/sabados-extra/${id}/citacion`, payload);
            toast.success('Citación actualizada');
            return true;
        } catch (err: any) {
            const msg = err?.response?.data?.error || 'Error al editar la citación';
            toast.error(msg);
            return false;
        }
    }, []);

    const registrarAsistencia = useCallback(async (id: number, payload: RegistrarAsistenciaPayload): Promise<boolean> => {
        try {
            await api.put(`/sabados-extra/${id}/asistencia`, payload);
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
            await api.delete(`/sabados-extra/${id}`);
            toast.success('Citación cancelada');
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
        crearCitacion,
        editarCitacion,
        registrarAsistencia,
        cancelar,
    };
}
