import { useState, useCallback, useRef, useEffect } from 'react';
import api from '../../services/api';
import { toast } from 'sonner';
import type { Trabajador, Empresa, Obra, Cargo } from '../../types/entities';
import type { ApiResponse } from '../../types';

// Interface extendida para la búsqueda avanzada
export interface TrabajadorAvanzado extends Trabajador {
    docs_porcentaje: number;
}

export interface FetchWorkersParams {
    search: string;
    filterObra: string;
    filterEmpresa: string;
    filterCargo: string;
    filterCategoria: string;
    filterActivo: string;
    filterCompletitud: string;
    filterAusentes: boolean;
}

export const useConsultasData = (filters: FetchWorkersParams) => {
    // Catálogos
    const [empresas, setEmpresas] = useState<{value: string | number; label: string}[]>([]);
    const [obras, setObras] = useState<{value: string | number; label: string}[]>([]);
    const [cargos, setCargos] = useState<{value: string | number; label: string}[]>([]);

    // Estado local
    const [loading, setLoading] = useState(false);
    const [workers, setWorkers] = useState<TrabajadorAvanzado[]>([]);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    
    const fetchingRef = useRef(false);

    // Cargar catálogos
    const fetchCatalogs = useCallback(async () => {
        try {
            const [empRes, obraRes, cargoRes] = await Promise.all([
                api.get<ApiResponse<Empresa[]>>('/empresas?activo=true'),
                api.get<ApiResponse<Obra[]>>('/obras?activo=true'),
                api.get<ApiResponse<Cargo[]>>('/cargos?activo=true')
            ]);

            setEmpresas([{ value: '', label: 'Todas las Empresas' }, ...empRes.data.data.map(e => ({ value: e.id, label: e.razon_social }))]);
            setObras([{ value: '', label: 'Todas las Obras' }, ...obraRes.data.data.map(o => ({ value: o.id, label: o.nombre }))]);
            setCargos([{ value: '', label: 'Todos los Cargos' }, ...cargoRes.data.data.map(c => ({ value: c.id, label: c.nombre }))]);
        } catch (err) {
            console.error('Error fetching catalogs', err);
        }
    }, []);

    const performSearch = useCallback(async (
        isInitial: boolean = false,
        onSuccessInitial?: () => void
    ) => {
        if (fetchingRef.current) return;
        fetchingRef.current = true;

        if (isInitial) {
            setLoading(true);
            setPage(1);
        } else {
            setIsLoadingMore(true);
        }

        try {
            const urlParams = new URLSearchParams();
            if (filters.search) urlParams.append('q', filters.search);
            if (filters.filterObra) urlParams.append('obra_id', filters.filterObra);
            if (filters.filterEmpresa) urlParams.append('empresa_id', filters.filterEmpresa);
            if (filters.filterCargo) urlParams.append('cargo_id', filters.filterCargo);
            if (filters.filterCategoria) urlParams.append('categoria_reporte', filters.filterCategoria);
            if (filters.filterActivo) urlParams.append('activo', filters.filterActivo);
            if (filters.filterCompletitud) urlParams.append('completitud', filters.filterCompletitud);
            if (filters.filterAusentes) urlParams.append('ausentes', 'true');
            urlParams.append('page', isInitial ? '1' : page.toString());
            urlParams.append('limit', '50');

            const res = await api.get<{ data: TrabajadorAvanzado[] }>(`/fiscalizacion/trabajadores-avanzado?${urlParams.toString()}`);
            const data = res.data.data || [];
            
            setWorkers(prev => isInitial ? data : [...prev, ...data]);
            setHasMore(data.length === 50);

            if (isInitial && onSuccessInitial) {
                onSuccessInitial();
            }

        } catch (err) {
            toast.error('Error al realizar la búsqueda');
        } finally {
            setLoading(false);
            setIsLoadingMore(false);
            setTimeout(() => {
                fetchingRef.current = false;
            }, 200);
        }
    }, [filters, page]);


    const loadMore = useCallback(() => {
        if (!loading && !isLoadingMore && hasMore) {
            setPage(p => p + 1);
        }
    }, [loading, isLoadingMore, hasMore]);

    // Trigger de búsqueda automática (con debounce)
    useEffect(() => {
        const timeoutId = setTimeout(() => {
            performSearch(true);
        }, 300);
        return () => clearTimeout(timeoutId);
    }, [filters.search, filters.filterObra, filters.filterEmpresa, filters.filterCargo, filters.filterCategoria, filters.filterActivo, filters.filterCompletitud, filters.filterAusentes]);

    // Carga inicial de catálogos
    useEffect(() => {
        fetchCatalogs();
    }, [fetchCatalogs]);


    return {
        empresas, setEmpresas,
        obras, setObras,
        cargos, setCargos,
        fetchCatalogs,
        workers, setWorkers,
        loading, hasMore, isLoadingMore,
        page, setPage,
        performSearch, loadMore,
        fetchingRef
    };
};
