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
    filterAniversario10m: string;
    filterIngresoDesde: string;
    filterIngresoHasta: string;
    filterFaltaDato: string;
    filterDocTipoFalta: string;
    filterDocVigencia: string;
    filterSalidaDesde: string;
    filterSalidaHasta: string;
    filterNoRecontratar: boolean;
    filterFiniquito: string;
    filterSoloPrueba: boolean;
}

/**
 * @param enabled false = no consultar la grilla (usuario sin `trabajadores.ver`, p. ej.
 *   terreno que solo llega a Consultas por la ficha de ingreso digital): evita el 403 + toast.
 */
export const useConsultasData = (filters: FetchWorkersParams, enabled: boolean = true) => {
    // Catálogos
    const [empresas, setEmpresas] = useState<{value: string | number; label: string}[]>([]);
    const [obras, setObras] = useState<{value: string | number; label: string}[]>([]);
    const [cargos, setCargos] = useState<{value: string | number; label: string}[]>([]);
    // Tipos de documento OBLIGATORIOS y activos: alimentan el filtro "le falta este documento".
    // Se filtran acá y no en el backend porque el CRUD de tipos ya devuelve ambas columnas.
    const [tiposObligatorios, setTiposObligatorios] = useState<{value: string | number; label: string}[]>([]);

    // Estado local
    const [loading, setLoading] = useState(false);
    const [workers, setWorkers] = useState<TrabajadorAvanzado[]>([]);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    
    const fetchingRef = useRef(false);
    // Cancela la búsqueda anterior cuando llega una nueva (evita requests apiladas → 429).
    const abortRef = useRef<AbortController | null>(null);

    // Cargar catálogos
    const fetchCatalogs = useCallback(async () => {
        try {
            const [empRes, obraRes, cargoRes, tipoRes] = await Promise.all([
                api.get<ApiResponse<Empresa[]>>('/empresas?activo=true'),
                api.get<ApiResponse<Obra[]>>('/obras?activo=true'),
                api.get<ApiResponse<Cargo[]>>('/cargos?activo=true'),
                api.get<ApiResponse<{ id: number; nombre: string; obligatorio: boolean | number; activo: boolean | number }[]>>('/documentos/tipos')
            ]);

            setEmpresas([{ value: '', label: 'Todas las Empresas' }, ...empRes.data.data.map(e => ({ value: e.id, label: e.razon_social }))]);
            setObras([{ value: '', label: 'Todas las Obras' }, ...obraRes.data.data.map(o => ({ value: o.id, label: o.nombre }))]);
            setCargos([{ value: '', label: 'Todos los Cargos' }, ...cargoRes.data.data.map(c => ({ value: c.id, label: c.nombre }))]);
            setTiposObligatorios((tipoRes.data.data || [])
                .filter(t => !!t.obligatorio && !!t.activo)
                .map(t => ({ value: t.id, label: t.nombre })));
        } catch (err) {
            console.error('Error fetching catalogs', err);
        }
    }, []);

    const performSearch = useCallback(async (
        isInitial: boolean = false,
        onSuccessInitial?: () => void
    ) => {
        if (!enabled) return;
        // Cancelar la petición anterior en vuelo y abrir una nueva.
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;
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
            if (filters.filterAniversario10m) urlParams.append('aniversario10m', filters.filterAniversario10m);
            if (filters.filterIngresoDesde) urlParams.append('fecha_ingreso_desde', filters.filterIngresoDesde);
            if (filters.filterIngresoHasta) urlParams.append('fecha_ingreso_hasta', filters.filterIngresoHasta);
            if (filters.filterFaltaDato) urlParams.append('falta_dato', filters.filterFaltaDato);
            if (filters.filterDocTipoFalta) urlParams.append('doc_tipo_falta', filters.filterDocTipoFalta);
            if (filters.filterDocVigencia) urlParams.append('doc_vigencia', filters.filterDocVigencia);
            if (filters.filterSalidaDesde) urlParams.append('fecha_desvinc_desde', filters.filterSalidaDesde);
            if (filters.filterSalidaHasta) urlParams.append('fecha_desvinc_hasta', filters.filterSalidaHasta);
            if (filters.filterNoRecontratar) urlParams.append('no_recontratar', 'true');
            if (filters.filterFiniquito) urlParams.append('finiquito', filters.filterFiniquito);
            if (filters.filterSoloPrueba) urlParams.append('solo_prueba', 'true');
            // Consultas es superficie de administración: incluir trabajadores de
            // prueba (se muestran con badge) para poder gestionarlos/revertirlos.
            urlParams.append('incluir_prueba', 'true');
            // ⚠️ El backend IGNORA page/limit: `fiscalizacion.service.searchTrabajadores` no tiene LIMIT ni
            // OFFSET, así que devuelve el set filtrado completo y la grilla lo muestra entero (por eso el
            // conteo de la cabecera coincide con las filas). `loadMore`/`hasMore` de abajo son código
            // muerto: nadie los llama. Si alguna vez se pagina de verdad en el servidor, hay que cablear
            // el scroll infinito Y el conteo en el mismo cambio, o la grilla se truncará en silencio.
            urlParams.append('page', isInitial ? '1' : page.toString());
            urlParams.append('limit', '50');

            const res = await api.get<{ data: TrabajadorAvanzado[] }>(`/fiscalizacion/trabajadores-avanzado?${urlParams.toString()}`, { signal: controller.signal });
            const data = res.data.data || [];

            setWorkers(prev => isInitial ? data : [...prev, ...data]);
            setHasMore(data.length === 50);

            if (isInitial && onSuccessInitial) {
                onSuccessInitial();
            }

        } catch (err) {
            // Petición cancelada por una búsqueda más nueva → no es error.
            if ((err as { code?: string })?.code === 'ERR_CANCELED') return;
            toast.error('Error al realizar la búsqueda');
        } finally {
            // Solo apagar flags si esta sigue siendo la búsqueda vigente
            // (un request cancelado no debe apagar el spinner de su reemplazo).
            if (abortRef.current === controller) {
                setLoading(false);
                setIsLoadingMore(false);
                fetchingRef.current = false;
            }
        }
    }, [filters, page, enabled]);


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
    // `enabled` en deps: la grilla se monta al entrar a la sección (B8) y debe consultar recién ahí.
    }, [enabled, filters.search, filters.filterObra, filters.filterEmpresa, filters.filterCargo, filters.filterCategoria, filters.filterActivo, filters.filterCompletitud, filters.filterAusentes, filters.filterAniversario10m, filters.filterIngresoDesde, filters.filterIngresoHasta, filters.filterFaltaDato, filters.filterDocTipoFalta, filters.filterDocVigencia, filters.filterSalidaDesde, filters.filterSalidaHasta, filters.filterNoRecontratar, filters.filterFiniquito, filters.filterSoloPrueba]);

    // Abortar cualquier búsqueda en vuelo al desmontar.
    useEffect(() => () => abortRef.current?.abort(), []);

    // Carga inicial de catálogos
    useEffect(() => {
        fetchCatalogs();
    }, [fetchCatalogs]);


    return {
        empresas, setEmpresas,
        obras, setObras,
        cargos, setCargos,
        tiposObligatorios,
        fetchCatalogs,
        workers, setWorkers,
        loading, hasMore, isLoadingMore,
        page, setPage,
        performSearch, loadMore,
        fetchingRef
    };
};
