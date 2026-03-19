import { useState, useCallback } from 'react';

export const useConsultasSelection = (workersLength: number, workersIds: number[]) => {
    const [selectedWorkers, setSelectedWorkers] = useState<Set<number>>(new Set());

    const handleSelectAll = useCallback(() => {
        if (selectedWorkers.size === workersLength && workersLength > 0) {
            setSelectedWorkers(new Set());
        } else {
            setSelectedWorkers(new Set(workersIds));
        }
    }, [selectedWorkers.size, workersLength, workersIds]);

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
        handleSelectAll,
        handleSelectWorker,
        clearSelection
    };
};
