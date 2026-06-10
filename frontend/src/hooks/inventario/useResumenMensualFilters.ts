import { useState, useMemo, useEffect } from 'react';
import type { ResumenData } from './useInventarioData';

const STORAGE_KEY = 'inventario_resumen_hidden_cols';
const ORDER_KEY = 'inventario_resumen_col_order';

function loadHiddenCols(): Set<string> {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch { return new Set(); }
}

function saveHiddenCols(set: Set<string>) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
}

function loadColOrder(): string[] {
    try {
        const raw = localStorage.getItem(ORDER_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch { return []; }
}

function saveColOrder(order: string[]) {
    localStorage.setItem(ORDER_KEY, JSON.stringify(order));
}

/** Una columna de ubicación (obra o bodega) en el orden actual de la tabla. */
export interface OrderedLocation {
    key: string;            // 'obra_3' | 'bodega_2'
    type: 'obra' | 'bodega';
    id: number;
    nombre: string;
    raw: any;               // objeto obra/bodega original (para helpers de formato)
}

export function useResumenMensualFilters(data: ResumenData) {
    const { obras, bodegas, categorias } = data;

    const [collapsedCats, setCollapsedCats] = useState<Set<number>>(new Set());
    const [hiddenCols, setHiddenCols] = useState<Set<string>>(loadHiddenCols);
    const [colOrder, setColOrder] = useState<string[]>(loadColOrder);
    const [hideEmpty, setHideEmpty] = useState(false);
    const [search, setSearch] = useState('');
    const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
    const [showImages, setShowImages] = useState(false);

    useEffect(() => { saveHiddenCols(hiddenCols); }, [hiddenCols]);
    useEffect(() => { saveColOrder(colOrder); }, [colOrder]);

    // ── Orden de columnas de ubicación ──
    // Orden por defecto: TODAS las obras primero, luego las bodegas → las
    // bodegas quedan al final (a la derecha), como pidió RRHH. El usuario puede
    // arrastrar para reordenar; el orden custom se guarda en localStorage.
    const defaultOrderKeys = useMemo(() => [
        ...obras.map(o => `obra_${o.id}`),
        ...bodegas.map(b => `bodega_${b.id}`),
    ], [obras, bodegas]);

    const locationByKey = useMemo(() => {
        const m: Record<string, OrderedLocation> = {};
        obras.forEach(o => { m[`obra_${o.id}`] = { key: `obra_${o.id}`, type: 'obra', id: o.id, nombre: o.nombre, raw: o }; });
        bodegas.forEach(b => { m[`bodega_${b.id}`] = { key: `bodega_${b.id}`, type: 'bodega', id: b.id, nombre: b.nombre, raw: b }; });
        return m;
    }, [obras, bodegas]);

    // Orden efectivo: primero las claves guardadas que aún existen, luego las
    // nuevas (no guardadas) en su posición por defecto (obras antes que bodegas).
    const orderedKeys = useMemo(() => {
        const valid = new Set(defaultOrderKeys);
        const fromSaved = colOrder.filter(k => valid.has(k));
        const savedSet = new Set(fromSaved);
        const appended = defaultOrderKeys.filter(k => !savedSet.has(k));
        return [...fromSaved, ...appended];
    }, [colOrder, defaultOrderKeys]);

    const colsWithStock = useMemo(() => {
        const set = new Set<string>();
        for (const cat of categorias) {
            for (const item of cat.items) {
                for (const [key, ub] of Object.entries(item.ubicaciones)) {
                    if (ub && ub.cantidad > 0) set.add(key);
                }
            }
        }
        return set;
    }, [categorias]);

    // Lista unificada de columnas de ubicación en el orden actual, aplicando los
    // mismos filtros (ocultas + "ocultar vacías"). La tabla renderiza sobre esto.
    const orderedLocations = useMemo<OrderedLocation[]>(() =>
        orderedKeys
            .map(k => locationByKey[k])
            .filter(Boolean)
            .filter(loc => {
                if (hiddenCols.has(loc.key)) return false;
                if (hideEmpty && !colsWithStock.has(loc.key)) return false;
                return true;
            }),
    [orderedKeys, locationByKey, hiddenCols, hideEmpty, colsWithStock]);

    const searchLower = search.toLowerCase().trim();
    const filteredCategorias = useMemo(() => {
        let cats = categorias;
        
        if (selectedCategoryId !== null) {
            cats = cats.filter(c => c.id === selectedCategoryId);
        }

        if (searchLower) {
            cats = cats.map(cat => ({
                ...cat,
                items: cat.items.filter(item =>
                    item.descripcion.toLowerCase().includes(searchLower) ||
                    String(item.nro_item).includes(searchLower)
                )
            }));
        }

        return cats.filter(cat => cat.items.length > 0);
    }, [categorias, searchLower, selectedCategoryId]);

    const toggleCat = (catId: number) => {
        setCollapsedCats(prev => {
            const next = new Set(prev);
            next.has(catId) ? next.delete(catId) : next.add(catId);
            return next;
        });
    };

    const toggleCol = (key: string) => {
        setHiddenCols(prev => {
            const next = new Set(prev);
            next.has(key) ? next.delete(key) : next.add(key);
            return next;
        });
    };

    const restoreCols = () => {
        setHiddenCols(new Set());
        saveHiddenCols(new Set());
    };

    // Mueve la columna `activeKey` a la posición de `overKey` (drag & drop).
    // Persiste el orden COMPLETO para que sea estable entre sesiones.
    const moveCol = (activeKey: string, overKey: string) => {
        setColOrder(() => {
            const base = [...orderedKeys];
            const from = base.indexOf(activeKey);
            const to = base.indexOf(overKey);
            if (from < 0 || to < 0 || from === to) return base;
            const [moved] = base.splice(from, 1);
            base.splice(to, 0, moved);
            return base;
        });
    };

    // Restablece el orden por defecto (obras primero, bodegas al final).
    const restoreColOrder = () => {
        setColOrder([]);
        saveColOrder([]);
    };

    const isCustomOrder = colOrder.length > 0;

    return {
        collapsedCats, toggleCat,
        hiddenCols, toggleCol, restoreCols,
        hideEmpty, setHideEmpty,
        search, setSearch,
        selectedCategoryId, setSelectedCategoryId,
        showImages, setShowImages,
        colsWithStock,
        orderedLocations,
        moveCol,
        restoreColOrder,
        isCustomOrder,
        filteredCategorias,
        searchLower
    };
}
