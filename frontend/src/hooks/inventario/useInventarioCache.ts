import { useCallback } from 'react';

/**
 * Hook central de invalidación cache para el módulo Inventario.
 *
 * Reemplaza el patrón `onRefresh` tab-scoped (donde Resumen solo refrescaba
 * `/inventario/resumen`, Por Obra solo `/inventario/stock/obra/:id`, etc)
 * por una invalidación dirigida: cualquier mutación de stock dispara
 * refetch paralelo de TODAS las queries inventario activas.
 *
 * Garantiza que tras editar una cantidad en cualquier tab, al cambiar a otra
 * el dato ya está fresco (no espera al useEffect del activeTab).
 *
 * Diseño:
 *   - Recibe los `fetch*` desde `useInventarioData` (instanciado en
 *     `Inventario.tsx`) y el contexto de ubicación activa (selectedUbicacion).
 *   - Solo invalida ubicaciones cargadas. Si user no abrió "Por Bodega 3",
 *     no hace fetchStockBodega(3) — evita ruido de queries innecesarias.
 *   - El backend tiene `Cache-Control: no-cache` + ETag, por lo que los
 *     refetch a endpoints sin cambios reales retornan 304 (sin body),
 *     manteniendo costo bajo.
 *
 * Dashboard ejecutivo NO se invalida desde aquí: es un panel separado con
 * su propio hook interno (`useDashboardEjecutivo` dentro de
 * `ResumenEjecutivoPanel`). Como ese tab se desmonta/remonta al cambiar
 * de tab, su data se refresca al volver. Aceptable hasta migrar a un
 * patrón de stores globales (React Query / Zustand) en una siguiente ronda.
 *
 * Maestro tabs (`InventarioMaestroGrid`, `StockMaestroGrid`) tampoco se
 * invalidan desde aquí — usan hooks internos y se desmontan al cambiar
 * de tab.
 */

interface FetchFns {
    fetchResumen: () => Promise<void> | void;
    fetchStockObra: (obraId: number) => Promise<void> | void;
    fetchStockBodega: (bodegaId: number) => Promise<void> | void;
}

interface UseInventarioCacheArgs extends FetchFns {
    /** Obra activa actualmente seleccionada en Por Obra/Bodega (si la hay). */
    activeObraId?: number | null;
    /** Bodega activa actualmente seleccionada en Por Obra/Bodega (si la hay). */
    activeBodegaId?: number | null;
}

export interface InventarioCacheApi {
    /**
     * Invalida todas las queries de inventario relacionadas con stock.
     * Llamar después de: updateStock, updateDescuento, bulkAdjust, bulkUpdate,
     * factura.crear, transferencia.recibir, discrepancia.resolver.
     */
    invalidateStockAll: () => Promise<void>;
}

export function useInventarioCache(args: UseInventarioCacheArgs): InventarioCacheApi {
    const {
        fetchResumen,
        fetchStockObra,
        fetchStockBodega,
        activeObraId,
        activeBodegaId,
    } = args;

    const invalidateStockAll = useCallback(async () => {
        const promises: Array<Promise<unknown> | void> = [];
        promises.push(fetchResumen());
        if (activeObraId) promises.push(fetchStockObra(activeObraId));
        if (activeBodegaId) promises.push(fetchStockBodega(activeBodegaId));
        // Promise.all acepta valores sync (void), se resuelven inmediatamente.
        await Promise.all(promises as Promise<unknown>[]);
    }, [fetchResumen, fetchStockObra, fetchStockBodega, activeObraId, activeBodegaId]);

    return { invalidateStockAll };
}
