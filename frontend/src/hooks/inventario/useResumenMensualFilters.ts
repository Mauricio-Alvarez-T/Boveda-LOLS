import { useState, useMemo, useEffect } from 'react';
import type { ResumenData } from './useInventarioData';

const STORAGE_KEY = 'inventario_resumen_hidden_cols';

function loadHiddenCols(): Set<string> {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch { return new Set(); }
}

function saveHiddenCols(set: Set<string>) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
}

export function useResumenMensualFilters(data: ResumenData) {
    const { obras, bodegas, categorias } = data;

    const [collapsedCats, setCollapsedCats] = useState<Set<number>>(new Set());
    const [hiddenCols, setHiddenCols] = useState<Set<string>>(loadHiddenCols);
    const [hideEmpty, setHideEmpty] = useState(false);
    const [search, setSearch] = useState('');
    const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
    const [showImages, setShowImages] = useState(false);

    useEffect(() => { saveHiddenCols(hiddenCols); }, [hiddenCols]);

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

    const visibleObras = useMemo(() =>
        obras.filter(o => {
            const key = `obra_${o.id}`;
            if (hiddenCols.has(key)) return false;
            if (hideEmpty && !colsWithStock.has(key)) return false;
            return true;
        }),
    [obras, hiddenCols, hideEmpty, colsWithStock]);

    const visibleBodegas = useMemo(() =>
        bodegas.filter(b => {
            const key = `bodega_${b.id}`;
            if (hiddenCols.has(key)) return false;
            if (hideEmpty && !colsWithStock.has(key)) return false;
            return true;
        }),
    [bodegas, hiddenCols, hideEmpty, colsWithStock]);

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

    return {
        collapsedCats, toggleCat,
        hiddenCols, toggleCol, restoreCols,
        hideEmpty, setHideEmpty,
        search, setSearch,
        selectedCategoryId, setSelectedCategoryId,
        showImages, setShowImages,
        colsWithStock,
        visibleObras,
        visibleBodegas,
        filteredCategorias,
        searchLower
    };
}
