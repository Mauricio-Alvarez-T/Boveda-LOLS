import { useCallback, useMemo, useState } from 'react';
import type { ItemInventario, Bodega, CategoriaInventario } from '../../../types/entities';
import type { StockUbicacion } from '../StockBadge';
import {
    inferMovimiento,
    type Origen, type Destino, type ItemInput, type CustomItemInput,
    type PermisosMovimiento, type InferResult,
} from '../../../utils/inferMovimiento';

/**
 * Datos maestros que alimentan el wizard de "Nuevo movimiento". En la app real los
 * provee `useNuevoMovimientoData` (fetch); el Centro de ayuda los pasa de ejemplo.
 */
export interface WizardData {
    catalogo: ItemInventario[];
    bodegas: Bodega[];
    obras: { id: number; nombre: string }[];
    categorias: CategoriaInventario[];
    stockMap: Record<number, StockUbicacion[]>;
}

export const EMPTY_WIZARD_DATA: WizardData = { catalogo: [], bodegas: [], obras: [], categorias: [], stockMap: {} };

/**
 * Estado + derivaciones del wizard (paso, ruta, carrito, inferencia de tipo de
 * flujo, validaciones de avance). FUENTE ÚNICA de la lógica del wizard: la usan
 * tanto el wizard real (`NuevoMovimientoWizard`) como las demos del Centro de ayuda
 * → un cambio aquí se refleja en ambos. No hace fetch (recibe `data`).
 */
/** Ruta/estado inicial opcional (el Centro de ayuda pre-selecciona origen/destino
 *  para guiar un flujo de "Mover"). El wizard real NO lo pasa → defaults de siempre. */
export interface WizardInicial {
    origen?: Origen | null;
    destino?: Destino | null;
    ordenGerencia?: boolean;
}

export function useWizardEngine(modo: 'pedir' | 'mover', data: WizardData, permisos: PermisosMovimiento, inicial?: WizardInicial) {
    const origenDefault = (): Origen | null => inicial?.origen ?? (modo === 'pedir' ? { tipo: 'central' } : null);
    const [paso, setPaso] = useState(0);
    const [origen, setOrigen] = useState<Origen | null>(origenDefault);
    const [destino, setDestino] = useState<Destino | null>(inicial?.destino ?? null);
    const [ordenGerencia, setOrdenGerencia] = useState(inicial?.ordenGerencia ?? false);
    const [cart, setCart] = useState<ItemInput[]>([]);
    const [customItems, setCustomItems] = useState<CustomItemInput[]>([]);
    const [motivo, setMotivo] = useState('');
    const [observaciones, setObservaciones] = useState('');
    const [requierePionetas, setRequierePionetas] = useState(false);
    const [cantidadPionetas, setCantidadPionetas] = useState(0);
    const [submitting, setSubmitting] = useState(false);

    /** Resetea todos los inputs (a la ruta inicial; origen central fijo en modo Pedir). */
    const reset = useCallback(() => {
        setPaso(0);
        setOrigen(inicial?.origen ?? (modo === 'pedir' ? { tipo: 'central' } : null));
        setDestino(inicial?.destino ?? null); setOrdenGerencia(inicial?.ordenGerencia ?? false);
        setCart([]); setCustomItems([]); setMotivo(''); setObservaciones('');
        setRequierePionetas(false); setCantidadPionetas(0); setSubmitting(false);
    }, [modo, inicial]);

    const customLimpios = useMemo(() => customItems.filter(c => c.descripcion.trim()), [customItems]);

    const wizardState = useMemo(() => ({
        origen, destino, ordenGerencia,
        items: cart, itemsCustom: customLimpios,
        motivo, observaciones, requierePionetas, cantidadPionetas,
    }), [origen, destino, ordenGerencia, cart, customLimpios, motivo, observaciones, requierePionetas, cantidadPionetas]);

    const infer: InferResult = useMemo(() => inferMovimiento(wizardState, permisos), [wizardState, permisos]);

    const conStockFiltro = !!origen && origen.tipo !== 'central';
    const stockEnOrigen = useMemo(() => {
        const m: Record<number, number> = {};
        const o = origen;
        if (!o || o.tipo === 'central') return m;
        Object.entries(data.stockMap).forEach(([itemId, ubis]) => {
            const f = ubis.find(u => u.type === o.tipo && u.id === o.id);
            if (f) m[Number(itemId)] = Number(f.cantidad) || 0;
        });
        return m;
    }, [data.stockMap, origen]);

    // Stock que ve el SOLICITANTE (modo Pedir): SOLO bodegas (regla de oro — el stock se
    // saca primero de bodegas; las obras solo las completa el aprobador al aprobar). El
    // solicitante puede sobre-pedir; el wizard avisa que el resto lo revisa el aprobador.
    const disponibleTotal = useMemo(() => {
        const m: Record<number, number> = {};
        Object.entries(data.stockMap).forEach(([itemId, ubis]) => {
            m[Number(itemId)] = ubis
                .filter(u => u.type === 'bodega')
                .reduce((s, u) => s + (Number(u.cantidad) || 0), 0);
        });
        return m;
    }, [data.stockMap]);

    const hayExceso = conStockFiltro && cart.some(l => (stockEnOrigen[l.item_id] || 0) < l.cantidad);
    const allowCustom = modo === 'pedir';

    const nombreUbi = useCallback((u: Origen | Destino | null): string => {
        if (!u) return '—';
        if (u.tipo === 'central') return 'Bodega central';
        if (u.tipo === 'bodega') return data.bodegas.find(b => b.id === u.id)?.nombre || `Bodega #${u.id}`;
        return data.obras.find(o => o.id === u.id)?.nombre || `Obra #${u.id}`;
    }, [data.bodegas, data.obras]);

    const handleOrigen = useCallback((o: Origen | null) => { setOrigen(o); setCart([]); }, []);
    const handleDestino = useCallback((d: Destino | null) => setDestino(d), []);

    const hayItems = cart.length > 0 || customLimpios.length > 0;
    const puedeSiguiente = paso === 0 ? infer.rutaOk : paso === 1 ? (hayItems && !hayExceso) : false;
    const puedeCrear = paso === 2 && !!infer.resuelto && !hayExceso && !submitting;

    return {
        paso, setPaso,
        origen, destino, ordenGerencia, setOrdenGerencia,
        cart, setCart, customItems, setCustomItems,
        motivo, setMotivo, observaciones, setObservaciones,
        requierePionetas, setRequierePionetas, cantidadPionetas, setCantidadPionetas,
        submitting, setSubmitting,
        reset,
        wizardState, infer,
        conStockFiltro, stockEnOrigen, disponibleTotal, hayExceso, allowCustom,
        nombreUbi, handleOrigen, handleDestino,
        hayItems, puedeSiguiente, puedeCrear,
    };
}

export type WizardEngine = ReturnType<typeof useWizardEngine>;
