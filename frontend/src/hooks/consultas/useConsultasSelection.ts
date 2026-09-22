import { useState, useCallback } from 'react';

/**
 * Selección de trabajadores para las acciones masivas de la grilla (Enviar por correo / Exportar).
 *
 * Se selecciona casilla por casilla: el «Seleccionar todos» se retiró el 2026-09-16 porque no se usaba
 * (el dueño lo confirmó). Para actuar sobre TODO el resultado del filtro están los botones del header,
 * que trabajan sin selección; por eso este hook ya no necesita saber cuántos trabajadores hay ni cuáles.
 */
export const useConsultasSelection = () => {
    const [selectedWorkers, setSelectedWorkers] = useState<Set<number>>(new Set());

    const handleSelectWorker = useCallback((id: number) => {
        setSelectedWorkers(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }, []);

    const clearSelection = useCallback(() => {
        setSelectedWorkers(new Set());
    }, []);

    return {
        selectedWorkers,
        setSelectedWorkers,
        handleSelectWorker,
        clearSelection
    };
};
