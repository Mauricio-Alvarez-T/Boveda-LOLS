import { useState, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import type { ResumenSemanaActividades } from '../../types/actividadesSugeridas';

/**
 * Informe de asistencia a actividades sugeridas (pedido del dueño 2026-09-21):
 * resumen por cargo de una semana + descarga del Excel de dos hojas.
 *
 * Lo usan el widget de Inicio y el mismo widget dentro del modal de Gestiones.
 * La semana por defecto la decide el backend (la última con asistencia registrada);
 * `setSemana` refetchea solo ese resumen, sin recargar el resto del dashboard.
 */
export function useInformeActividades() {
    const { hasPermission } = useAuth();
    const [resumen, setResumen] = useState<ResumenSemanaActividades | null>(null);
    const [loading, setLoading] = useState(true);
    const [descargando, setDescargando] = useState(false);

    const fetchResumen = useCallback(async (semana?: string) => {
        setLoading(true);
        try {
            const params = semana ? { semana } : undefined;
            const res = await api.get<{ data: ResumenSemanaActividades }>('/actividades-sugeridas/resumen-semana', { params });
            setResumen(res.data.data);
        } catch {
            // Silencioso como los demás widgets del Inicio: el error no debe tapar la página.
            setResumen(null);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchResumen(); }, [fetchResumen]);

    const setSemana = useCallback((semana: string) => { fetchResumen(semana); }, [fetchResumen]);

    const descargarExcel = useCallback(async () => {
        if (!hasPermission('asistencia.actividades_sugeridas.informe')) {
            toast.error('No tienes permiso para descargar el informe');
            return;
        }
        const semana = resumen?.semana;
        if (!semana) { toast.info('No hay asistencias registradas para esa semana'); return; }

        setDescargando(true);
        toast.info('Generando informe...', { id: 'actividades-informe' });
        try {
            const response = await api.get(`/actividades-sugeridas/informe-excel?semana=${semana}`, { responseType: 'blob' });
            const url = window.URL.createObjectURL(new Blob([response.data as BlobPart]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `Actividades_sugeridas_semana_${semana}.xlsx`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
            toast.success('Informe descargado', { id: 'actividades-informe' });
        } catch {
            toast.error('Error al generar el informe', { id: 'actividades-informe' });
        } finally {
            setDescargando(false);
        }
    }, [hasPermission, resumen?.semana]);

    return { resumen, loading, descargando, setSemana, fetchResumen, descargarExcel };
}
