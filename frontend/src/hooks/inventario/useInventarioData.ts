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
    // Auditoría 6.1: totales pre-calculados en backend para consistencia con dashboard.
    // Opcional porque el endpoint puede omitirlos si el usuario no tiene
    // `inventario.resumen.ver_valores` (sanitizeResumenInventario los borra).
    totales?: {
        valor_bruto: number;
        valor_descuento: number;
        valor_neto: number;
        total_cantidad: number;
    };
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
    // Auditoría 6.2: backend ahora devuelve estos campos en 0 para mantener
    // el shape homogéneo con StockObraData (bodegas no facturan arriendo).
    total_facturacion: number;
    descuento_porcentaje: number;
    descuento_monto: number;
    total_con_descuento: number;
}

export function useInventarioData() {
    const [resumen, setResumen] = useState<ResumenData | null>(null);
    const [stockObra, setStockObra] = useState<StockObraData | null>(null);
    const [stockBodega, setStockBodega] = useState<StockBodegaData | null>(null);
    const [resumenLoading, setResumenLoading] = useState(false);
    const [stockObraLoading, setStockObraLoading] = useState(false);
    const [stockBodegaLoading, setStockBodegaLoading] = useState(false);

    const fetchResumen = useCallback(async () => {
        setResumenLoading(true);
        try {
            const res = await api.get<ApiResponse<ResumenData>>('/inventario/resumen');
            setResumen(res.data.data);
        } catch {
            setResumen(null);
        } finally {
            setResumenLoading(false);
        }
    }, []);

    const fetchStockObra = useCallback(async (obraId: number) => {
        setStockObraLoading(true);
        try {
            const res = await api.get<ApiResponse<StockObraData>>(`/inventario/stock/obra/${obraId}`);
            setStockObra(res.data.data);
        } catch {
            setStockObra(null);
        } finally {
            setStockObraLoading(false);
        }
    }, []);

    const fetchStockBodega = useCallback(async (bodegaId: number) => {
        setStockBodegaLoading(true);
        try {
            const res = await api.get<ApiResponse<StockBodegaData>>(`/inventario/stock/bodega/${bodegaId}`);
            setStockBodega(res.data.data);
        } catch {
            setStockBodega(null);
        } finally {
            setStockBodegaLoading(false);
        }
    }, []);

    return {
        resumen, stockObra, stockBodega,
        resumenLoading, stockObraLoading, stockBodegaLoading,
        fetchResumen, fetchStockObra, fetchStockBodega
    };
}
