import { useCallback, useEffect, useState } from 'react';
import api from '../../services/api';

/**
 * Progreso de tutoriales del Centro de ayuda (cross-device): qué recorridos
 * completó el usuario. Lee/escribe `GET|PUT|DELETE /api/tutoriales-progreso`.
 *
 * Degrada con gracia: si el endpoint/tabla aún no existe (antes de correr migrate),
 * los try/catch dejan el progreso vacío y la UI sigue funcionando sin errores.
 */
interface ProgresoRow { tutorial_id: string; completado_at: string; }

export function useTutorialProgreso() {
    const [completados, setCompletados] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);

    const cargar = useCallback(async () => {
        try {
            const res = await api.get<ProgresoRow[]>('/tutoriales-progreso');
            const map: Record<string, string> = {};
            (res.data || []).forEach(r => { map[r.tutorial_id] = r.completado_at; });
            setCompletados(map);
        } catch {
            /* endpoint/tabla no disponible → progreso vacío (no rompe la UI) */
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { cargar(); }, [cargar]);

    const marcar = useCallback(async (id: string) => {
        // Optimista: marca de inmediato (no esperamos al servidor para la UI).
        setCompletados(prev => (prev[id] ? prev : { ...prev, [id]: new Date().toISOString() }));
        try {
            const res = await api.put<ProgresoRow>(`/tutoriales-progreso/${id}`);
            if (res.data?.completado_at) {
                setCompletados(prev => ({ ...prev, [id]: res.data.completado_at }));
            }
        } catch { /* silencioso */ }
    }, []);

    const reiniciar = useCallback(async () => {
        setCompletados({});
        try { await api.delete('/tutoriales-progreso'); } catch { /* silencioso */ }
    }, []);

    const isCompleto = useCallback((id: string) => !!completados[id], [completados]);

    return { completados, loading, marcar, reiniciar, isCompleto };
}
