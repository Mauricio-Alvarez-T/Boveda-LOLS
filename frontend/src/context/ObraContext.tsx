import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import type { Obra } from '../types/entities';
import type { ApiResponse } from '../types';

interface ObraContextType {
    obras: Obra[];
    selectedObra: Obra | null;
    setSelectedObra: (obra: Obra | null) => void;
    isLoading: boolean;
    refreshObras: () => void;
}

const ObraContext = createContext<ObraContextType | undefined>(undefined);

const STORAGE_KEY = 'sgdl_obra_id';

export const ObraProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [obras, setObras] = useState<Obra[]>([]);
    const [selectedObra, setSelectedObraState] = useState<Obra | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    const fetchObras = useCallback(async () => {
        setIsLoading(true);
        try {
            const res = await api.get<ApiResponse<Obra[]>>('/obras?activo=true');
            const list = res.data.data;
            setObras(list);

            // Restore saved selection
            const savedId = localStorage.getItem(STORAGE_KEY);
            if (savedId) {
                const found = list.find(o => o.id === Number(savedId));
                if (found) {
                    setSelectedObraState(found);
                } else if (list.length > 0) {
                    setSelectedObraState(list[0]);
                    localStorage.setItem(STORAGE_KEY, String(list[0].id));
                }
            } else if (list.length > 0) {
                setSelectedObraState(list[0]);
                localStorage.setItem(STORAGE_KEY, String(list[0].id));
            }
        } catch {
            console.error('Error fetching obras');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchObras();
    }, [fetchObras]);

    const setSelectedObra = (obra: Obra | null) => {
        setSelectedObraState(obra);
        if (obra) {
            localStorage.setItem(STORAGE_KEY, String(obra.id));
        } else {
            localStorage.removeItem(STORAGE_KEY);
        }
    };

    return (
        <ObraContext.Provider value={{
            obras,
            selectedObra,
            setSelectedObra,
            isLoading,
            refreshObras: fetchObras,
        }}>
            {children}
        </ObraContext.Provider>
    );
};

export const useObra = () => {
    const context = useContext(ObraContext);
    if (context === undefined) {
        throw new Error('useObra must be used within an ObraProvider');
    }
    return context;
};
