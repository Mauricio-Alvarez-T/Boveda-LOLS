import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useObra } from '../context/ObraContext';

/**
 * «Pasar la lista» de una obra que no la pasó (Inicio y campana «Importante», 2026-11-18): elige esa obra arriba y
 * abre Asistencia en ese día (`/asistencia?fecha=`; con Asistencia ya abierta, useAttendanceData salta al día).
 */
export function usePasarLista() {
    const { obras, setSelectedObra } = useObra();
    const navigate = useNavigate();
    return useCallback((o: { obra_id: number }, fecha: string) => {
        const obra = obras.find(x => x.id === o.obra_id);
        if (obra) setSelectedObra(obra);
        navigate(`/asistencia?fecha=${fecha}`);
    }, [obras, setSelectedObra, navigate]);
}

/**
 * Se dispara al guardar la asistencia o al cambiar desde qué día pasa lista una obra (mig 156): la campana
 * «Importante», el recordatorio del jefe y el Inicio vuelven a preguntar (la obra puede salir).
 */
export const EVENTO_ASISTENCIA_GUARDADA = 'boveda-asistencia-guardada';
