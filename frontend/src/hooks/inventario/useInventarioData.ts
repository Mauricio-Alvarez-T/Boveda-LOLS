import { useState, useEffect, useCallback } from 'react';
import api from '../../services/api';
import type { ApiResponse } from '../../types';

interface UbicacionData {
    cantidad: number;
    total: number;
}

interface ResumenItem {
    id: number;
    nro_item: number;
    descripcion: string;
    m2: number | null;
    valor_compra: number;
    valor_arriendo: number;
    unidad: string;
    imagen_url: string | null;
    ubicaciones: Record<string, UbicacionData>;
    total_arriendo: number;
    total_cantidad: number;
}

interface ResumenCategoria {
    id: number;
    nombre: string;
    orden: number;
    items: ResumenItem[];
}

interface Ubicacion {
    id: number;
    nombre: string;
}

export interface ResumenData {
    obras: Ubicacion[];
    bodegas: Ubicacion[];
    categorias: ResumenCategoria[];
    descuentos: Record<number, number>;
}

interface StockItem {
    id: number;
    nro_item: number;
    descripcion: string;
    m2: number | null;
    valor_arriendo: number;
    unidad: string;
    cantidad: number;
    total: number;
    ubicacion_stock_id: number | null;
}

interface StockCategoria {
    id: number;
    nombre: string;
    orden: number;
    items: StockItem[];
    subtotal_cantidad: number;
    subtotal_arriendo: number;
}

export interface StockObraData {
    obra: Ubicacion;
    categorias: StockCategoria[];
    total_facturacion: number;
    descuento_porcentaje: number;
    descuento_monto: number;
    total_con_descuento: number;
}

export interface StockBodegaData {
    bodega: Ubicacion;
    categorias: StockCategoria[];
}

export function useInventarioData() {
    const [resumen, setResumen] = useState<ResumenData | null>(null);
    const [stockObra, setStockObra] = useState<StockObraData | null>(null);
    const [stockBodega, setStockBodega] = useState<StockBodegaData | null>(null);
    const [loading, setLoading] = useState(false);

    const fetchResumen = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get<ApiResponse<ResumenData>>('/inventario/resumen');
            setResumen(res.data.data);
        } catch {
            setResumen(null);
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchStockObra = useCallback(async (obraId: number) => {
        setLoading(true);
        try {
            const res = await api.get<ApiResponse<StockObraData>>(`/inventario/stock/obra/${obraId}`);
            setStockObra(res.data.data);
        } catch {
            setStockObra(null);
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchStockBodega = useCallback(async (bodegaId: number) => {
        setLoading(true);
        try {
            const res = await api.get<ApiResponse<StockBodegaData>>(`/inventario/stock/bodega/${bodegaId}`);
            setStockBodega(res.data.data);
        } catch {
            setStockBodega(null);
        } finally {
            setLoading(false);
        }
    }, []);

    return {
        resumen, stockObra, stockBodega, loading,
        fetchResumen, fetchStockObra, fetchStockBodega
    };
}
