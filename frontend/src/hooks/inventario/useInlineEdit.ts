import { useState, useCallback } from 'react';

interface InlineEditOptions {
    canEdit: boolean;
    onUpdateStock: (itemId: number, obraId: number | null, bodegaId: number | null, data: { cantidad: number }) => Promise<boolean>;
    onRefresh: () => void;
}

export function useInlineEdit({ canEdit, onUpdateStock, onRefresh }: InlineEditOptions) {
    const [editingCell, setEditingCell] = useState<string | null>(null);
    const [editValue, setEditValue] = useState('');

    const startEdit = useCallback((key: string, currentValue: number) => {
        if (!canEdit) return;
        setEditingCell(key);
        setEditValue(String(currentValue || ''));
    }, [canEdit]);

    const cancelEdit = useCallback(() => {
        setEditingCell(null);
        setEditValue('');
    }, []);

    const saveEdit = useCallback(async (itemId: number, obraId: number | null, bodegaId: number | null) => {
        const num = parseInt(editValue, 10);
        if (isNaN(num) || num < 0) {
            cancelEdit();
            return;
        }
        
        const ok = await onUpdateStock(itemId, obraId, bodegaId, { cantidad: num });
        if (ok) onRefresh();
        
        cancelEdit();
    }, [editValue, onUpdateStock, onRefresh, cancelEdit]);

    return {
        editingCell,
        editValue,
        setEditValue,
        startEdit,
        cancelEdit,
        saveEdit
    };
}
