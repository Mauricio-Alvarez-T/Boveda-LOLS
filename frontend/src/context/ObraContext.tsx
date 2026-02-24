import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import type { Obra } from '../types/entities';
import type { ApiResponse } from '../types';
import { useAuth } from './AuthContext';

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
    const { isAuthenticated } = useAuth();
    const [obras, setObras] = useState<Obra[]>([]);
    const [selectedObra, setSelectedObraState] = useState<Obra | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    const fetchObras = useCallback(async () => {
        if (!isAuthenticated) {
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        try {
            const res = await api.get<ApiResponse<Obra[]>>('/obras?activo=true');
            const list = res.data.data;
            setObras(list);

            // Restore saved selection
            const savedId = localStorage.getItem(STORAGE_KEY);
            if (savedId === 'ALL') {
                setSelectedObraState(null);
            } else if (savedId) {
                const found = list.find(o => o.id === Number(savedId));
                if (found) {
                    setSelectedObraState(found);
                } else if (list.length > 0) {
                    // Filtered or deleted, fallback to first
                    setSelectedObraState(list[0]);
                    localStorage.setItem(STORAGE_KEY, String(list[0].id));
                }
            } else if (list.length > 0) {
                setSelectedObraState(null);
            }
        } catch {
            console.error('Error fetching obras');
        } finally {
            setIsLoading(false);
        }
    }, [isAuthenticated]);

    useEffect(() => {
        fetchObras();
    }, [fetchObras]);

    const setSelectedObra = (obra: Obra | null) => {
        setSelectedObraState(obra);
        if (obra) {
            localStorage.setItem(STORAGE_KEY, String(obra.id));
        } else {
            localStorage.setItem(STORAGE_KEY, 'ALL');
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
